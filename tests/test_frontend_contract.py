"""Check that the frontend's API types match the backend response schemas."""

import re
from pathlib import Path

import pytest
from pydantic import BaseModel

from fpl_analytics_engine import schemas

API_TS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "api.ts"
# Response models whose TypeScript interface uses a different name.
TS_NAMES = {"ApiMeta": "Meta"}
INTERFACE = re.compile(
    r"(?:export )?interface (\w+)(?: extends (\w+))? \{(.*?)\n\}", re.DOTALL
)
FIELD = re.compile(r"^\s*(\w+)\??:", re.MULTILINE)


def _interface_fields() -> dict[str, set[str]]:
    """Parse each exported interface's fields, including inherited ones."""
    own: dict[str, tuple[str | None, set[str]]] = {}
    for name, parent, body in INTERFACE.findall(API_TS.read_text()):
        own[name] = (parent or None, set(FIELD.findall(body)))

    def resolve(name: str) -> set[str]:
        parent, fields = own[name]
        return fields | (resolve(parent) if parent else set())

    return {name: resolve(name) for name in own}


RESPONSE_MODELS = sorted(
    (
        model
        for model in vars(schemas).values()
        if isinstance(model, type)
        and issubclass(model, BaseModel)
        and model is not BaseModel
        and model.__module__ == schemas.__name__
    ),
    key=lambda model: model.__name__,
)


@pytest.mark.parametrize("model", RESPONSE_MODELS, ids=lambda model: model.__name__)
def test_frontend_interface_matches_response_schema(model: type[BaseModel]) -> None:
    interfaces = _interface_fields()
    ts_name = TS_NAMES.get(model.__name__, model.__name__)
    assert ts_name in interfaces, f"frontend/src/api.ts has no {ts_name} interface"

    backend = set(model.model_fields)
    frontend = interfaces[ts_name]
    assert frontend == backend, (
        f"{ts_name} drifted from {model.__name__}: "
        f"missing in frontend {sorted(backend - frontend)}, "
        f"unknown to backend {sorted(frontend - backend)}"
    )
