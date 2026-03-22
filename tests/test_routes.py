# tests/test_routes.py
import asyncio
import json
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from main import app


@pytest.mark.asyncio
async def test_start_returns_session_id():
    with patch("src.api.routes.run_agent", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/invoice/start", json={"user_id": "u1", "transcript": "test"})
    assert resp.status_code == 200
    assert "session_id" in resp.json()


@pytest.mark.asyncio
async def test_stream_404_for_unknown_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/api/invoice/stream?session_id=nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reply_404_for_unknown_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/invoice/reply", json={"session_id": "nonexistent", "reply": "20"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reply_409_when_session_not_awaiting():
    from src.sessions.manager import session_store
    sid = session_store.create("u1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/invoice/reply", json={"session_id": sid, "reply": "20"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_stream_receives_event_pushed_to_queue():
    from src.sessions.manager import session_store
    with patch("src.api.routes.run_agent", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/invoice/start", json={"user_id": "u1", "transcript": "test"})
    sid = resp.json()["session_id"]

    # Push a done event so the stream terminates
    await session_store.push_event(sid, {"type": "done", "invoice_id": "inv-1"})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        async with ac.stream("GET", f"/api/invoice/stream?session_id={sid}") as s:
            lines = []
            async for line in s.aiter_lines():
                if line.startswith("data:"):
                    lines.append(json.loads(line[5:].strip()))
                    break  # only need first event

    assert lines[0]["type"] == "done"
