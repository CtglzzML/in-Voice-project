# src/agent/events.py
"""
SSE event type constants for V2.

Frontend mapping (old → new):
  message/thinking  → MESSAGE
  invoice_update    → INVOICE_UPDATED
  ui_action         → NEED_CLIENT_INFO
  question          → WAITING_USER_INPUT
  profile           → PROFILE
  done              → DONE
  error             → ERROR
  ping              → PING
"""


class EventType:
    MESSAGE = "MESSAGE"
    INVOICE_UPDATED = "INVOICE_UPDATED"
    NEED_CLIENT_INFO = "NEED_CLIENT_INFO"
    WAITING_USER_INPUT = "WAITING_USER_INPUT"
    PROFILE = "PROFILE"
    DONE = "DONE"
    ERROR = "ERROR"
    PING = "PING"


def make_event(type_: str, **data) -> dict:
    return {"type": type_, **data}
