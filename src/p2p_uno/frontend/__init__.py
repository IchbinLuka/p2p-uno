import argparse
import asyncio
import os

import uvicorn
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from p2p_uno import ROOT
from p2p_uno.util import setup_logging


def build_app(matchmaking_url: str):
    app = FastAPI()

    static_dir = ROOT / "frontend" / "dist"

    if not static_dir.exists():
        raise FileNotFoundError(
            f"{static_dir} does not exist. Frontend will not be served."
        )

    app.mount(
        "/assets",
        StaticFiles(directory=ROOT / "frontend" / "dist" / "assets"),
        name="static",
    )
    templates = Jinja2Templates(directory=ROOT / "frontend" / "dist")

    @app.get("/")
    async def index(request: Request):
        return templates.TemplateResponse(
            request,
            name="index.html",
            context={"mm_server_url": matchmaking_url},
        )

    @app.get("/mm_server")
    async def mm_server():
        return {"mm_server_url": matchmaking_url}

    return app


async def start_server(app: FastAPI, host: str, port: int):
    config = uvicorn.Config(app, host=host, port=port)
    server = uvicorn.Server(config)
    await server.serve()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", default=8080, type=int, help="Port to bind to")
    parser.add_argument(
        "--matchmaking-url",
        type=str,
        help="URL of the matchmaking server",
        required=True,
    )
    args = parser.parse_args()
    setup_logging()

    app = build_app(args.matchmaking_url)

    asyncio.run(
        start_server(
            app=app,
            host=args.host,
            port=args.port,
        )
    )
