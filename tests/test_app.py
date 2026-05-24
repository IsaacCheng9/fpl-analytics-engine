"""Tests for the FPL data-fetching layer."""

import pytest

from fpl_analytics_engine import app


class _FakeResponse:
    """Minimal stand-in for a requests.Response."""

    def __init__(self, payload: dict) -> None:
        self._payload = payload
        self.raise_for_status_called = False

    def raise_for_status(self) -> None:
        self.raise_for_status_called = True

    def json(self) -> dict:
        return self._payload


def test_get_fpl_data_returns_decoded_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {"teams": [{"id": 1}], "elements": [{"id": 100}]}
    fake_response = _FakeResponse(payload)

    # Capture the call arguments to assert the URL and timeout are passed.
    def fake_get(url: str, timeout: int) -> _FakeResponse:
        assert url == app.FPL_BASE_URL
        assert timeout == app.REQUEST_TIMEOUT_SECONDS
        return fake_response

    monkeypatch.setattr(app.requests, "get", fake_get)

    result = app.get_fpl_data()

    assert result == payload
    # The fetch must surface HTTP errors before returning.
    assert fake_response.raise_for_status_called
