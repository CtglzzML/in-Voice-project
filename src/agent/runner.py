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
        address: str = Field(default="", description="Client postal address")
        email: str = Field(default="", description="Client email")
        phone: str = Field(default="", description="Client phone number")
        company: str = Field(default="", description="Company name (optional)")

    class CreateDraftInput(BaseModel):
        pass

    class UpdateFieldInput(BaseModel):
        field: str = Field(description="Field to update. Possible values: client_id, due_date, payment_terms, lines, tva_rate")
        value: Any = Field(description="New value for the field. For 'lines', pass a list of objects exactly matching [{'description': 'clean service/product name', 'qty': numeric_quantity, 'unit_price': numeric_price}]. Ensure description NEVER contains the quantity or duration (e.g. NO '1 hour' in description).")
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
            f"You are a friendly, concise voice invoicing assistant speaking English. Session: {session_id}. User: {user_id}.\n"
            "Your GOAL is to create an invoice step by step via voice.\n\n"
            "CRITICAL UX RULES:\n"
            "1. ALWAYS respond in English. NEVER use French.\n"
            "2. Ensure a conversation that guides the UI seamlessly = The user should NEVER have to think about where to click.\n"
            "3. Your messages MUST be short, actionable, and single-threaded (max 1 sentence, NEVER ask multiple questions at once).\n"
            "4. NO technical jargon or unnecessary chatter.\n"
            "5. Always use the pre-extracted values provided above.\n"
            "6. After get_user_profile, use profile.default_tva as tva_rate if not extracted.\n\n"
            "CLIENT WORKFLOW (ONLY 2 PATHS):\n"
            "- Step 1: Call `search_client` ONCE with the client name.\n"
            "- PATH A: If search_client returns 'Client found', call `update_invoice_field` with the `client_id`, then continue.\n"
            "- PATH B: If search_client returns 'User submitted form data...', immediately call `create_client` with the provided data. After receiving `client_id`, call `update_invoice_field`.\n"
            "Do NOT ask for client details verbally if they are missing.\n\n"
            "FLOW:\n"
            "1. Call `get_user_profile` to load the profile, then call `create_invoice_draft`.\n"
            "2. Ensure profile details are injected.\n"
            "3. Search for the client using the paths above.\n"
            "4. Call `update_invoice_field` to apply any known details.\n"
            "5. Answer any user questions and seamlessly gather missing fields using exactly ONE `ask_user_question` tool call at a time.\n"
            "6. Once ALL mandatory fields are filled, you MUST use `ask_user_question` to ask: 'Your invoice is ready. Do you want to modify anything?'\n"
            "7. If they say no/it's good, call `finalize_invoice`.\n\n"
            f"MANDATORY FIELDS: {MANDATORY_FIELDS}"
        )

        graph = create_agent(
            model=llm,
            tools=tools,
            system_prompt=system_prompt,
        )

        messages = [{"role": "user", "content": transcript}]
        if extracted_context:
            messages.insert(0, {"role": "system", "content": extracted_context})
            
        session = session_store.get(session_id)
        
        while session["status"] not in ("done", "error"):
            result = await graph.ainvoke({"messages": messages})
            
            # Send final agent conversational message to UI to unblock 'thinking' state
            if result and "messages" in result and result["messages"]:
                last_msg = result["messages"][-1]
                if last_msg.type == "ai" and str(last_msg.content).strip():
                    session["awaiting_reply"] = True
                    await session_store.push_event(session_id, {
                        "type": "question",
                        "message": str(last_msg.content).strip()
                    })
                    
            if session["status"] in ("done", "error"):
                break
                
            try:
                # Wait for user's next response since the graph iteration finished
                next_reply = await asyncio.wait_for(session["reply_queue"].get(), timeout=300)
                messages = result["messages"] + [{"role": "user", "content": next_reply}]
            except asyncio.TimeoutError:
                session["status"] = "error"
                await session_store.push_event(session_id, {"type": "error", "message": "Session timed out after 5 minutes of inactivity."})
                break
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
