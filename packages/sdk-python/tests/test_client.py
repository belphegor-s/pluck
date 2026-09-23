import json

import httpx
import pytest

from pluckai import (
    AsyncPluck,
    AuthenticationError,
    InsufficientCreditsError,
    InternalServerError,
    Pluck,
    PluckError,
    RateLimitError,
)

META = {"requestId": "req_1", "creditsUsed": 1, "cached": False, "durationMs": 12}


def ok(data, status=200):
    return httpx.Response(status, json={"data": data, "meta": META})


def fail(status, code, message="nope"):
    return httpx.Response(
        status, json={"error": {"code": code, "message": message, "requestId": "req_err"}}
    )


def client(handler, **kwargs):
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return Pluck("pk_test", base_url="https://api.test", http_client=http, **kwargs)


def test_needs_a_key(monkeypatch):
    monkeypatch.delenv("PLUCK_API_KEY", raising=False)
    with pytest.raises(PluckError, match="PLUCK_API_KEY"):
        Pluck()


def test_reads_key_and_url_from_env(monkeypatch):
    monkeypatch.setenv("PLUCK_API_KEY", "pk_env")
    monkeypatch.setenv("PLUCK_API_URL", "http://localhost:8080/")
    seen = {}

    def handler(req):
        seen["auth"] = req.headers["authorization"]
        seen["url"] = str(req.url)
        return ok({"balance": 5})

    pluck = Pluck(http_client=httpx.Client(transport=httpx.MockTransport(handler)))
    pluck.usage()
    assert seen == {"auth": "Bearer pk_env", "url": "http://localhost:8080/v1/usage"}


def test_scrape_sends_camel_case_and_reads_both_spellings():
    seen = {}

    def handler(req):
        seen["method"] = req.method
        seen["path"] = req.url.path
        seen["body"] = json.loads(req.content)
        return ok({"markdown": "# Hi", "renderedWith": "http", "metadata": {"ogTitle": "Hi"}})

    page = client(handler).scrape(
        "https://example.com", formats=["markdown"], only_main_content=True, wait_for=None
    )
    assert seen["method"] == "POST"
    assert seen["path"] == "/v1/scrape"
    # None means "not set", so it is left out rather than sent as null.
    assert seen["body"] == {
        "url": "https://example.com",
        "formats": ["markdown"],
        "onlyMainContent": True,
    }
    assert page.markdown == "# Hi"
    assert page["markdown"] == "# Hi"
    assert page.rendered_with == page.renderedWith == "http"
    assert page.metadata.og_title == "Hi"
    assert page.meta.credits_used == 1
    assert page.meta.request_id == "req_1"
    assert json.loads(json.dumps(page)) == {
        "markdown": "# Hi",
        "renderedWith": "http",
        "metadata": {"ogTitle": "Hi"},
    }


def test_unknown_attribute_raises_attribute_error():
    page = client(lambda req: ok({"markdown": ""})).scrape("https://example.com")
    with pytest.raises(AttributeError):
        _ = page.nothing_here
    assert getattr(page, "nothing_here", "fallback") == "fallback"


def test_nested_objects_are_sent_as_given():
    seen = {}

    def handler(req):
        seen["body"] = json.loads(req.content)
        return ok({"url": "u", "data": {}})

    schema = {"type": "object", "properties": {"unit_price": {"type": "number"}}}
    client(handler).extract("https://shop.test", schema=schema, prompt="prices")
    assert seen["body"]["schema"] == schema


def test_get_endpoints_use_query_params():
    seen = {}

    def handler(req):
        seen["url"] = req.url
        return ok({"domain": "stripe.com"})

    client(handler).brand("stripe.com", max_age=3600)
    assert seen["url"].path == "/v1/brand"
    assert dict(seen["url"].params) == {"domain": "stripe.com", "maxAge": "3600"}


def test_llm_headers():
    seen = {}

    def handler(req):
        seen.update(req.headers)
        return ok({"url": "u", "data": {}})

    llm = {"provider": "openai", "api_key": "sk-x", "model": "gpt-5", "base_url": "https://llm"}
    client(handler, llm=llm).extract("https://example.com", prompt="title")
    assert seen["x-llm-provider"] == "openai"
    assert seen["x-llm-key"] == "sk-x"
    assert seen["x-llm-model"] == "gpt-5"
    assert seen["x-llm-base-url"] == "https://llm"


@pytest.mark.parametrize(
    ("status", "code", "cls"),
    [
        (401, "invalid_api_key", AuthenticationError),
        (402, "insufficient_credits", InsufficientCreditsError),
    ],
)
def test_errors_are_typed(status, code, cls):
    pluck = client(lambda req: fail(status, code, "no"))
    with pytest.raises(cls) as info:
        pluck.scrape("https://example.com")
    assert info.value.status == status
    assert info.value.code == code
    assert info.value.request_id == "req_err"
    assert "req_err" in str(info.value)


