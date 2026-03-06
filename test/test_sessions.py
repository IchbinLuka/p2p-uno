import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

import p2p_uno.sessions as sessions


class DummySigned:
    def __init__(self, handle):
        self.handle = handle

    def model_dump_json(self):
        # The real signer returns a pydantic model's json; return the handle as JSON string
        return json.dumps(self.handle)


class DummySigner:
    def sign_handle(self, handle):
        return DummySigned(handle)


class DummyIceProvider:
    def get_ice_servers(self, name: str):
        # Return an empty list of ICE servers for tests
        return []


def test_create_session():
    signer = DummySigner()
    ice = DummyIceProvider()
    app = sessions.create_app(signer, ice)  # type: ignore
    client = TestClient(app)

    resp = client.post("/", json={"session_name": "test-session", "max_players": 4})
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_name"] == "test-session"
    assert data["player_count"] == 0
    assert data["max_players"] == 4
    # session should exist in the module-level SESSIONS mapping
    assert data["session_id"] in app.sessions


def test_get_sessions_returns_created_sessions():
    signer = DummySigner()
    ice = DummyIceProvider()
    app = sessions.create_app(signer, ice)  # type: ignore
    client = TestClient(app)

    # create two sessions
    resp1 = client.post("/", json={"session_name": "s1", "max_players": 4})
    resp2 = client.post("/", json={"session_name": "s2", "max_players": 2})
    assert resp1.status_code == 200
    assert resp2.status_code == 200

    list_resp = client.get("/", params={"skip": 0, "limit": 10})
    assert list_resp.status_code == 200
    sessions_list = list_resp.json()
    # both sessions are empty and not started, so they should be returned
    assert any(s["session_name"] == "s1" for s in sessions_list)
    assert any(s["session_name"] == "s2" for s in sessions_list)


def test_name_available_reflects_players():
    signer = DummySigner()
    ice = DummyIceProvider()
    app = sessions.create_app(signer, ice)  # type: ignore
    client = TestClient(app)

    resp = client.post("/", json={"session_name": "avail-test", "max_players": 3})
    assert resp.status_code == 200
    data = resp.json()
    session_id = data["session_id"]

    avail = client.get(f"/{session_id}/available", params={"name": "alice"})
    assert avail.status_code == 200
    assert avail.json() == {"available": True}

    # Add a player key to the session and check availability again
    app.sessions[session_id].players["alice"] = SimpleNamespace()  # type: ignore
    avail2 = client.get(f"/{session_id}/available", params={"name": "alice"})
    assert avail2.status_code == 200
    assert avail2.json() == {"available": False}
