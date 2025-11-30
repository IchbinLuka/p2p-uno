from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from p2p_uno import ROOT

app = FastAPI()

app.mount("/", StaticFiles(directory=ROOT / "frontend" / "dist"), name="static")