import pandas as pd
import pytest
from pandasai.llm.base import LLM

from analysis import ai_mode
from analysis.ai_mode import LlmNotConfiguredError, run_ai_analysis


def _sample_df() -> pd.DataFrame:
    return pd.DataFrame({"category": ["A", "B", "A"], "maturity": [2.0, 4.0, 3.0]})


def test_raises_when_no_llm_configured(monkeypatch):
    monkeypatch.setattr(ai_mode, "resolve_llm", lambda providers_override=None: None)
    with pytest.raises(LlmNotConfiguredError):
        run_ai_analysis(_sample_df(), question="anything")


def test_forwards_providers_override_to_resolve_llm(monkeypatch):
    received = {}

    def fake_resolve_llm(providers_override=None):
        received["providers_override"] = providers_override
        return None

    monkeypatch.setattr(ai_mode, "resolve_llm", fake_resolve_llm)
    override = [{"format": "anthropic", "apiKey": "sk-ant-test", "model": "claude-opus-5"}]
    with pytest.raises(LlmNotConfiguredError):
        run_ai_analysis(_sample_df(), question="anything", providers_override=override)
    assert received["providers_override"] == override


def test_string_response_round_trip(monkeypatch):
    code = (
        "```python\n"
        "df = execute_sql_query(\"SELECT * FROM __TABLE__\")\n"
        "result = {\"type\": \"string\", \"value\": f\"avg is {df['maturity'].mean():.1f}\"}\n"
        "```"
    )

    # The generated code needs the real table name PandasAI assigns the in-memory dataframe,
    # which isn't known until pai.DataFrame(df) is constructed — so build the code lazily via a
    # thin LLM wrapper that fills it in from the prompt PandasAI sends, exactly like a real LLM
    # would read the table name out of the <tables> block it's given.
    class _TemplatedFakeLLM(LLM):
        @property
        def type(self) -> str:
            return "fake"

        def call(self, instruction, context=None) -> str:
            prompt_text = instruction.to_string()
            start = prompt_text.index('table_name="') + len('table_name="')
            table_name = prompt_text[start : prompt_text.index('"', start)]
            return code.replace("__TABLE__", table_name)

    monkeypatch.setattr(ai_mode, "resolve_llm", lambda providers_override=None: _TemplatedFakeLLM())

    result = run_ai_analysis(_sample_df(), question="What is the average maturity?")

    assert result.error is None
    assert result.chart_base64 is None
    assert "avg is 3.0" in result.answer
