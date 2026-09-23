from __future__ import annotations

import asyncio
import base64
import os
import random
import time
from collections.abc import Awaitable, Mapping
from pathlib import Path
from typing import (
    Any,
    Generic,
    TypeVar,
    Union,
)
from urllib.parse import quote

import httpx

from ._errors import APIConnectionError, APITimeoutError, PluckError, error_for
from ._response import PluckResponse, to_camel
from ._version import __version__

DEFAULT_BASE_URL = "https://pluck-api.procd.cc"
DEFAULT_TIMEOUT = 180.0
DEFAULT_MAX_RETRIES = 2

# Statuses worth another try. A 500 on a write is not retried: the call may
# have done its work and charged for it before failing.
_RETRY_ALWAYS = {408, 429, 502, 503, 504}
_RETRY_IF_SAFE = {500}

FileInput = Union[str, "os.PathLike[str]", bytes]

R = TypeVar("R")

_LLM_HEADERS = {
    "provider": "x-llm-provider",
    "api_key": "x-llm-key",
    "model": "x-llm-model",
    "base_url": "x-llm-base-url",
}


def _body(fields: Mapping[str, Any]) -> dict[str, Any]:
    """Top-level keyword arguments become the API's camelCase field names.

    Nested objects (``scrape_options``, ``schema``, ``headers``) are sent as
    given, because some of them are the caller's own data.
    """
    return {to_camel(k): v for k, v in fields.items() if v is not None}


def _backoff(attempt: int, retry_after: str | None) -> float:
    if retry_after:
        try:
            return min(60.0, max(0.0, float(retry_after)))
        except ValueError:
            pass
    return min(8.0, 0.5 * 2**attempt) * (0.8 + random.random() * 0.4)


def _read_file(file: FileInput, filename: str | None) -> tuple[str, str | None]:
    if isinstance(file, bytes):
        return base64.b64encode(file).decode(), filename
    path = Path(file)
    return base64.b64encode(path.read_bytes()).decode(), filename or path.name


class _Config:
    def __init__(
        self,
        api_key: str | None,
        base_url: str | None,
        llm: Mapping[str, str] | None,
        timeout: float,
        max_retries: int,
    ) -> None:
        key = api_key or os.environ.get("PLUCK_API_KEY")
        if not key:
            raise PluckError(
                "No API key. Pass api_key=... or set PLUCK_API_KEY. "
                "Keys are at https://pluck.procd.cc/dashboard/keys"
            )
        self.api_key = key
        self.base_url = (base_url or os.environ.get("PLUCK_API_URL") or DEFAULT_BASE_URL).rstrip(
            "/"
        )
        self.timeout = timeout
        self.max_retries = max(0, max_retries)
        self.headers = {
            "authorization": f"Bearer {key}",
            "user-agent": f"pluck-sdk-python/{__version__}",
            "accept": "application/json",
        }
        for field, header in _LLM_HEADERS.items():
            value = (llm or {}).get(field)
            if value:
                self.headers[header] = value

    def should_retry(self, method: str, status: int) -> bool:
        return status in _RETRY_ALWAYS or (method == "GET" and status in _RETRY_IF_SAFE)

    @staticmethod
    def parse(res: httpx.Response) -> PluckResponse:
        try:
            payload = res.json()
        except ValueError:
            payload = None
        error = payload.get("error") if isinstance(payload, dict) else None
        if res.is_success and isinstance(payload, dict) and "data" in payload and not error:
            return PluckResponse(payload["data"], payload.get("meta"))
        error = error if isinstance(error, dict) else {}
        raise error_for(
            res.status_code,
            error.get("code") or ("internal" if res.status_code >= 500 else "bad_request"),
            error.get("message") or f"HTTP {res.status_code}",
            error.get("requestId") or res.headers.get("x-request-id"),
            error.get("details"),
        )


