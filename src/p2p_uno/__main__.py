import argparse
import asyncio
import random
import uuid

import uvicorn
import yaml
from fastapi.middleware.cors import CORSMiddleware

from p2p_uno.app import app
from p2p_uno.sessions import SESSIONS, Session
from p2p_uno.turn import IceServerProvider, TurnConfig
from p2p_uno.util import setup_logging


def http_args(parser: argparse.ArgumentParser):
    parser.add_argument("--host", type=str, default="localhost")
    parser.add_argument("--port", type=int, default=8080)


def turn_args(parser: argparse.ArgumentParser):
    parser.add_argument("--turn-config", type=str, required=False)


def debug_args(parser: argparse.ArgumentParser):
    parser.add_argument("--fill-sessions", type=int, default=0)


async def start_server():
    parser = argparse.ArgumentParser()
    turn_args(parser)
    debug_args(parser)
    http_args(parser)
    args = parser.parse_args()
    for _ in range(args.fill_sessions):
        max_players = random.randint(3, 10)
        name = random.choice(["Alice", "Bob", "Charlie", "David", "Eve"])
        session_id = uuid.uuid4()
        session = Session(
            session_id=str(session_id),
            name=name,
            max_players=max_players,
        )
        SESSIONS[str(session_id)] = session

    if args.turn_config:
        with open(args.turn_config, "r") as f:
            turn_config = TurnConfig.model_validate(yaml.load(f, Loader=yaml.Loader))
    else:
        turn_config = None
    # Initialize provider
    IceServerProvider(turn_config)

    # TODO: This needs to be changed for production
    origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    config = uvicorn.Config(app, host=args.host, port=args.port)
    server = uvicorn.Server(config)
    await server.serve()


def main():
    setup_logging()
    asyncio.run(start_server())


if __name__ == "__main__":
    main()
