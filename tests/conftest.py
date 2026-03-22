# tests/conftest.py
import pytest
from unittest.mock import MagicMock


@pytest.fixture
def mock_supabase(monkeypatch):
    """Replaces the lazy Supabase client with a mock.
    Patches _get_client() so the real create_client() is never called at import time.
    """
    mock = MagicMock()
    import src.db.supabase as db_module
    monkeypatch.setattr(db_module, "_get_client", lambda: mock)
    return mock
