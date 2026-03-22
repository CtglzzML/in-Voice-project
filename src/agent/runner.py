# src/agent/runner.py
import asyncio
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from src.agent.tools import (
    tool_get_user_profile,
    tool_search_client,
    tool_create_invoice_draft,
    tool_update_invoice_field,
    tool_ask_user_question,
    tool_finalize_invoice,
    InvoiceField,
    MANDATORY_FIELDS,
)
from src.sessions.manager import session_store


def _make_tools(session_id: str, user_id: str):
    """Return LangChain StructuredTools bound to the current session."""

    class GetUserProfileInput(BaseModel):
        user_id: str = Field(description="ID de l'utilisateur")

    class SearchClientInput(BaseModel):
        name: str = Field(description="Nom ou partie du nom du client")

    class CreateDraftInput(BaseModel):
        pass

    class UpdateFieldInput(BaseModel):
        field: str = Field(description="Champ à mettre à jour. Valeurs possibles : client_id, due_date, payment_terms, lines, tva_rate")
        value: str = Field(description="Nouvelle valeur du champ")
        invoice_id: str = Field(description="ID de la facture (invoice_id retourné par create_invoice_draft)")

    class AskQuestionInput(BaseModel):
        message: str = Field(description="Question à poser à l'utilisateur")

    class FinalizeInput(BaseModel):
        invoice_id: str = Field(description="ID de la facture à finaliser")

    return [
        StructuredTool.from_function(
            coroutine=lambda **kw: tool_get_user_profile(user_id, session_id),
            name="get_user_profile",
            description="Charge le profil de l'émetteur depuis Supabase.",
            args_schema=GetUserProfileInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda name, **kw: tool_search_client(name, user_id, session_id),
            name="search_client",
            description="Recherche un client par nom dans la base.",
            args_schema=SearchClientInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda **kw: tool_create_invoice_draft(user_id, session_id),
            name="create_invoice_draft",
            description="Crée un brouillon de facture en base de données.",
            args_schema=CreateDraftInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda field, value, invoice_id, **kw: tool_update_invoice_field(InvoiceField(field), value, invoice_id, session_id),
            name="update_invoice_field",
            description="Met à jour un champ de la facture.",
            args_schema=UpdateFieldInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda message, **kw: tool_ask_user_question(message, session_id),
            name="ask_user_question",
            description="Pose une question à l'utilisateur et attend sa réponse.",
            args_schema=AskQuestionInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda invoice_id, **kw: tool_finalize_invoice(session_id, invoice_id),
            name="finalize_invoice",
            description="Finalise la facture quand tous les champs obligatoires sont remplis.",
            args_schema=FinalizeInput,
        ),
    ]


async def run_agent(session_id: str, user_id: str, transcript: str) -> None:
    """Background task: runs the LangChain agent for a session."""
    from src.config import OPENAI_API_KEY

    llm = ChatOpenAI(
        model="gpt-4o",
        api_key=OPENAI_API_KEY,
        temperature=0,
    )

    tools = _make_tools(session_id, user_id)
    system_prompt = (
        f"Tu es un assistant de facturation. Session: {session_id}. User: {user_id}.\n"
        "Crée une facture complète en appelant les outils dans cet ordre :\n"
        "1. get_user_profile\n"
        "2. search_client (nom extrait du transcript)\n"
        "3. create_invoice_draft\n"
        "4. update_invoice_field pour chaque info disponible\n"
        f"5. ask_user_question pour chaque champ obligatoire manquant : {MANDATORY_FIELDS}\n"
        "6. finalize_invoice quand tout est complet\n\n"
        f"Ne finalise que lorsque TOUS ces champs sont renseignés : {MANDATORY_FIELDS}.\n"
        "Pose UNE seule question à la fois."
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
                await session_store.push_event(session_id, {"type": "error", "message": f"Erreur agent : {str(e)}"})
                session["status"] = "error"
        except Exception:
            pass  # session may already be cleaned up
    finally:
        try:
            asyncio.create_task(_delayed_cleanup())
        except RuntimeError:
            pass  # event loop shutting down