class _Endpoints(Generic[R]):
    """Every endpoint, written once for both clients.

    ``_call`` returns a response in ``Pluck`` and an awaitable in
    ``AsyncPluck``, so these methods do not need two copies.
    """

    def _call(
        self,
        method: str,
        path: str,
        *,
        body: Mapping[str, Any] | None = None,
        query: Mapping[str, Any] | None = None,
    ) -> R:
        raise NotImplementedError

    # Reading pages

    def scrape(self, url: str, **options: Any) -> R:
        """Read one page as markdown, HTML, text, links, images or structured JSON.

        >>> page = pluck.scrape("https://example.com", formats=["markdown", "links"])
        >>> page.markdown
        """
        return self._call("POST", "/v1/scrape", body=_body({"url": url, **options}))

    def parse(
        self,
        *,
        url: str | None = None,
        file: FileInput | None = None,
        filename: str | None = None,
        content_type: str | None = None,
    ) -> R:
        """Turn a PDF, DOCX or other document into markdown, from a URL or a file.

        ``file`` is a path or raw bytes; it is uploaded inline, so keep it
        under the API's body limit.
        """
        if (url is None) == (file is None):
            raise PluckError("parse() takes exactly one of url= or file=.")
        fields: dict[str, Any] = {"url": url, "content_type": content_type, "filename": filename}
        if file is not None:
            fields["base64"], fields["filename"] = _read_file(file, filename)
        return self._call("POST", "/v1/parse", body=_body(fields))

    def map(self, url: str, **options: Any) -> R:
        """List a site's URLs from its sitemap and links, without reading them."""
        return self._call("POST", "/v1/map", body=_body({"url": url, **options}))

    def screenshot(self, url: str, **options: Any) -> R:
        """Capture a page as an image; ``.screenshot`` is a URL to it."""
        return self._call("POST", "/v1/screenshot", body=_body({"url": url, **options}))

    def search(self, query: str, **options: Any) -> R:
        """Search the web; ``scrape={"formats": ["markdown"]}`` reads each result too."""
        return self._call("POST", "/v1/search", body=_body({"query": query, **options}))

    # Structured data

    def extract(self, url: str, **options: Any) -> R:
        """Pull fields out of a page with a JSON ``schema``, a ``prompt``, or both."""
        return self._call("POST", "/v1/extract", body=_body({"url": url, **options}))

    def product(self, url: str, **options: Any) -> R:
        """One product page as name, price, currency, images and availability."""
        return self._call("POST", "/v1/extract/product", body=_body({"url": url, **options}))

    def products(self, url: str, **options: Any) -> R:
        """Every product on a listing or category page."""
        return self._call("POST", "/v1/extract/products", body=_body({"url": url, **options}))

    def styleguide(self, url: str, **options: Any) -> R:
        """A site's colours, type, radii, shadows and CSS variables."""
        return self._call("POST", "/v1/styleguide", body=_body({"url": url, **options}))

    # Companies

    def brand(self, domain: str | None = None, **options: Any) -> R:
        """Logo, colours, socials and description for a ``domain``, ``email``, ``name`` or
        ``ticker``."""
        return self._call("GET", "/v1/brand", query=_body({"domain": domain, **options}))

    def classify(self, **options: Any) -> R:
        """NAICS and SIC codes for a ``domain`` or a ``description``."""
        return self._call("POST", "/v1/brand/classify", body=_body(options))

    def transaction(self, descriptor: str, **options: Any) -> R:
        """The merchant behind a card statement line such as ``"SQ *BLUE BOTTLE"``."""
        return self._call(
            "POST", "/v1/brand/transaction", body=_body({"descriptor": descriptor, **options})
        )

    def logo_url(self, domain: str, *, size: int = 128, format: str | None = None) -> str:
        """A public logo URL. Makes no request and costs no credits."""
        cfg: _Config = self._config  # type: ignore[attr-defined]
        query = f"size={size}" + (f"&format={format}" if format else "")
        return f"{cfg.base_url}/v1/logo/{quote(domain, safe='')}?{query}"

    # Account

    def usage(self, *, days: int | None = None) -> R:
        """Credit balance and per-endpoint usage for the last ``days`` days."""
        return self._call("GET", "/v1/usage", query=_body({"days": days}))


class _Crawl(Generic[R]):
    def __init__(self, client: _Endpoints[R]) -> None:
        self._client = client

    def start(self, url: str, **options: Any) -> R:
        """Start a crawl in the background; poll ``get`` or pass ``webhook=``."""
        return self._client._call("POST", "/v1/crawl", body=_body({"url": url, **options}))

    def get(self, id: str, *, cursor: str | None = None, limit: int | None = None) -> R:
        """A crawl's progress and one page of its results."""
        return self._client._call(
            "GET", f"/v1/crawl/{id}", query=_body({"cursor": cursor, "limit": limit})
        )

    def cancel(self, id: str) -> R:
        return self._client._call("DELETE", f"/v1/crawl/{id}")


