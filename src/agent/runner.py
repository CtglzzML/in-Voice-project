"""
V2: run_agent delegates entirely to the orchestrator.
The LangChain agent and _make_tools() are removed.
"""
from src.agent.orchestrator import run_orchestrator


async def run_agent(session_id: str, user_id: str, transcript: str) -> None:
    """Public API unchanged — called by FastAPI BackgroundTask in routes."""
    await run_orchestrator(session_id, user_id, transcript)
