import pytest
from litellm.exceptions import APIError

from analysis.llm_client import FallbackLLM, resolve_llm

PROVIDER_ENV_KEYS = [
    f"LLM_PROVIDER_{n}_{suffix}"
    for n in range(1, 6)
    for suffix in ("API_KEY", "FORMAT", "BASE_URL", "MODEL")
]


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for key in PROVIDER_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


class _StubClient:
    def __init__(self, behavior):
        self._behavior = behavior
        self.calls = 0

    def call(self, instruction, context=None):
        self.calls += 1
        if isinstance(self._behavior, Exception):
            raise self._behavior
        return self._behavior


def _api_error(message: str) -> APIError:
    return APIError(status_code=500, message=message, llm_provider="test", model="test")


class TestFallbackLLM:
    def test_returns_first_success(self):
        first = _StubClient(_api_error("down"))
        second = _StubClient("ok")
        chain = FallbackLLM([first, second])

        assert chain.call(None) == "ok"
        assert first.calls == 1
        assert second.calls == 1

    def test_never_calls_later_client_once_earlier_succeeds(self):
        first = _StubClient("ok")
        second = _StubClient(_api_error("should never run"))
        chain = FallbackLLM([first, second])

        chain.call(None)
        assert second.calls == 0

    def test_propagates_last_error_when_all_fail(self):
        first = _StubClient(_api_error("first down"))
        second = _StubClient(_api_error("second down too"))
        chain = FallbackLLM([first, second])

        with pytest.raises(APIError, match="second down too"):
            chain.call(None)

    def test_rejects_empty_client_list(self):
        with pytest.raises(ValueError):
            FallbackLLM([])


class TestResolveLlm:
    def test_returns_none_when_nothing_configured(self):
        assert resolve_llm() is None

    def test_single_slot_returns_bare_litellm_client(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER_1_API_KEY", "sk-or-test")
        result = resolve_llm()
        assert result is not None
        assert not isinstance(result, FallbackLLM)

    def test_multiple_slots_wrap_in_fallback(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER_1_API_KEY", "sk-or-test")
        monkeypatch.setenv("LLM_PROVIDER_2_API_KEY", "gsk-test")
        assert isinstance(resolve_llm(), FallbackLLM)

    def test_slot_3_defaults_to_anthropic_format(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER_3_API_KEY", "sk-ant-test")
        result = resolve_llm()
        assert result is not None
        assert result.model == "anthropic/claude-opus-5"

    def test_skips_slot_beyond_defaults_with_no_explicit_format(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER_4_API_KEY", "key-with-no-defaults")
        assert resolve_llm() is None

    def test_activates_non_defaulted_slot_with_explicit_overrides(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER_4_API_KEY", "key")
        monkeypatch.setenv("LLM_PROVIDER_4_FORMAT", "openai")
        monkeypatch.setenv("LLM_PROVIDER_4_BASE_URL", "https://example.test/v1")
        monkeypatch.setenv("LLM_PROVIDER_4_MODEL", "custom-model")
        result = resolve_llm()
        assert result is not None
        assert result.model == "openai/custom-model"


class TestResolveLlmProvidersOverride:
    """`providers_override` — a tenant's own UI-configured credentials, forwarded per-request
    from apps/api's DataAnalysisService — takes priority over env vars entirely when given."""

    def test_ignores_env_vars_when_override_is_given(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER_1_API_KEY", "should-be-ignored")
        result = resolve_llm([{"format": "anthropic", "apiKey": "sk-ant-tenant", "model": "claude-opus-5"}])
        assert result is not None
        assert result.model == "anthropic/claude-opus-5"

    def test_multiple_override_entries_wrap_in_fallback(self):
        result = resolve_llm(
            [
                {"format": "openai", "apiKey": "k1", "model": "m1", "baseUrl": "https://example.test/v1"},
                {"format": "anthropic", "apiKey": "k2", "model": "m2"},
            ]
        )
        assert isinstance(result, FallbackLLM)

    def test_skips_entries_missing_required_fields(self):
        assert resolve_llm([{"format": "anthropic", "model": "claude-opus-5"}]) is None

    def test_empty_override_list_returns_none(self):
        assert resolve_llm([]) is None
