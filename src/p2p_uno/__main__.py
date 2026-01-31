import argparse
import asyncio
import random
import uuid

import uvicorn
from fastapi.middleware.cors import CORSMiddleware

from p2p_uno.app import app
from p2p_uno.sessions import SESSIONS, Session
from p2p_uno.util import setup_logging


def debug_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fill-sessions", type=int, default=0)
    return parser.parse_args()


async def start_server():
    args = debug_args()
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

    # TODO: This needs to be changed for production
    origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    config = uvicorn.Config(app)
    server = uvicorn.Server(config)
    await server.serve()


def main():
    setup_logging()
    asyncio.run(start_server())


if __name__ == "__main__":
    main()
