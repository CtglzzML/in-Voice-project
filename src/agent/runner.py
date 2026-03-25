# src/agent/runner.py
import asyncio
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.tools import StructuredTool
from typing import Any
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
        value: Any = Field(description="New value for the field. For 'lines', pass a list of objects.")
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

    async def _delayed_cleanup():
        """Removes the session from memory 5 minutes after the agent finishes."""
        await asyncio.sleep(300)
        session_store.cleanup(session_id)

    try:
        from src.config import OPENAI_API_KEY
        llm = ChatOpenAI(
            model="gpt-4o",
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
            f"You are a friendly, concise voice invoicing assistant speaking French. Session: {session_id}. User: {user_id}.\n"
            "Your GOAL is to create an invoice step by step. Do NOT combine steps. Wait for the user between steps.\n\n"
            "RULES:\n"
            "1. Ask EXACTLY ONE question at a time in a natural conversational tone. No Markdown. No bullet points.\n"
            "2. Keep your spoken responses as short as possible.\n"
            "3. Updates to the invoice are done silently via tools. Do not read out all the fields you update, just confirm briefly.\n\n"
            "PIPELINE 1 - Existing Client:\n"
            "- Use search_client with the extracted name.\n"
            "- If search_client says it emitted 'client_suggestions', you MUST STOP and use tool_ask_user_question to say 'J'ai trouvé plusieurs clients correspondants, lequel choisissez-vous sur l'écran ?'.\n"
            "- If it finds exactly one, say 'Client sélectionné.'\n\n"
            "PIPELINE 2 - New Client:\n"
            "- If search_client returns 0 matches, you must create a new client.\n"
            "- Ask for the missing details ONE BY ONE: Name, then Address, then Email.\n"
            "- Before calling create_client, you MUST list the collected information and ask 'Confirmez-vous la création de ce nouveau client ?' using ask_user_question.\n"
            "- If the user says yes, call create_client.\n\n"
            "FLOW:\n"
            "1. Identify the client (using Pipeline 1 or Pipeline 2). Always obtain the client_id.\n"
            "2. Call get_user_profile ONCE, then call create_invoice_draft.\n"
            "3. Ask for invoice lines (description, qty, price) one by one or parse them if provided.\n"
            "4. Update all fields. Use extracted values when available, ask only if missing.\n"
            "5. Final confirmation. Natural summary: 'Facture pour [client]: [description] [qty]×[price]€ = [total]€ HT, [rate]% TVA, due le [date]. Tout est bon ?'\n"
            "6. If yes, call finalize_invoice.\n\n"
            f"MANDATORY to finalize: {MANDATORY_FIELDS}"
        )

        graph = create_agent(
            model=llm,
            tools=tools,
            system_prompt=system_prompt,
        )

        messages = [{"role": "user", "content": transcript}]
        if extracted_context:
            messages.insert(0, {"role": "system", "content": extracted_context})
        await graph.ainvoke({"messages": messages})
    except Exception as e:
        import traceback
        traceback.print_exc()
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
