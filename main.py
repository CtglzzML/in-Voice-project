# main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import os
from src.api.routes.invoice import router as invoice_router
from src.api.routes.audio import router as audio_router
from src.sessions.manager import SessionNotFound, SessionNotAwaiting
from src.agent.logger import configure_logging

configure_logging()

app = FastAPI(
    title="Invoice AI Agent",
    description="Voice-based invoice creation agent. See /docs for the full API reference.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(SessionNotFound)
async def session_not_found_handler(request: Request, exc: SessionNotFound):
    return JSONResponse(status_code=404, content={"detail": "Session not found"})


@app.exception_handler(SessionNotAwaiting)
async def session_not_awaiting_handler(request: Request, exc: SessionNotAwaiting):
    return JSONResponse(status_code=409, content={"detail": "Session is not awaiting a reply"})


app.include_router(invoice_router, prefix="/api/v1")
app.include_router(audio_router, prefix="/api/v1")


@app.get("/ui")
async def test_ui():
    return FileResponse(os.path.join(os.path.dirname(__file__), "test_ui.html"))
