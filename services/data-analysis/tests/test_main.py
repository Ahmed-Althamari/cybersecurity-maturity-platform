import io
import json

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

import main
from analysis.ai_mode import AiAnalysisResult, LlmNotConfiguredError


def _sample_csv_bytes() -> bytes:
    rng = np.random.default_rng(0)
    df = pd.DataFrame(
        {
            "category": rng.choice(["A", "B", "C"], 40),
            "maturity": rng.random(40) * 5,
        }
    )
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


client = TestClient(main.app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_rejects_unknown_mode():
    response = client.post(
        "/analyze",
        files={"file": ("data.csv", _sample_csv_bytes(), "text/csv")},
        data={"mode": "bogus"},
    )
    assert response.status_code == 400


def test_rejects_unsupported_file_type():
    response = client.post(
        "/analyze",
        files={"file": ("data.txt", b"not a spreadsheet", "text/plain")},
        data={"mode": "local"},
    )
    assert response.status_code == 400


def test_local_mode_end_to_end():
    response = client.post(
        "/analyze",
        files={"file": ("data.csv", _sample_csv_bytes(), "text/csv")},
        data={"mode": "local"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "local"
    assert body["rowCount"] == 40
    assert body["columnCount"] == 2
    assert len(body["charts"]) > 0
    assert body["error"] is None


def test_ai_mode_returns_503_when_llm_not_configured(monkeypatch):
    def raise_not_configured(df, question, providers_override=None):
        raise LlmNotConfiguredError("no provider configured")

    monkeypatch.setattr(main, "run_ai_analysis", raise_not_configured)

    response = client.post(
        "/analyze",
        files={"file": ("data.csv", _sample_csv_bytes(), "text/csv")},
        data={"mode": "ai"},
    )
    assert response.status_code == 503


def test_ai_mode_success_uses_configured_llm(monkeypatch):
    def fake_run_ai_analysis(df, question, providers_override=None):
        return AiAnalysisResult(answer="the data looks fine", table=None, chart_base64=None, error=None)

    monkeypatch.setattr(main, "run_ai_analysis", fake_run_ai_analysis)

    response = client.post(
        "/analyze",
        files={"file": ("data.csv", _sample_csv_bytes(), "text/csv")},
        data={"mode": "ai", "question": "Summarize this"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "the data looks fine"
    assert body["charts"] == []


def test_ai_mode_forwards_llm_providers_form_field(monkeypatch):
    received = {}

    def fake_run_ai_analysis(df, question, providers_override=None):
        received["providers_override"] = providers_override
        return AiAnalysisResult(answer="ok", table=None, chart_base64=None, error=None)

    monkeypatch.setattr(main, "run_ai_analysis", fake_run_ai_analysis)

    providers = [{"format": "anthropic", "apiKey": "sk-ant-test", "model": "claude-opus-5", "baseUrl": None}]
    response = client.post(
        "/analyze",
        files={"file": ("data.csv", _sample_csv_bytes(), "text/csv")},
        data={"mode": "ai", "llm_providers": json.dumps(providers)},
    )
    assert response.status_code == 200
    assert received["providers_override"] == providers


def test_ai_mode_ignores_malformed_llm_providers_field(monkeypatch):
    received = {}

    def fake_run_ai_analysis(df, question, providers_override=None):
        received["providers_override"] = providers_override
        return AiAnalysisResult(answer="ok", table=None, chart_base64=None, error=None)

    monkeypatch.setattr(main, "run_ai_analysis", fake_run_ai_analysis)

    response = client.post(
        "/analyze",
        files={"file": ("data.csv", _sample_csv_bytes(), "text/csv")},
        data={"mode": "ai", "llm_providers": "not valid json"},
    )
    assert response.status_code == 200
    assert received["providers_override"] is None
