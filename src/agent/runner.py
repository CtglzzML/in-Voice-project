# src/agent/runner.py
import asyncio
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from src.agent.tools import (
    tool_get_user_profile,
    tool_search_client,
    tool_create_client,
    tool_create_invoice_draft,
    tool_update_invoice_field,
    tool_ask_user_question,
    tool_finalize_invoice,
    InvoiceField,
    MANDATORY_FIELDS,
)
from src.agent.extractor import extract_from_transcript
from src.sessions.manager import session_store


def _make_tools(session_id: str, user_id: str):
    """Return LangChain StructuredTools bound to the current session."""

    class GetUserProfileInput(BaseModel):
        user_id: str = Field(description="User ID")

    class SearchClientInput(BaseModel):
        name: str = Field(description="Client name or partial name")

    class CreateClientInput(BaseModel):
        name: str = Field(description="Client full name (first + last)")
        address: str = Field(description="Client postal address")
        email: str = Field(default="", description="Client email")
        phone: str = Field(default="", description="Client phone number")
        company: str = Field(default="", description="Company name (optional)")

    class CreateDraftInput(BaseModel):
        pass

    class UpdateFieldInput(BaseModel):
        field: str = Field(description="Field to update. Possible values: client_id, due_date, payment_terms, lines, tva_rate")
        value: str = Field(description="New value for the field")
        invoice_id: str = Field(description="Invoice ID (returned by create_invoice_draft)")

    class AskQuestionInput(BaseModel):
        message: str = Field(description="Question to ask the user")

    class FinalizeInput(BaseModel):
        invoice_id: str = Field(description="Invoice ID to finalize")

    return [
        StructuredTool.from_function(
            coroutine=lambda **kw: tool_get_user_profile(user_id, session_id),
            name="get_user_profile",
            description="Load the issuer profile from Supabase.",
            args_schema=GetUserProfileInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda name, **kw: tool_search_client(name, user_id, session_id),
            name="search_client",
            description="Search for a client by name in the database.",
            args_schema=SearchClientInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda name, address, email="", phone="", company="", **kw: tool_create_client(name, address, user_id, session_id, email, company, phone),
            name="create_client",
            description="Create a client record (name + address required). Returns client_id to use in update_invoice_field.",
            args_schema=CreateClientInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda **kw: tool_create_invoice_draft(user_id, session_id),
            name="create_invoice_draft",
            description="Create an invoice draft in the database.",
            args_schema=CreateDraftInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda field, value, invoice_id, **kw: tool_update_invoice_field(InvoiceField(field), value, invoice_id, session_id),
            name="update_invoice_field",
            description="Update a field on the invoice.",
            args_schema=UpdateFieldInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda message, **kw: tool_ask_user_question(message, session_id),
            name="ask_user_question",
            description="Ask the user a question and wait for their reply.",
            args_schema=AskQuestionInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda invoice_id, **kw: tool_finalize_invoice(session_id, invoice_id),
            name="finalize_invoice",
            description="Finalize the invoice once all mandatory fields are filled.",
            args_schema=FinalizeInput,
        ),
    ]


async def run_agent(session_id: str, user_id: str, transcript: str) -> None:
    """Background task: runs the LangChain agent for a session."""
    from src.config import OPENAI_API_KEY

    llm = ChatOpenAI(
        model="gpt-4.1-mini",
        api_key=OPENAI_API_KEY,
        temperature=0,
    )

    # Pre-extract structured info from transcript
    extracted = await extract_from_transcript(transcript, OPENAI_API_KEY)

    # Build extracted context for system prompt
    extracted_fields = {k: v for k, v in extracted.model_dump().items() if v is not None}
    extracted_context = (
        f"\n\nPRE-EXTRACTED FROM TRANSCRIPT:\n{extracted_fields}\n\n"
        "Use these values directly — do NOT ask the user for info that is already extracted above."
        if extracted_fields else ""
    )

    tools = _make_tools(session_id, user_id)
    system_prompt = (
        f"You are a voice invoicing assistant. Session: {session_id}. User: {user_id}.\n\n"
        "The user has already spoken their invoice request. Your job is to process it efficiently:\n"
        "use what was already said, and only ask for what is strictly missing.\n"
        "Keep questions short and conversational."
        f"{extracted_context}\n\n"
        "STEPS — execute in order:\n\n"
        "STEP 1 — get_user_profile\n\n"
        "STEP 2 — Identify the client:\n"
        "  • Use client_first_name + client_last_name from extracted data if available\n"
        "  • If client name is missing → ask_user_question('Who are you invoicing?')\n"
        "  • search_client with full name\n"
        "  • 1 result → update_invoice_field client_id\n"
        "  • 0 results → new client:\n"
        "    - Use address/email/phone from extracted data if available\n"
        "    - Ask only for missing required fields (address is required)\n"
        "    - then create_client\n"
        "  • Multiple results → ask_user_question listing the options\n\n"
        "STEP 3 — create_invoice_draft\n\n"
        "STEP 4 — Set invoice fields (use extracted data when available, ask only if missing):\n"
        "  • lines: [{description, qty, unit_price}] — use extracted description/qty/unit_price/amount\n"
        "    - description must be a clean professional label with NO quantity in it (e.g. 'Web development', not '3h web dev')\n"
        "    - qty is the number of hours/days/units (separate from description)\n"
        "    - If description missing → ask_user_question('What are you invoicing for?')\n"
        "    - If amount/unit_price missing → ask_user_question('How much for that?')\n"
        "  • tva_rate: use extracted tva_rate, or profile default_tva (as a percentage, e.g. 20), or ask\n"
        "  • due_date: use extracted due_date, or today+30 days in YYYY-MM-DD format\n"
        "  • payment_terms: use extracted payment_terms, or 'Net 30'\n\n"
        "STEP 5 — Confirmation:\n"
        "  ask_user_question with a brief summary:\n"
        "  '[client], [description], [qty]x[unit_price], total [total] with [rate]% VAT, due [date]. Confirm?'\n\n"
        "STEP 6 — If confirmed → finalize_invoice\n"
        "         If changes requested → update fields then back to STEP 5\n\n"
        "ABSOLUTE RULES:\n"
        "- Never ask for info already in the extracted data\n"
        "- client_id must be a UUID from search_client or create_client\n"
        "- Never invent values\n"
        "- tva_rate must be a number (e.g. 20, not '20%')\n"
        "- lines value must be a JSON array: [{\"description\": \"...\", \"qty\": 1, \"unit_price\": 100.0}]\n"
        f"- Mandatory fields before finalize: {MANDATORY_FIELDS}"
    )

    graph = create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_prompt,
    )

    async def _delayed_cleanup():
        """Removes the session from memory 5 minutes after the agent finishes."""
        await asyncio.sleep(300)
        session_store.cleanup(session_id)

    try:
        await graph.ainvoke({"messages": [{"role": "user", "content": transcript}]})
    except Exception as e:
        try:
            session = session_store.get(session_id)
            if session["status"] != "done":
                await session_store.push_event(session_id, {"type": "error", "message": f"Agent error: {str(e)}"})
                session["status"] = "error"
        except Exception:
            pass  # session may already be cleaned up
    finally:
        try:
            asyncio.create_task(_delayed_cleanup())
        except RuntimeError:
            pass  # event loop shutting down
