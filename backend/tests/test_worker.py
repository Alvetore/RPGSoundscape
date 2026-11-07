import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from yt_worker import extract_cobalt_media_url, get_cobalt_apis, is_safe_media_url


def test_cobalt_tunnel_url_is_extracted():
    assert extract_cobalt_media_url(
        {"status": "tunnel", "url": "https://example.com/audio.mp3"}
    ) == "https://example.com/audio.mp3"


def test_cobalt_picker_url_is_extracted():
    assert extract_cobalt_media_url(
        {"status": "picker", "picker": [{"url": "https://example.com/audio.m4a"}]}
    ) == "https://example.com/audio.m4a"


def test_cobalt_error_is_raised():
    try:
        extract_cobalt_media_url(
            {"status": "error", "error": {"code": "error.api.youtube.login"}}
        )
    except RuntimeError as exc:
        assert "youtube.login" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")


def test_unsafe_media_urls_are_rejected():
    assert not is_safe_media_url("file:///C:/Windows/win.ini")
    assert not is_safe_media_url("http://127.0.0.1:8000/api/audio/x.mp3")
    assert is_safe_media_url("https://example.com/audio.mp3")


def test_cobalt_can_be_disabled(monkeypatch):
    monkeypatch.setenv("RPG_COBALT_APIS", "0")
    assert get_cobalt_apis() == []
