from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

from ._errors import PluckError
from ._response import PluckObject

SIGNATURE_HEADER = "pluck-signature"
DEFAULT_TOLERANCE_SECONDS = 300


class WebhookVerificationError(PluckError):
    """The webhook's signature is missing, malformed, stale or wrong."""


def _parse(header: str) -> dict[str, str]:
    parts: dict[str, str] = {}
    for item in header.split(","):
        key, sep, value = item.strip().partition("=")
        if sep:
            parts[key] = value
    return parts


def verify_webhook(
    body: str | bytes,
    signature: str | None,
    secret: str,
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: float | None = None,
) -> bool:
    """Check a ``pluck-signature`` header against the raw request body.

    Pass the body exactly as received: parsing and re-serialising JSON changes
    its bytes and the signature no longer matches. Signatures older than
    ``tolerance_seconds`` are rejected, so a captured request cannot be replayed.
    """
    if not signature or not secret:
        return False
    parts = _parse(signature)
    try:
        timestamp = int(parts.get("t", ""))
    except ValueError:
        return False
    given = parts.get("v1")
    if not given:
        return False
    current = time.time() if now is None else now
    if abs(current - timestamp) > tolerance_seconds:
        return False
    raw = body.encode() if isinstance(body, str) else body
    expected = hmac.new(
        secret.encode(), str(timestamp).encode() + b"." + raw, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, given)


def construct_event(
    body: str | bytes,
    signature: str | None,
    secret: str,
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
) -> Any:
    """Verify a webhook and return its parsed event, or raise.

    The event has ``id``, ``event`` (e.g. ``monitor.changed``), ``delivered_at``
    and ``data``. Deliveries can repeat, so deduplicate on ``id``.
    """
    if not verify_webhook(body, signature, secret, tolerance_seconds=tolerance_seconds):
        raise WebhookVerificationError("Webhook signature did not verify.")
    return PluckObject(json.loads(body))
