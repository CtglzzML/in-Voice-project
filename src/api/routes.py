# src/api/routes.py
import asyncio
import json
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from src.api.schemas import StartRequest, StartResponse, ReplyRequest
from src.sessions.manager import session_store, SessionNotFound, SessionNotAwaiting
from src.agent.runner import run_agent

router = APIRouter(prefix="/api/invoice")


@router.post("/start", response_model=StartResponse)
async def start(body: StartRequest):
    session_id = session_store.create(body.user_id)
    asyncio.create_task(run_agent(session_id, body.user_id, body.transcript))
    return StartResponse(session_id=session_id)


@router.get("/stream")
async def stream(session_id: str):
    try:
        session = session_store.get(session_id)
    except SessionNotFound:
        raise HTTPException(status_code=404, detail="Session not found")

    # Reconnection: replay last question if awaiting
    if session["awaiting_reply"] and session["last_question"]:
        await session["sse_queue"].put({
            "type": "question",
            "message": session["last_question"],
            "awaiting": True,
        })

    # Reconnection: replay done if already finished
    if session["status"] == "done" and session["invoice_id"]:
        await session["sse_queue"].put({"type": "done", "invoice_id": session["invoice_id"]})

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(session["sse_queue"].get(), timeout=30)
                yield {"data": json.dumps(event)}
                if event["type"] in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield {"data": json.dumps({"type": "ping"})}

    return EventSourceResponse(event_generator())


@router.post("/reply")
async def reply(body: ReplyRequest):
    try:
        await session_store.push_reply(body.session_id, body.reply)
    except SessionNotFound:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionNotAwaiting:
        raise HTTPException(status_code=409, detail="Session is not awaiting a reply")
    return {}
