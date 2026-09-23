"""Python client for the Pluck web context API.

>>> from pluckai import Pluck
>>> pluck = Pluck()  # reads PLUCK_API_KEY
>>> page = pluck.scrape("https://example.com")
>>> print(page.markdown)
"""

from ._client import DEFAULT_BASE_URL, AsyncPluck, Pluck
from ._errors import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InsufficientCreditsError,
    InternalServerError,
    NotFoundError,
    PermissionDeniedError,
    PluckError,
    RateLimitError,
    TargetError,
)
from ._response import PluckObject, PluckResponse, ResponseMeta
from ._version import __version__
from ._webhooks import (
    SIGNATURE_HEADER,
    WebhookVerificationError,
    construct_event,
    verify_webhook,
)

__all__ = [
    "DEFAULT_BASE_URL",
    "SIGNATURE_HEADER",
    "APIConnectionError",
    "APIError",
    "APITimeoutError",
    "AsyncPluck",
    "AuthenticationError",
    "BadRequestError",
    "InsufficientCreditsError",
    "InternalServerError",
    "NotFoundError",
    "PermissionDeniedError",
    "Pluck",
    "PluckError",
    "PluckObject",
    "PluckResponse",
    "RateLimitError",
    "ResponseMeta",
    "TargetError",
    "WebhookVerificationError",
    "__version__",
    "construct_event",
    "verify_webhook",
]
