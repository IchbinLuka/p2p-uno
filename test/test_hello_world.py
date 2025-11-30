from fastapi import FastAPI
from fastapi.testclient import TestClient

from p2p_uno.app import app


def test_hello_world():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello, World!"}