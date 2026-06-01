"""Tests for the FPL data-fetching layer."""

import pytest
import requests

from fpl_analytics_engine import app


class _FakeResponse:
    """Minimal stand-in for a requests.Response."""

    def __init__(self, payload: dict | list) -> None:
        self._payload = payload
        self.raise_for_status_called = False

    def raise_for_status(self) -> None:
        self.raise_for_status_called = True

    def json(self) -> dict | list:
        return self._payload


def test_get_fpl_data_returns_decoded_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {"teams": [{"id": 1}], "elements": [{"id": 100}]}
    fake_response = _FakeResponse(payload)

    # Capture the call arguments to assert the URL and timeout are passed.
    def fake_get(url: str, headers: dict, timeout: int) -> _FakeResponse:
        assert url == app.BOOTSTRAP_ENDPOINT
        assert timeout == app.REQUEST_TIMEOUT_SECONDS
        return fake_response

    monkeypatch.setattr(app.requests, "get", fake_get)

    result = app.get_fpl_data()

    assert result == payload
    # The fetch must surface HTTP errors before returning.
    assert fake_response.raise_for_status_called


def test_get_player_history_returns_history_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    history = [{"round": 1, "total_points": 6}, {"round": 2, "total_points": 2}]
    payload = {"history": history, "fixtures": [], "history_past": []}

    def fake_get(url: str, headers: dict, timeout: int) -> _FakeResponse:
        assert "element-summary/100/" in url
        return _FakeResponse(payload)

    monkeypatch.setattr(app.requests, "get", fake_get)

    assert app.get_player_history(100) == history


def test_get_fixtures_returns_fixture_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = [{"event": 1, "team_h": 1, "team_a": 2}, {"event": 1}]

    def fake_get(url: str, headers: dict, timeout: int) -> _FakeResponse:
        assert url == app.FIXTURES_ENDPOINT
        return _FakeResponse(payload)

    monkeypatch.setattr(app.requests, "get", fake_get)

    assert app.get_fixtures() == payload


def test_get_entry_event_picks_returns_public_entry_picks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return a public entry's picks payload for a gameweek."""
    payload = {"picks": [{"element": 100, "position": 1}]}

    def fake_get(url: str, headers: dict, timeout: int) -> _FakeResponse:
        assert "entry/123/event/4/picks/" in url
        return _FakeResponse(payload)

    monkeypatch.setattr(app.requests, "get", fake_get)

    assert app.get_entry_event_picks(123, 4) == payload


def test_get_json_retries_on_transient_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {"ok": True}
    calls = {"count": 0}

    def flaky_get(url: str, headers: dict, timeout: int) -> _FakeResponse:
        calls["count"] += 1
        if calls["count"] == 1:
            raise requests.ConnectionError("transient")
        return _FakeResponse(payload)

    monkeypatch.setattr(app.requests, "get", flaky_get)
    # Avoid real backoff sleeps during the test.
    monkeypatch.setattr(app.time, "sleep", lambda _seconds: None)

    result = app._get_json("https://example.test/")

    assert result == payload
    assert calls["count"] == 2
