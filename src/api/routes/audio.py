# src/api/routes/audio.py
import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from src.config import OPENAI_API_KEY
from src.db.models import TTSRequest

router = APIRouter(prefix="/audio", tags=["Audio"])


def _openai_client():
    """Returns an AsyncOpenAI client. Extracted for testability."""
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


@router.post(
    "/transcribe",
    summary="Transcribe audio to text",
    description=(
        "Sends audio to OpenAI Whisper and returns the transcript. "
        "Accepts any audio format supported by Whisper (webm, mp3, wav, m4a\u2026). "
        "Default language is `fr`. Override with `?language=en`."
    ),
)
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Query("fr", description="BCP-47 language code for Whisper (e.g. fr, en)"),
):
    client = _openai_client()
    audio_bytes = await audio.read()
    file_obj = io.BytesIO(audio_bytes)
    file_obj.name = audio.filename or "audio.webm"

    response = await client.audio.transcriptions.create(
        model="whisper-1",
        file=file_obj,
        language=language,
    )
    return {"transcript": response.text}


@router.post(
    "/tts",
    summary="Text to speech",
    description=(
        "Converts text to speech using OpenAI TTS. Returns an MP3 audio stream. "
        "Default voice is `alloy`. Available voices: alloy, echo, fable, onyx, nova, shimmer."
    ),
)
async def tts(body: TTSRequest):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    client = _openai_client()
    response = await client.audio.speech.create(
        model="tts-1",
        voice=body.voice,
        input=text,
        response_format="mp3",
    )
    audio_bytes = response.content

    return StreamingResponse(
        iter([audio_bytes]),
        media_type="audio/mpeg",
        headers={"Content-Length": str(len(audio_bytes))},
    )
