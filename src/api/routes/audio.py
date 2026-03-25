# src/api/routes/audio.py
import io
import asyncio
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Depends
from fastapi.responses import StreamingResponse
from src.config import OPENAI_API_KEY
from src.db.models import TTSRequest

router = APIRouter(prefix="/audio", tags=["Audio"])


def get_openai_client():
    """Returns an AsyncOpenAI client. Injected via Depends."""
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


@router.post(
    "/transcribe",
    summary="Transcribe audio to text",
    description=(
        "Sends audio to OpenAI Whisper and returns the transcript. "
        "Accepts any audio format supported by Whisper (webm, mp3, wav, m4a…). "
        "Default language is `fr`. Override with `?language=en`."
    ),
)
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Query("fr", description="BCP-47 language code for Whisper (e.g. fr, en)"),
    client = Depends(get_openai_client),
):
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
async def tts(body: TTSRequest, client = Depends(get_openai_client)):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    async def generate_audio():
        async with client.audio.speech.with_streaming_response.create(
            model="tts-1",
            voice=body.voice,
            input=text,
            response_format="mp3",
        ) as response:
            async for chunk in response.iter_bytes():
                yield chunk

    return StreamingResponse(
        generate_audio(),
        media_type="audio/mpeg"
    )
