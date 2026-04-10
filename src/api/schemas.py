# src/api/schemas.py
from pydantic import BaseModel


class StartRequest(BaseModel):
    transcript: str


class StartResponse(BaseModel):
    session_id: str


class ReplyRequest(BaseModel):
    session_id: str
    reply: str
