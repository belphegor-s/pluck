"""Every API operation is reachable from the SDK.

``operations.json`` is written from the endpoint registry by
``scripts/sdk-ops.mjs``, and a test in ``packages/shared`` fails when it falls
behind. This side fails when the SDK falls behind the list.
"""

import json
import re
from pathlib import Path

import httpx

from pluckai import Pluck

OPERATIONS = json.loads((Path(__file__).parent / "operations.json").read_text())
ID = "id_123"


def test_every_operation_is_covered():
    seen = set()

    def handler(req):
        path = re.sub(rf"/{ID}(?=/|$)", "/{id}", req.url.path)
        seen.add((req.method, path))
        return httpx.Response(200, json={"data": {}, "meta": {}})

    pluck = Pluck(
        "pk_test",
        base_url="https://api.test",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    url = "https://example.com"
    pluck.scrape(url)
    pluck.parse(url=url)
    pluck.map(url)
    pluck.screenshot(url)
    pluck.search("q")
    pluck.extract(url, prompt="p")
    pluck.product(url)
    pluck.products(url)
    pluck.styleguide(url)
    pluck.brand("example.com")
    pluck.classify(domain="example.com")
    pluck.transaction("SQ *SHOP")
    pluck.usage()
    pluck.crawl.start(url)
    pluck.crawl.get(ID)
    pluck.crawl.cancel(ID)
    pluck.monitors.create(url)
    pluck.monitors.list()
    pluck.monitors.get(ID)
    pluck.monitors.update(ID, active=False)
    pluck.monitors.delete(ID)
    pluck.monitors.changes(ID)
    pluck.webhooks.deliveries()
    pluck.webhooks.redeliver(ID)
    pluck.webhooks.test(url)

    expected = {(op["method"], op["path"]) for op in OPERATIONS}
    missing = sorted(expected - seen)
    unknown = sorted(seen - expected)
    assert not missing, f"operations with no SDK method: {missing}"
    assert not unknown, f"SDK calls operations the API does not have: {unknown}"
