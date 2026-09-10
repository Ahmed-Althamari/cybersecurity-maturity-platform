"""Provider-agnostic LLM resolution for PandasAI's "ai" analysis mode.

Deliberately mirrors apps/api/src/assessments/import-mapping/llm-client.ts's env var scheme
(`LLM_PROVIDER_<n>_API_KEY` / `_FORMAT` / `_BASE_URL` / `_MODEL`, n = 1..5) and fallback
behaviour (`FallbackLlmClient`), so one set of provider credentials configures both the
TypeScript import-mapping suggester and this service identically. The two are independent
implementations (different languages, different LLM wire clients) but should always agree on
which providers are configured and in what order they're tried.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

from litellm.exceptions import APIError, RateLimitError, ServiceUnavailableError, Timeout
from pandasai.llm.base import LLM
from pandasai_litellm.litellm import LiteLLM

logger = logging.getLogger("data-analysis.llm_client")

MAX_PROVIDER_SLOTS = 5

# Same free-tier-first defaults as the TypeScript side — see llm-client.ts's SLOT_DEFAULTS
# comment for why slot 1 uses OpenRouter's router-level `openrouter/free` rather than a named
# free model (named free models on OpenRouter's catalog churn fast enough that one hardcoded
# here broke within weeks during development).
@dataclass(frozen=True)
class ProviderDefaults:
    format: str
    base_url: Optional[str]
    model: str


SLOT_DEFAULTS: dict[int, ProviderDefaults] = {
    1: ProviderDefaults("openai", "https://openrouter.ai/api/v1", "openrouter/free"),
    2: ProviderDefaults("openai", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    3: ProviderDefaults("anthropic", None, "claude-opus-5"),
}

# Failures worth falling through to the next provider on. Deliberately narrower than "any
# Exception" so a bug in our own code (a TypeError from malformed kwargs, say) surfaces instead
# of being silently swallowed and misread as "every provider is down".
_FALLTHROUGH_ERRORS = (APIError, RateLimitError, ServiceUnavailableError, Timeout, ConnectionError)


def _build_litellm(fmt: str, api_key: str, base_url: Optional[str], model: str) -> LiteLLM:
    if fmt == "anthropic":
        return LiteLLM(model=f"anthropic/{model}", api_key=api_key)
    return LiteLLM(model=f"openai/{model}", api_key=api_key, api_base=base_url)


class FallbackLLM(LLM):
    """Tries each configured LiteLLM client in order, only moving to the next on a real
    provider failure — the first one that returns wins. If every provider fails, the last
    error propagates (mirrors FallbackLlmClient.complete in llm-client.ts)."""

    def __init__(self, clients: list[LiteLLM]):
        super().__init__(api_key=None)
        if not clients:
            raise ValueError("FallbackLLM needs at least one underlying client")
        self._clients = clients

    @property
    def type(self) -> str:
        return "fallback"

    def call(self, instruction, context=None) -> str:
        last_error: Exception | None = None
        for client in self._clients:
            try:
                return client.call(instruction, context)
            except _FALLTHROUGH_ERRORS as error:
                last_error = error
                logger.warning("Provider failed, trying next in the fallback chain: %s", error)
        assert last_error is not None
        raise last_error


def resolve_llm(providers_override: Optional[list[dict]] = None) -> Optional[LLM]:
    """Reads LLM_PROVIDER_<n>_* env vars (n = 1..5) into an ordered provider chain. Returns
    None — not a raised error — when no slot is configured, so callers can treat "ai" mode as
    simply unavailable rather than crash the whole service over an optional feature.

    `providers_override`, when given, is used instead of the env vars entirely — this is how a
    tenant's own UI-configured credentials (apps/web/pages/settings/ai.tsx) reach this service:
    apps/api's DataAnalysisService resolves them from the database and forwards the decrypted,
    ordered list over the existing internal HTTP call to this service's /analyze endpoint (see
    main.py's `llm_providers` form field). Each dict needs "format", "apiKey" and "model";
    "baseUrl" is optional (required in practice for "openai", unused for "anthropic").
    """
    if providers_override is not None:
        override_clients: list[LiteLLM] = []
        for provider in providers_override:
            fmt = provider.get("format")
            api_key = provider.get("apiKey")
            model = provider.get("model")
            if not fmt or not api_key or not model:
                logger.warning("Skipping a provider override entry missing format/apiKey/model: %r", provider)
                continue
            override_clients.append(_build_litellm(fmt, api_key, provider.get("baseUrl"), model))
        if not override_clients:
            return None
        return override_clients[0] if len(override_clients) == 1 else FallbackLLM(override_clients)

    clients: list[LiteLLM] = []

    for slot in range(1, MAX_PROVIDER_SLOTS + 1):
        api_key = os.environ.get(f"LLM_PROVIDER_{slot}_API_KEY")
        if not api_key:
            continue

        defaults = SLOT_DEFAULTS.get(slot)
        fmt = os.environ.get(f"LLM_PROVIDER_{slot}_FORMAT") or (defaults.format if defaults else None)
        base_url = os.environ.get(f"LLM_PROVIDER_{slot}_BASE_URL") or (defaults.base_url if defaults else None)
        model = os.environ.get(f"LLM_PROVIDER_{slot}_MODEL") or (defaults.model if defaults else None)

        if not fmt or not model or (fmt == "openai" and not base_url):
            logger.warning(
                "LLM_PROVIDER_%d_API_KEY is set but FORMAT/BASE_URL/MODEL has no default for this slot "
                "and none was provided — skipping.",
                slot,
            )
            continue

        clients.append(_build_litellm(fmt, api_key, base_url, model))

    if not clients:
        return None
    return clients[0] if len(clients) == 1 else FallbackLLM(clients)