class _Monitors(Generic[R]):
    def __init__(self, client: _Endpoints[R]) -> None:
        self._client = client

    def create(self, url: str, *, type: str = "page", **options: Any) -> R:
        """Watch a ``page``, a ``sitemap`` or an ``extract`` for changes."""
        return self._client._call(
            "POST", "/v1/monitors", body=_body({"url": url, "type": type, **options})
        )

    def list(self, *, cursor: str | None = None, limit: int | None = None) -> R:
        return self._client._call(
            "GET", "/v1/monitors", query=_body({"cursor": cursor, "limit": limit})
        )

    def get(self, id: str) -> R:
        return self._client._call("GET", f"/v1/monitors/{id}")

    def update(self, id: str, **changes: Any) -> R:
        """Change a monitor. Only the fields passed are touched; passing
        ``webhook=None`` or ``selector=None`` removes it."""
        body = {to_camel(k): v for k, v in changes.items()}
        return self._client._call("PATCH", f"/v1/monitors/{id}", body=body)

    def delete(self, id: str) -> R:
        return self._client._call("DELETE", f"/v1/monitors/{id}")

    def changes(self, id: str, *, cursor: str | None = None, limit: int | None = None) -> R:
        """Recorded changes, newest first, each with its diff."""
        return self._client._call(
            "GET", f"/v1/monitors/{id}/changes", query=_body({"cursor": cursor, "limit": limit})
        )


class _Webhooks(Generic[R]):
    def __init__(self, client: _Endpoints[R]) -> None:
        self._client = client

    def deliveries(self, *, cursor: str | None = None, limit: int | None = None) -> R:
        """Every webhook sent in the last 30 days, with its last response."""
        return self._client._call(
            "GET", "/v1/webhooks/deliveries", query=_body({"cursor": cursor, "limit": limit})
        )

    def redeliver(self, id: str) -> R:
        """Send a delivery again with its original payload and a fresh signature."""
        return self._client._call("POST", f"/v1/webhooks/deliveries/{id}/redeliver")

    def test(self, url: str) -> R:
        """Send a signed ``webhook.test`` event to ``url``."""
        return self._client._call("POST", "/v1/webhooks/test", body={"url": url})


_TERMINAL = {"completed", "failed", "cancelled"}


class Pluck(_Endpoints[PluckResponse]):
    """Client for the Pluck API.

    >>> from pluckai import Pluck
    >>> pluck = Pluck()  # reads PLUCK_API_KEY
    >>> pluck.scrape("https://example.com").markdown

    ``llm={"provider": "openai", "api_key": "sk-..."}`` brings your own model
    for AI endpoints; the key is sent per request and never stored.
    """

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str | None = None,
        llm: Mapping[str, str] | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._config = _Config(api_key, base_url, llm, timeout, max_retries)
        self._owns_http = http_client is None
        self._http = http_client or httpx.Client(timeout=timeout)
        self.crawl = SyncCrawl(self)
        self.monitors = _Monitors[PluckResponse](self)
        self.webhooks = _Webhooks[PluckResponse](self)

    def _call(
        self,
        method: str,
        path: str,
        *,
        body: Mapping[str, Any] | None = None,
        query: Mapping[str, Any] | None = None,
    ) -> PluckResponse:
        cfg = self._config
        attempt = 0
        while True:
            try:
                res = self._http.request(
                    method,
                    cfg.base_url + path,
                    headers=cfg.headers,
                    params=query,
                    json=body,
                    timeout=cfg.timeout,
                )
            except httpx.TimeoutException as err:
                if isinstance(err, httpx.ConnectTimeout) and attempt < cfg.max_retries:
                    time.sleep(_backoff(attempt, None))
                    attempt += 1
                    continue
                raise APITimeoutError(f"{method} {path} timed out after {cfg.timeout}s") from err
            except httpx.TransportError as err:
                if attempt < cfg.max_retries:
                    time.sleep(_backoff(attempt, None))
                    attempt += 1
                    continue
                raise APIConnectionError(f"Could not reach {cfg.base_url}: {err}") from err
            if cfg.should_retry(method, res.status_code) and attempt < cfg.max_retries:
                time.sleep(_backoff(attempt, res.headers.get("retry-after")))
                attempt += 1
                continue
            return cfg.parse(res)

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def __enter__(self) -> Pluck:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


