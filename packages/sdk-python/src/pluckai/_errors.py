from __future__ import annotations

from typing import Any


class PluckError(Exception):
    """Base class for every error this library raises."""


class APIError(PluckError):
    """The API answered with an error.

    ``code`` is the stable machine-readable reason (``insufficient_credits``,
    ``target_timeout``, ...); ``request_id`` is what to quote in a bug report.
    """

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        request_id: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.details = details

    def __str__(self) -> str:
        suffix = f" (request {self.request_id})" if self.request_id else ""
        return f"{self.code}: {self.message}{suffix}"

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}(status={self.status!r}, code={self.code!r}, "
            f"message={self.message!r}, request_id={self.request_id!r})"
        )


class BadRequestError(APIError):
    """400: the request was malformed or failed validation."""


class AuthenticationError(APIError):
    """401: the API key is missing, wrong or revoked."""


class InsufficientCreditsError(APIError):
    """402: the account has no credits left for this call."""


class PermissionDeniedError(APIError):
    """403: not allowed, e.g. a private address or a robots.txt block."""


class NotFoundError(APIError):
    """404: no such resource on this account."""


class TargetError(APIError):
    """424: the page being read failed: unreachable, blocked or too slow."""


class RateLimitError(APIError):
    """429: too many requests; retried automatically before this is raised."""


class InternalServerError(APIError):
    """5xx: the API failed; retried automatically before this is raised."""


class APIConnectionError(PluckError):
    """The API could not be reached at all."""


class APITimeoutError(APIConnectionError):
    """The API did not answer within the client's timeout."""


_BY_STATUS: dict[int, type[APIError]] = {
    400: BadRequestError,
    401: AuthenticationError,
    402: InsufficientCreditsError,
    403: PermissionDeniedError,
    404: NotFoundError,
    424: TargetError,
    429: RateLimitError,
}


def error_for(
    status: int, code: str, message: str, request_id: str | None, details: Any
) -> APIError:
    cls = _BY_STATUS.get(status) or (InternalServerError if status >= 500 else APIError)
    return cls(status, code, message, request_id, details)
