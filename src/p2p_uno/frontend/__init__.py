import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from p2p_uno import ROOT

app = FastAPI()

static_dir = ROOT / "frontend" / "dist"

if static_dir.exists():
    app.mount("/", StaticFiles(directory=ROOT / "frontend" / "dist"), name="static")
else:
    print(f"{static_dir} does not exist. Frontend will not be served.")