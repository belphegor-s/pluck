from __future__ import annotations

import hashlib
import hmac
import time

import pytest

from pluckai import WebhookVerificationError, construct_event, verify_webhook

SECRET = "whsec_test"
BODY = '{"id":"whd_1","event":"webhook.test","deliveredAt":"2026-09-23T00:00:00Z","data":{}}'


def sign(body: str, secret: str = SECRET, t: int | None = None) -> str:
    t = int(time.time()) if t is None else t
    mac = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={mac}"


def test_matches_the_server_signature_format():
    # Same construction as signWebhook in packages/runtime: HMAC-SHA256 over "<t>.<body>".
    header = sign(BODY, t=1790136710)
    assert verify_webhook(BODY, header, SECRET, now=1790136710)
    assert verify_webhook(BODY.encode(), header, SECRET, now=1790136710)


def test_known_vector():
    # Produced by Node's createHmac exactly as the worker signs, so a change on
    # either side is caught rather than only checking self-consistency.
    header = "t=1700000000,v1=d6ec8cb2e751cafd6c95dae2fad0b0246ea6f8254c38e3ef57d5b25daa20662e"
    assert verify_webhook(BODY, header, SECRET, now=1700000000)


def test_rejects_tampering_and_wrong_secrets():
    header = sign(BODY)
    assert not verify_webhook(BODY.replace("test", "fake"), header, SECRET)
    assert not verify_webhook(BODY, header, "whsec_other")


def test_rejects_stale_signatures():
    old = int(time.time()) - 3600
    assert not verify_webhook(BODY, sign(BODY, t=old), SECRET)
    assert verify_webhook(BODY, sign(BODY, t=old), SECRET, tolerance_seconds=7200)


@pytest.mark.parametrize("header", [None, "", "garbage", "t=abc,v1=00", "t=1", "v1=abc"])
def test_rejects_malformed_headers(header):
    assert not verify_webhook(BODY, header, SECRET)


def test_construct_event():
    event = construct_event(BODY, sign(BODY), SECRET)
    assert event.event == "webhook.test"
    assert event.delivered_at == "2026-09-23T00:00:00Z"
    with pytest.raises(WebhookVerificationError):
        construct_event(BODY, sign(BODY, secret="other"), SECRET)
