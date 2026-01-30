from fastapi import FastAPI

from p2p_uno import frontend, sessions

app = FastAPI()


@app.get("/")
async def root():
    return {"message": "Hello, World!"}


app.mount("/frontend", frontend.app)
app.mount("/sessions", sessions.app)
