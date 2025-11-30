import asyncio
import pathlib
from fastapi import FastAPI
import uvicorn

from p2p_uno import frontend

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello, World!"}

@app.get("/items/{item_id}")
async def read_item(item_id: int):
    return {"item_id": item_id, "message": f"This is item {item_id}"}

async def start_server():
    app.mount("/frontend", frontend.app)


    config = uvicorn.Config(app)
    server = uvicorn.Server(config)
    await server.serve()

def main():
    asyncio.run(start_server())


if __name__ == "__main__":
    main()