def test_non_json_error_still_raises():
    pluck = client(lambda req: httpx.Response(502, text="<html>bad gateway</html>"), max_retries=0)
    with pytest.raises(InternalServerError) as info:
        pluck.usage()
    assert info.value.code == "internal"


def test_retries_rate_limits_then_succeeds(monkeypatch):
    monkeypatch.setattr("pluckai._client.time.sleep", lambda s: None)
    calls = []

    def handler(req):
        calls.append(1)
        return fail(429, "rate_limited") if len(calls) < 3 else ok({"balance": 1})

    assert client(handler).usage().balance == 1
    assert len(calls) == 3


def test_gives_up_after_max_retries(monkeypatch):
    monkeypatch.setattr("pluckai._client.time.sleep", lambda s: None)
    calls = []

    def handler(req):
        calls.append(1)
        return fail(429, "rate_limited")

    with pytest.raises(RateLimitError):
        client(handler, max_retries=1).usage()
    assert len(calls) == 2


def test_does_not_retry_a_500_on_a_write(monkeypatch):
    # The call may have done its work and charged before failing.
    monkeypatch.setattr("pluckai._client.time.sleep", lambda s: None)
    calls = []

    def handler(req):
        calls.append(1)
        return fail(500, "internal")

    with pytest.raises(InternalServerError):
        client(handler).scrape("https://example.com")
    assert len(calls) == 1


def test_parse_uploads_a_file(tmp_path):
    seen = {}

    def handler(req):
        seen["body"] = json.loads(req.content)
        return ok({"markdown": "text"})

    doc = tmp_path / "report.pdf"
    doc.write_bytes(b"%PDF-1.7")
    client(handler).parse(file=doc)
    assert seen["body"] == {"base64": "JVBERi0xLjc=", "filename": "report.pdf"}

    with pytest.raises(PluckError):
        client(handler).parse()


def test_monitor_update_can_clear_fields():
    seen = {}

    def handler(req):
        seen["method"] = req.method
        seen["path"] = req.url.path
        seen["body"] = json.loads(req.content)
        return ok({"id": "mon_1"})

    client(handler).monitors.update("mon_1", webhook=None, interval_minutes=60)
    assert seen["method"] == "PATCH"
    assert seen["path"] == "/v1/monitors/mon_1"
    assert seen["body"] == {"webhook": None, "intervalMinutes": 60}


def test_webhook_endpoints():
    paths = []

    def handler(req):
        paths.append((req.method, req.url.path))
        return ok({"deliveries": [], "nextCursor": None})

    pluck = client(handler)
    pluck.webhooks.deliveries(limit=5)
    pluck.webhooks.redeliver("whd_1")
    pluck.webhooks.test("https://hooks.test")
    assert paths == [
        ("GET", "/v1/webhooks/deliveries"),
        ("POST", "/v1/webhooks/deliveries/whd_1/redeliver"),
        ("POST", "/v1/webhooks/test"),
    ]


def test_crawl_run_waits_and_collects_every_page(monkeypatch):
    monkeypatch.setattr("pluckai._client.time.sleep", lambda s: None)
    polls = {"n": 0}

    def handler(req):
        if req.method == "POST":
            return ok({"id": "crawl_1", "status": "queued"})
        params = dict(req.url.params)
        if params.get("limit") == "1":
            polls["n"] += 1
            status = "running" if polls["n"] < 3 else "completed"
            return ok({"id": "crawl_1", "status": status, "pages": [], "nextCursor": None})
        if "cursor" not in params:
            return ok({"id": "crawl_1", "status": "completed", "pages": [1, 2], "nextCursor": "c2"})
        return ok({"id": "crawl_1", "status": "completed", "pages": [3], "nextCursor": None})

    result = client(handler).crawl.run("https://example.com", limit=3)
    assert result.status == "completed"
    assert result.pages == [1, 2, 3]
    assert "nextCursor" not in result


def test_logo_url_needs_no_request():
    pluck = client(lambda req: pytest.fail("no request expected"))
    assert pluck.logo_url("stripe.com", size=64) == "https://api.test/v1/logo/stripe.com?size=64"


async def test_async_client():
    seen = {}

    async def handler(req):
        seen["path"] = req.url.path
        return ok({"results": [{"url": "https://a.test"}]})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with AsyncPluck("pk_test", base_url="https://api.test", http_client=http) as pluck:
        res = await pluck.search("pluck api", limit=3)
        await pluck.monitors.get("mon_1")
    assert res.results[0].url == "https://a.test"
    assert seen["path"] == "/v1/monitors/mon_1"
