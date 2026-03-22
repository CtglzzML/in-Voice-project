# tests/test_supabase.py
import pytest

def test_get_user_returns_user_profile(mock_supabase):
    from src.db.supabase import get_user
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "id": "user-1", "name": "Alice", "siret": "12345678900001",
        "address": "1 rue de Paris", "default_tva": 20.0,
        "email": None, "tva_number": None, "logo_url": None,
    }
    user = get_user("user-1")
    assert user.name == "Alice"
    assert user.siret == "12345678900001"

def test_get_user_returns_none_if_not_found(mock_supabase):
    from src.db.supabase import get_user
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
    user = get_user("nonexistent")
    assert user is None

def test_search_clients_returns_list(mock_supabase):
    from src.db.supabase import search_clients
    mock_supabase.rpc.return_value.execute.return_value.data = [
        {"id": "c1", "user_id": "user-1", "name": "Marie Dupont", "email": None, "address": "2 rue Lyon", "company": None}
    ]
    results = search_clients("Marie", "user-1")
    assert len(results) == 1
    assert results[0].name == "Marie Dupont"

def test_search_clients_returns_empty_list_when_none(mock_supabase):
    from src.db.supabase import search_clients
    mock_supabase.rpc.return_value.execute.return_value.data = None
    results = search_clients("Unknown", "user-1")
    assert results == []
