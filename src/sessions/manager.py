# src/sessions/manager.py
import asyncio
import uuid
from typing import Any


class SessionNotFound(Exception):
    pass


class SessionNotAwaiting(Exception):
    pass


class SessionStore:
    def __init__(self):
        self._sessions: dict[str, dict] = {}

    def create(self, user_id: str) -> str:
        session_id = str(uuid.uuid4())
        self._sessions[session_id] = {
            "user_id": user_id,
            "sse_queue": asyncio.Queue(),
            "reply_queue": asyncio.Queue(),
            "awaiting_reply": False,
            "last_question": None,
            "invoice_id": None,
            "status": "active",  # active | awaiting_reply | done | error
        }
        return session_id

    def get(self, session_id: str) -> dict:
        if session_id not in self._sessions:
            raise SessionNotFound(session_id)
        return self._sessions[session_id]

    async def push_event(self, session_id: str, event: dict[str, Any]) -> None:
        session = self.get(session_id)
        await session["sse_queue"].put(event)

    async def push_reply(self, session_id: str, reply: str) -> None:
        session = self.get(session_id)
        if not session["awaiting_reply"]:
            raise SessionNotAwaiting(session_id)
        session["awaiting_reply"] = False
        await session["reply_queue"].put(reply)

    def cleanup(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


# Global singleton
session_store = SessionStore()
