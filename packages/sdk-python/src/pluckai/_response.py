from __future__ import annotations

from typing import Any


def to_camel(name: str) -> str:
    """``only_main_content`` -> ``onlyMainContent``; camelCase passes through."""
    head, *rest = name.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in rest)


def wrap(value: Any) -> Any:
    if isinstance(value, dict) and not isinstance(value, PluckObject):
        return PluckObject(value)
    if isinstance(value, list):
        return [wrap(v) for v in value]
    return value


class PluckObject(dict):
    """A JSON object from the API that also reads as attributes.

    It is a real ``dict``, so ``json.dumps`` and ``obj["markdown"]`` work
    unchanged. Attributes accept the API's camelCase name or its snake_case
    spelling, so ``page.rendered_with`` and ``page.renderedWith`` are the same.
    """

    def __init__(self, data: dict | None = None) -> None:
        super().__init__({k: wrap(v) for k, v in (data or {}).items()})

    def __getattr__(self, name: str) -> Any:
        if name.startswith("__"):
            raise AttributeError(name)
        if name in self:
            return self[name]
        camel = to_camel(name)
        if camel in self:
            return self[camel]
        raise AttributeError(f"{type(self).__name__} has no field {name!r}")

    def __dir__(self) -> list[str]:
        return sorted(set(super().__dir__()) | {k for k in self if k.isidentifier()})


class ResponseMeta(PluckObject):
    """``request_id``, ``credits_used``, ``cached`` and ``duration_ms`` of one call."""


class PluckResponse(PluckObject):
    """An endpoint's ``data``, with the call's metadata on ``.meta``."""

    meta: ResponseMeta

    def __init__(self, data: dict | None, meta: dict | None) -> None:
        super().__init__(data)
        object.__setattr__(self, "meta", ResponseMeta(meta))

    def __repr__(self) -> str:
        return f"PluckResponse({dict.__repr__(self)}, meta={dict.__repr__(self.meta)})"
