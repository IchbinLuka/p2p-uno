import asyncio

import uvicorn
from fastapi.middleware.cors import CORSMiddleware

from p2p_uno.app import app
from p2p_uno.util import setup_logging


async def start_server():
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
