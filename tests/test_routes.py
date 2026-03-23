# tests/test_routes.py
import asyncio
import json
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from main import app


@pytest.mark.asyncio
async def test_start_returns_session_id():
    with patch("src.api.routes.invoice.run_agent", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/v1/invoice/start", json={"user_id": "u1", "transcript": "test"})
        await asyncio.sleep(0)
    assert resp.status_code == 200
    assert "session_id" in resp.json()


@pytest.mark.asyncio
async def test_stream_404_for_unknown_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/api/v1/invoice/stream?session_id=nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reply_404_for_unknown_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/invoice/reply", json={"session_id": "nonexistent", "reply": "20"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reply_409_when_session_not_awaiting():
    from src.sessions.manager import session_store
    sid = session_store.create("u1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/invoice/reply", json={"session_id": sid, "reply": "20"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_stream_receives_event_pushed_to_queue():
    from src.sessions.manager import session_store
    with patch("src.api.routes.invoice.run_agent", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/v1/invoice/start", json={"user_id": "u1", "transcript": "test"})
    sid = resp.json()["session_id"]

    await session_store.push_event(sid, {"type": "done", "invoice_id": "inv-1"})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        async with ac.stream("GET", f"/api/v1/invoice/stream?session_id={sid}") as s:
            assert "text/event-stream" in s.headers["content-type"]
            lines = []
            async for line in s.aiter_lines():
                if line.startswith("data:"):
                    lines.append(json.loads(line[5:].strip()))
                    break

    assert lines[0]["type"] == "done"


@pytest.mark.asyncio
async def test_transcribe_returns_transcript(monkeypatch):
    """Audio transcribe endpoint is reachable at /api/v1/audio/transcribe."""
    from unittest.mock import MagicMock, AsyncMock as AM
    import src.api.routes.audio as audio_mod

    mock_client = MagicMock()
    mock_transcription = MagicMock()
    mock_transcription.text = "Invoice for Jean Dupont"
    mock_client.audio.transcriptions.create = AM(return_value=mock_transcription)
    monkeypatch.setattr(audio_mod, "_openai_client", lambda: mock_client)

    import io
    audio_bytes = b"fake_audio_data"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/audio/transcribe",
            files={"audio": ("test.webm", io.BytesIO(audio_bytes), "audio/webm")},
        )
    assert resp.status_code == 200
    assert resp.json()["transcript"] == "Invoice for Jean Dupont"
