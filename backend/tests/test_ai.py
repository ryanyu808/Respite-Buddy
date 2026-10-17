import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from app.models import PreferenceRequest
from app.services.ai_service import interpret


def test_provider_failure_uses_rules(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-real")
    def failure(*args, **kwargs):
        raise httpx.ConnectError("offline")
    monkeypatch.setattr(httpx, "post", failure)
    result = interpret(PreferenceRequest(text="Prefer quiet paths"))
    assert result.mode == "rule-based"
    assert result.preferences.noise == 90


def test_out_of_range_ai_output_rejected(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-real")
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {"output": [{"content": [{"type": "output_text", "text": '{"noise":999,"crowds":50,"traffic":50,"green":50,"pace":"calmest","max_detour":20}'}]}]}
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: Response())
    result = interpret(PreferenceRequest(text="Prefer quiet paths"))
    assert result.mode == "rule-based"
    assert result.preferences.noise == 90
