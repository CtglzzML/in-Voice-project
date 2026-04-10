# tests/test_session_manager.py
import asyncio
import pytest
from src.sessions.manager import SessionStore, SessionNotFound, SessionNotAwaiting

@pytest.fixture
def store():
    return SessionStore()

def test_create_session_returns_session_id(store):
    sid = store.create("user-1")
    assert len(sid) == 36  # UUID4

def test_get_nonexistent_session_raises(store):
    with pytest.raises(SessionNotFound):
        store.get("nope")

@pytest.mark.asyncio
async def test_push_sse_event_readable_from_queue(store):
    sid = store.create("user-1")
    session = store.get(sid)
    await store.push_event(sid, {"type": "thinking", "message": "test"})
    event = await asyncio.wait_for(session["sse_queue"].get(), timeout=1)
    assert event["type"] == "thinking"

@pytest.mark.asyncio
async def test_reply_to_awaiting_session(store):
    sid = store.create("user-1")
    store.get(sid)["awaiting_reply"] = True
    await store.push_reply(sid, "20")
    reply = await asyncio.wait_for(store.get(sid)["reply_queue"].get(), timeout=1)
    assert reply == "20"

async def test_reply_to_non_awaiting_raises(store):
    sid = store.create("user-1")
    with pytest.raises(SessionNotAwaiting):
        await store.push_reply(sid, "20")

def test_cleanup_removes_session(store):
    sid = store.create("user-1")
    store.cleanup(sid)
    with pytest.raises(SessionNotFound):
        store.get(sid)

def test_session_has_state_field(store):
    sid = store.create("u1")
    assert store.get(sid)["state"] == "INIT"

def test_session_has_extracted_data_field(store):
    sid = store.create("u1")
    assert store.get(sid)["extracted_data"] == {}

def test_session_has_confidence_field(store):
    sid = store.create("u1")
    assert store.get(sid)["confidence"] == 0.0
