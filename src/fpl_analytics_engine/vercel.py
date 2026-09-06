"""Expose the production FastAPI app for Vercel."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from fpl_analytics_engine.api import app as api_app

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "frontend" / "dist"


def create_app(dist: Path = DIST) -> FastAPI:
    """Create the Vercel ASGI app."""
    dist = dist.resolve()
    vercel_app = FastAPI()
    vercel_app.mount("/api", api_app)

    index = (dist / "index.html").resolve()
    if not index.is_relative_to(dist) or not index.is_file():
        return vercel_app

    assets = (dist / "assets").resolve()
    if assets.is_relative_to(dist) and assets.is_dir():
        vercel_app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @vercel_app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        """Serve the built Vite app with SPA fallback routing."""
        try:
            file_path = (dist / path).resolve()
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=404) from exc
        if not file_path.is_relative_to(dist):
            raise HTTPException(status_code=404)
        if path and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(index)

    return vercel_app


app = create_app()
