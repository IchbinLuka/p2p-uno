import argparse
import asyncio
import os

import pydantic
import uvicorn
import yaml
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from p2p_uno import ROOT
from p2p_uno.util import setup_logging


class MMServer(pydantic.BaseModel):
    name: str
    url: str
    secure: bool


def build_app(matchmaking_config: dict[str, MMServer]):
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
            context={"mm_server_url": matchmaking_config},
        )

    @app.get("/mm_servers")
    async def mm_server() -> dict[str, MMServer]:
        return matchmaking_config

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
        "--matchmaking-config",
        type=str,
        help="Path to a matchmaking server config",
        required=True,
    )
    args = parser.parse_args()
    setup_logging()

    with open(args.matchmaking_config, "r") as f:
        mm_config = yaml.load(f, Loader=yaml.SafeLoader)
    if not isinstance(mm_config, dict):
        raise ValueError("Matchmaking config must be a dictionary")
    mm_config_parsed = {
        key: MMServer.model_validate(value) for key, value in mm_config.items()
    }

    app = build_app(mm_config_parsed)

    asyncio.run(
        start_server(
            app=app,
            host=args.host,
            port=args.port,
        )
    )
