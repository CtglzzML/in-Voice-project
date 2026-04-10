# src/agent/logger.py
"""
Configure structured JSON logging for the agent pipeline.
Import and call configure_logging() once at application startup.
"""
import logging
import json
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
        }
        try:
            payload = json.loads(record.getMessage())
            base.update(payload)
        except (json.JSONDecodeError, ValueError):
            base["message"] = record.getMessage()
        if record.exc_info:
            base["exception"] = self.formatException(record.exc_info)
        return json.dumps(base)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    # Silence noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
