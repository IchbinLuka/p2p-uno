import argparse
import asyncio
import random
import uuid

import pydantic
import uvicorn
import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from p2p_uno import sessions
from p2p_uno.sessions import Session
from p2p_uno.signatures import HandleSigner
from p2p_uno.turn import IceServerProvider, TurnConfig
from p2p_uno.util import setup_logging


def http_args(parser: argparse.ArgumentParser):
    parser.add_argument("--host", type=str, default="localhost")
    parser.add_argument("--port", type=int, default=8000)


def turn_args(parser: argparse.ArgumentParser):
    parser.add_argument("--turn-config", type=str, required=False)


def debug_args(parser: argparse.ArgumentParser):
    parser.add_argument("--fill-sessions", type=int, default=0)


def generate_keypair(args: argparse.Namespace):
    signer = HandleSigner.generate()
    if args.out:
        signer.export_file(args.out, args.pub)
    else:
        priv, pub = signer.export_b64()
        print(f"Private key:\n{priv}\nPublic key:\n{pub}")


async def start_server():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    gen_keypair = subparsers.add_parser("gen-keypair", help="Generate a new keypair")
    gen_keypair.add_argument(
        "--out", type=str, required=False, help="Path to save private key"
    )
    gen_keypair.add_argument(
        "--pub", type=str, required=False, help="Path to save public key"
    )

    start = subparsers.add_parser("start", help="Start the server")
    start.add_argument(
        "--key",
        type=str,
        required=True,
        help="Private key of the server. This can be generated using `uno-mms gen_keypair`",
    )

    turn_args(start)
    debug_args(start)
    http_args(start)

    args = parser.parse_args()

    # If the user requested keypair generation, handle it and exit
    if args.command == "gen-keypair":
        generate_keypair(args)
        return

    if args.turn_config:
        with open(args.turn_config, "r") as f:
            turn_config = pydantic.TypeAdapter(dict[str, TurnConfig]).validate_python(
                yaml.load(f, Loader=yaml.Loader)
            )
    else:
        turn_config = None
    # Initialize provider
    ice_servers = IceServerProvider(turn_config)

    app = FastAPI()

    # TODO: This needs to be changed for production
    origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    sessions_app = sessions.create_app(HandleSigner.load_file(args.key), ice_servers)

    for _ in range(args.fill_sessions):
        max_players = random.randint(3, 10)
        name = random.choice(["Alice", "Bob", "Charlie", "David", "Eve"])
        session_id = uuid.uuid4()
        session = Session(
            session_id=str(session_id),
            name=name,
            max_players=max_players,
        )
        sessions_app.sessions[str(session_id)] = session

    app.mount(
        "/sessions",
        sessions_app,
    )
    config = uvicorn.Config(app, host=args.host, port=args.port)
    server = uvicorn.Server(config)
    await server.serve()


def main():
    setup_logging()
    asyncio.run(start_server())


if __name__ == "__main__":
    main()
