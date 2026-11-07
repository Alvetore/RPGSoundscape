import io
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_STORAGE = Path(tempfile.mkdtemp(prefix="rpg_soundscape_test_"))
os.environ["RPG_DATA_DIR"] = str(TEST_STORAGE)
os.environ["RPG_API_TOKEN"] = "test-token"

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import app as backend  # noqa: E402  (must be imported after env setup)

TOKEN_HEADERS = {"X-RPG-Token": "test-token"}


@pytest.fixture()
def client():
    with TestClient(backend.app) as test_client:
        yield test_client


@pytest.fixture(scope="session", autouse=True)
def cleanup_storage():
    yield
    shutil.rmtree(TEST_STORAGE, ignore_errors=True)


def test_health_is_public(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_api_requires_token(client):
    response = client.get("/api/library")
    assert response.status_code == 401


def test_root_requires_token(client):
    response = client.get("/")
    assert response.status_code == 401


def test_token_query_sets_cookie_and_authorizes_api(client):
    # /api/info is enough: the middleware sets the HttpOnly cookie on any
    # authorized response, and the test does not require a built frontend.
    response = client.get("/api/info?token=test-token")
    assert response.status_code == 200
    assert "rpg_api_token" in response.cookies

    library = client.get("/api/library")
    assert library.status_code == 200
    assert isinstance(library.json(), list)


def test_token_header_authorizes_api(client):
    response = client.get("/api/library", headers=TOKEN_HEADERS)
    assert response.status_code == 200


@pytest.mark.parametrize(
    "path",
    [
        "/api/audio/..%5C..%5Cpackage.json",
        "/api/audio/..%2F..%2Fpackage.json",
        "/api/audio/C:%5CWindows%5Cwin.ini",
    ],
)
def test_audio_path_traversal_is_blocked(client, path):
    response = client.get(path, headers=TOKEN_HEADERS)
    assert response.status_code == 404


def test_httponly_cookie_export_is_detected(tmp_path):
    cookie_file = tmp_path / "cookies.txt"
    cookie_file.write_text(
        "# Netscape HTTP Cookie File\n"
        "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tabc\n"
        "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\n"
        "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tSSID\tabc\n",
        encoding="utf-8",
    )

    info = backend.inspect_cookie_file(cookie_file)
    assert info["cookie_count"] == 3
    assert info["has_login_info"] is True
    assert info["is_authenticated"] is True
    assert info["auth_status"] == "valid"


def test_preset_crud(client):
    payload = {
        "name": "Test scene",
        "description": "created by pytest",
        "category": "Custom",
        "icon": "beer",
        "slots": [
            {
                "slotIndex": 0,
                "title": "Campfire",
                "filename": "campfire_crackles.wav",
                "volume": 0.5,
                "loop": True,
                "active": True,
                "pan": 0.0,
                "playbackRate": 1.0,
            }
        ],
    }

    created = client.post("/api/presets", json=payload, headers=TOKEN_HEADERS)
    assert created.status_code == 200
    preset = created.json()
    assert preset["id"]
    assert preset["slots"][0]["filename"] == "campfire_crackles.wav"

    presets = client.get("/api/presets", headers=TOKEN_HEADERS).json()
    assert any(item["id"] == preset["id"] for item in presets)

    deleted = client.delete(f"/api/presets/{preset['id']}", headers=TOKEN_HEADERS)
    assert deleted.status_code == 200
    presets = client.get("/api/presets", headers=TOKEN_HEADERS).json()
    assert all(item["id"] != preset["id"] for item in presets)


def test_preset_rejects_invalid_slot_index(client):
    payload = {
        "name": "Broken scene",
        "slots": [{"slotIndex": 99, "volume": 0.5}],
    }
    response = client.post("/api/presets", json=payload, headers=TOKEN_HEADERS)
    assert response.status_code == 422


def test_upload_then_delete_track(client):
    fake_mp3 = b"ID3" + b"\x00" * 2048
    response = client.post(
        "/api/upload",
        headers=TOKEN_HEADERS,
        data={"category": "Local", "tags": "test,upload"},
        files={"file": ("pytest_track.mp3", fake_mp3, "audio/mpeg")},
    )
    assert response.status_code == 200
    track = response.json()
    assert track["filesize"] == len(fake_mp3)
    assert (backend.LIBRARY_DIR / track["filename"]).is_file()

    deleted = client.delete(f"/api/library/{track['id']}", headers=TOKEN_HEADERS)
    assert deleted.status_code == 200
    assert not (backend.LIBRARY_DIR / track["filename"]).exists()


def test_library_export_contains_audio_and_presets(client):
    fake_mp3 = b"ID3" + b"\x00" * 4096
    uploaded = client.post(
        "/api/upload",
        headers=TOKEN_HEADERS,
        data={"category": "Local", "tags": "export,test"},
        files={"file": ("pytest_export_track.mp3", fake_mp3, "audio/mpeg")},
    )
    assert uploaded.status_code == 200
    track = uploaded.json()

    preset = client.post(
        "/api/presets",
        json={
            "name": "Export scene",
            "slots": [{"slotIndex": 0, "filename": track["filename"], "volume": 0.8}],
        },
        headers=TOKEN_HEADERS,
    )
    assert preset.status_code == 200

    response = client.get("/api/library/export", headers=TOKEN_HEADERS)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert int(response.headers["x-rpg-tracks"]) >= 1

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = archive.namelist()
    assert "manifest.json" in names
    assert "library.json" in names
    assert "presets.json" in names
    assert f"audio/{track['filename']}" in names
    assert archive.read(f"audio/{track['filename']}") == fake_mp3

    manifest = json.loads(archive.read("manifest.json"))
    assert manifest["format"] == "rpg-soundscape-library"
    assert manifest["tracks"] >= 1
    assert manifest["presets"] >= 1

    exported_library = json.loads(archive.read("library.json"))
    assert any(item["id"] == track["id"] for item in exported_library)

    client.delete(f"/api/presets/{preset.json()['id']}", headers=TOKEN_HEADERS)
    client.delete(f"/api/library/{track['id']}", headers=TOKEN_HEADERS)


def test_youtube_info_rejects_non_http_url(client):
    response = client.post(
        "/api/youtube/info",
        json={"url": "file:///C:/Windows/win.ini"},
        headers=TOKEN_HEADERS,
    )
    assert response.status_code == 400


def test_websocket_relays_remote_command_to_host():
    host_client = TestClient(backend.app, client=("127.0.0.1", 50100))
    remote_client = TestClient(backend.app, client=("192.168.1.50", 50101))

    with host_client.websocket_connect("/ws?role=host&token=test-token") as host_ws:
        with remote_client.websocket_connect("/ws?role=remote&token=test-token") as remote_ws:
            remote_ws.send_json(
                {"type": "command", "command": {"type": "togglePlay", "slotIndex": 3}}
            )
            forwarded = host_ws.receive_json()
            assert forwarded["type"] == "command"
            assert forwarded["command"]["type"] == "togglePlay"
            assert forwarded["command"]["slotIndex"] == 3

            host_ws.send_json(
                {
                    "type": "state",
                    "state": {
                        "channels": [{"id": 0, "title": "Track", "isPlaying": True}],
                        "masterVolume": 0.5,
                        "masterMuted": False,
                    },
                }
            )
            state_message = None
            for _ in range(5):
                candidate = remote_ws.receive_json()
                if candidate.get("type") == "state":
                    state_message = candidate
                    break
            assert state_message is not None
            assert state_message["state"]["masterVolume"] == 0.5


def test_remote_cannot_connect_as_host():
    remote_client = TestClient(backend.app, client=("192.168.1.50", 50102))
    with pytest.raises(Exception):
        with remote_client.websocket_connect("/ws?role=host&token=test-token"):
            pass


def test_websocket_requires_token():
    local_client = TestClient(backend.app, client=("127.0.0.1", 50103))
    with pytest.raises(Exception):
        with local_client.websocket_connect("/ws?role=host"):
            pass