class SyncCrawl(_Crawl[PluckResponse]):
    def run(
        self,
        url: str,
        *,
        poll_interval: float = 2.0,
        max_wait: float | None = None,
        **options: Any,
    ) -> PluckResponse:
        """Start a crawl, wait for it to finish and return it with every page.

        Raises ``TimeoutError`` after ``max_wait`` seconds; the crawl keeps
        running and can still be read with ``get``.
        """
        job = self.start(url, **options)
        deadline = None if max_wait is None else time.monotonic() + max_wait
        status = self.get(job.id, limit=1)
        while status.status not in _TERMINAL:
            if deadline is not None and time.monotonic() > deadline:
                raise TimeoutError(f"Crawl {job.id} still {status.status} after {max_wait}s.")
            time.sleep(poll_interval)
            status = self.get(job.id, limit=1)
        pages: list[Any] = []
        cursor: str | None = None
        while True:
            batch = self.get(job.id, cursor=cursor, limit=100)
            pages.extend(batch.pages)
            cursor = batch.next_cursor
            if not cursor:
                break
        status["pages"] = pages
        status.pop("nextCursor", None)
        return status


class AsyncPluck(_Endpoints[Awaitable[PluckResponse]]):
    """The same client for ``asyncio``: every method is awaited.

    >>> async with AsyncPluck() as pluck:
    ...     page = await pluck.scrape("https://example.com")
    """

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str | None = None,
        llm: Mapping[str, str] | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._config = _Config(api_key, base_url, llm, timeout, max_retries)
        self._owns_http = http_client is None
        self._http = http_client or httpx.AsyncClient(timeout=timeout)
        self.crawl = AsyncCrawl(self)
        self.monitors = _Monitors[Awaitable[PluckResponse]](self)
        self.webhooks = _Webhooks[Awaitable[PluckResponse]](self)

    async def _call(  # type: ignore[override]
        self,
        method: str,
        path: str,
        *,
        body: Mapping[str, Any] | None = None,
        query: Mapping[str, Any] | None = None,
    ) -> PluckResponse:
        cfg = self._config
        attempt = 0
        while True:
            try:
                res = await self._http.request(
                    method,
                    cfg.base_url + path,
                    headers=cfg.headers,
                    params=query,
                    json=body,
                    timeout=cfg.timeout,
                )
            except httpx.TimeoutException as err:
                if isinstance(err, httpx.ConnectTimeout) and attempt < cfg.max_retries:
                    await asyncio.sleep(_backoff(attempt, None))
                    attempt += 1
                    continue
                raise APITimeoutError(f"{method} {path} timed out after {cfg.timeout}s") from err
            except httpx.TransportError as err:
                if attempt < cfg.max_retries:
                    await asyncio.sleep(_backoff(attempt, None))
                    attempt += 1
                    continue
                raise APIConnectionError(f"Could not reach {cfg.base_url}: {err}") from err
            if cfg.should_retry(method, res.status_code) and attempt < cfg.max_retries:
                await asyncio.sleep(_backoff(attempt, res.headers.get("retry-after")))
                attempt += 1
                continue
            return cfg.parse(res)

    async def close(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    async def __aenter__(self) -> AsyncPluck:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()


class AsyncCrawl(_Crawl[Awaitable[PluckResponse]]):
    async def run(
        self,
        url: str,
        *,
        poll_interval: float = 2.0,
        max_wait: float | None = None,
        **options: Any,
    ) -> PluckResponse:
        """Start a crawl, wait for it to finish and return it with every page."""
        job = await self.start(url, **options)
        deadline = None if max_wait is None else time.monotonic() + max_wait
        status = await self.get(job.id, limit=1)
        while status.status not in _TERMINAL:
            if deadline is not None and time.monotonic() > deadline:
                raise TimeoutError(f"Crawl {job.id} still {status.status} after {max_wait}s.")
            await asyncio.sleep(poll_interval)
            status = await self.get(job.id, limit=1)
        pages: list[Any] = []
        cursor: str | None = None
        while True:
            batch = await self.get(job.id, cursor=cursor, limit=100)
            pages.extend(batch.pages)
            cursor = batch.next_cursor
            if not cursor:
                break
        status["pages"] = pages
        status.pop("nextCursor", None)
        return status
