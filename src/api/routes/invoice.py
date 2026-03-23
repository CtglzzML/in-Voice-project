# src/api/routes/invoice.py
import asyncio
import json
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from src.api.schemas import StartRequest, StartResponse, ReplyRequest
from src.sessions.manager import session_store
from src.agent.runner import run_agent
from src.db.supabase import get_invoice
from src.db.models import InvoiceDetailResponse

router = APIRouter(prefix="/invoice", tags=["Invoice"])


@router.post(
    "/start",
    response_model=StartResponse,
    summary="Start an invoice session",
    description=(
        "Creates a new invoice session and starts the AI agent in the background. "
        "Returns a `session_id` to use with `/stream` and `/reply`."
    ),
)
async def start(body: StartRequest):
    session_id = session_store.create(body.user_id)
    asyncio.create_task(run_agent(session_id, body.user_id, body.transcript))
    return StartResponse(session_id=session_id)


@router.get(
    "/stream",
    summary="SSE stream for session events",
    description=(
        "Server-Sent Events stream. Connect immediately after `/start`. "
        "Events: `thinking`, `profile`, `invoice_update`, `question`, `done`, `error`, `ping`. "
        "Stream closes automatically on `done` or `error`."
    ),
)
async def stream(session_id: str):
    session = session_store.get(session_id)  # raises SessionNotFound → caught globally

    already_connected = session["stream_connected"]
    session["stream_connected"] = True

    if already_connected:
        if session["awaiting_reply"] and session["last_question"]:
            await session["sse_queue"].put({
                "type": "question",
                "message": session["last_question"],
                "awaiting": True,
            })
        elif session["status"] == "done" and session["invoice_id"]:
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


@router.post(
    "/reply",
    summary="Send user reply to the agent",
    description=(
        "Unblocks the agent after it asked a question. "
        "Only valid when the session is in `awaiting_reply` state (after receiving a `question` SSE event). "
        "Returns 409 if the session is not currently waiting."
    ),
)
async def reply(body: ReplyRequest):
    await session_store.push_reply(body.session_id, body.reply)
    return {}


@router.get(
    "/{invoice_id:uuid}",
    response_model=InvoiceDetailResponse,
    summary="Get invoice details",
    description="Returns the full invoice record. Available immediately after the `done` SSE event.",
)
async def get_invoice_detail(invoice_id: str):
    invoice = await asyncio.get_event_loop().run_in_executor(None, get_invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice
