"""Expose the FastAPI app as a Vercel Python function."""

from fastapi import FastAPI

from fpl_analytics_engine.api import app as api_app

app = FastAPI()
app.mount("/api", api_app)
