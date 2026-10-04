"""Tests for the Vercel deployment entrypoint."""

import importlib
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import quote

import polars as pl
import pytest
from fastapi.testclient import TestClient

from fpl_analytics_engine import api as backend_api
from fpl_analytics_engine import vercel as vercel_entrypoint


def _history() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "element": [1],
            "round": [1],
            "kickoff_time": ["2025-08-01T15:00:00Z"],
            "minutes": [90],
            "total_points": [5],
            "value": [50],
            "expected_goals": [0.1],
            "expected_assists": [0.2],
            "expected_goal_involvements": [0.3],
            "expected_goals_conceded": [1.0],
            "web_name": ["Saka"],
            "position": ["MID"],
            "team_name": ["Arsenal"],
            "defcon_hit": [False],
        },
        schema_overrides={"defcon_hit": pl.Boolean},
    )


@pytest.fixture
def client() -> Iterator[TestClient]:
    backend_api.app.dependency_overrides[backend_api.get_history] = _history
    yield TestClient(vercel_entrypoint.app)
    backend_api.app.dependency_overrides.clear()


def test_vercel_entrypoint_mounts_api_prefix(client: TestClient) -> None:
    response = client.get("/api/")

    assert response.status_code == 200
    assert response.json()["latest_gw"] == 1


def test_vercel_entrypoint_imports_from_vercel_module_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.syspath_prepend(str(Path.cwd()))

    entrypoint = importlib.import_module("src.fpl_analytics_engine.vercel")

    assert entrypoint.app is not None


def test_vercel_entrypoint_imports_with_src_pythonpath() -> None:
    command = (
        "import importlib; importlib.import_module('src.fpl_analytics_engine.vercel')"
    )
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            command,
        ],
        check=False,
        cwd=Path.cwd(),
        env={"PYTHONPATH": "src"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_vercel_entrypoint_serves_frontend_dist(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text("<div id='root'></div>", encoding="utf-8")
    (assets / "app.js").write_text("console.log('ok')", encoding="utf-8")
    (dist / "robots.txt").write_text("User-agent: *", encoding="utf-8")

    app = vercel_entrypoint.create_app(dist)
    static_client = TestClient(app)

    root = static_client.get("/")
    nested = static_client.get("/players/1")
    asset = static_client.get("/assets/app.js")
    public_file = static_client.get("/robots.txt")

    assert root.status_code == 200
    assert "<div id='root'></div>" in root.text
    assert nested.status_code == 200
    assert "<div id='root'></div>" in nested.text
    assert asset.status_code == 200
    assert asset.text == "console.log('ok')"
    assert public_file.status_code == 200
    assert public_file.text == "User-agent: *"


@pytest.mark.parametrize(
    "path",
    ["/..%2Fprivate.txt", "/%2E%2E/private.txt", "/nested/..%2F..%2Fprivate.txt"],
)
def test_vercel_frontend_rejects_directory_traversal(tmp_path: Path, path: str) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("Frontend", encoding="utf-8")
    (tmp_path / "private.txt").write_text("Private data", encoding="utf-8")
    client = TestClient(vercel_entrypoint.create_app(dist))

    response = client.get(path)

    assert response.status_code == 404
    assert "Private data" not in response.text


@pytest.mark.parametrize("directory", [False, True])
def test_vercel_frontend_rejects_symlink_escapes(
    tmp_path: Path, directory: bool
) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("Frontend", encoding="utf-8")
    private = tmp_path / "private.txt"
    private.write_text("Private data", encoding="utf-8")
    (dist / "escape").symlink_to(tmp_path if directory else private)
    client = TestClient(vercel_entrypoint.create_app(dist))

    response = client.get("/escape/private.txt" if directory else "/escape")

    assert response.status_code == 404
    assert "Private data" not in response.text


def test_vercel_frontend_rejects_index_symlink_escape(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    private = tmp_path / "private.txt"
    private.write_text("Private data", encoding="utf-8")
    (dist / "index.html").symlink_to(private)
    client = TestClient(vercel_entrypoint.create_app(dist))

    response = client.get("/players/1")

    assert response.status_code == 404
    assert "Private data" not in response.text


def test_vercel_frontend_rejects_assets_directory_escape(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("Frontend", encoding="utf-8")
    (tmp_path / "private.txt").write_text("Private data", encoding="utf-8")
    (dist / "assets").symlink_to(tmp_path)
    client = TestClient(vercel_entrypoint.create_app(dist))

    response = client.get("/assets/private.txt")

    assert response.status_code == 404
    assert "Private data" not in response.text


def test_vercel_frontend_rejects_absolute_and_sibling_paths(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("Frontend", encoding="utf-8")
    sibling = tmp_path / "dist-private"
    sibling.mkdir()
    private = sibling / "private.txt"
    private.write_text("Private data", encoding="utf-8")
    client = TestClient(vercel_entrypoint.create_app(dist))

    for path in [f"/{quote(str(private), safe='')}", "/..%2Fdist-private/private.txt"]:
        response = client.get(path)

        assert response.status_code == 404
        assert "Private data" not in response.text


def test_vercel_frontend_allows_internal_symlinks(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("Frontend", encoding="utf-8")
    public = dist / "public.txt"
    public.write_text("Public data", encoding="utf-8")
    (dist / "alias.txt").symlink_to(public)
    client = TestClient(vercel_entrypoint.create_app(dist))

    response = client.get("/alias.txt")

    assert response.status_code == 200
    assert response.text == "Public data"


def test_vercel_frontend_rejects_invalid_paths(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("Frontend", encoding="utf-8")
    client = TestClient(vercel_entrypoint.create_app(dist))

    response = client.get("/%00")

    assert response.status_code == 404


def test_vercel_api_reads_are_cdn_cacheable(client: TestClient) -> None:
    response = client.get("/api/")

    assert response.headers[vercel_entrypoint.CDN_CACHE_HEADER] == (
        vercel_entrypoint.CDN_CACHE_CONTROL
    )


def test_vercel_api_errors_are_not_cdn_cacheable(client: TestClient) -> None:
    response = client.get("/api/players/form", params={"window": 0})

    assert response.status_code == 422
    assert vercel_entrypoint.CDN_CACHE_HEADER not in response.headers


def test_vercel_live_team_imports_are_not_cdn_cacheable(client: TestClient) -> None:
    pick = {
        "element": 1,
        "position": 1,
        "multiplier": 2,
        "is_captain": True,
        "is_vice_captain": False,
    }

    def fetch_picks(entry_id: int, event: int) -> dict:
        return {"picks": [pick]}

    overrides = backend_api.app.dependency_overrides
    overrides[backend_api.get_entry_picks_fetcher] = lambda: fetch_picks

    response = client.get("/api/fpl-team/123")

    assert response.status_code == 200
    assert vercel_entrypoint.CDN_CACHE_HEADER not in response.headers


def test_vercel_frontend_is_not_cdn_cacheable(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("Frontend", encoding="utf-8")
    client = TestClient(vercel_entrypoint.create_app(dist))

    response = client.get("/")

    assert response.status_code == 200
    assert vercel_entrypoint.CDN_CACHE_HEADER not in response.headers
