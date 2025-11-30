import asyncio
import pathlib
from fastapi import FastAPI
import uvicorn

from p2p_uno.app import app

async def start_server():
    config = uvicorn.Config(app)
    server = uvicorn.Server(config)
    await server.serve()

def main():
    asyncio.run(start_server())


if __name__ == "__main__":
    main()