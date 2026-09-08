"""AI-powered analysis: PandasAI, backed by whatever LLM chain `resolve_llm()` configures.

Data (the dataframe's contents, as SQL query results) leaves this process for the configured
LLM provider — this is the explicit trade for tenants who want natural-language analysis over
their spreadsheet rather than only the fixed AutoViz chart set `local_mode.py` produces. Verified
against a real installed pandasai 3.0.0 that `pai.chat()` returns one of a small set of typed
`core.response.*` objects (`StringResponse`/`NumberResponse`/`DataFrameResponse`/`ChartResponse`/
`ErrorResponse`), each carrying `.type` and `.value` — `ChartResponse` additionally exposes
`get_base64_image()`, used here instead of writing to disk.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pandas as pd
import pandasai as pai

from .llm_client import resolve_llm

DEFAULT_QUESTION = (
    "Analyze this dataset and provide a concise executive summary of the key insights, "
    "trends, and any data quality issues you notice."
)

# Cap how many rows of a DataFrameResponse get serialized back to the caller — PandasAI can
# return an entire (possibly large) DataFrame as its answer, and this is a JSON API response,
# not a file download.
MAX_TABLE_ROWS = 500


@dataclass
class AiAnalysisResult:
    answer: Optional[str]
    table: Optional[list[dict]]
    chart_base64: Optional[str]
    error: Optional[str]


class LlmNotConfiguredError(RuntimeError):
    pass


def run_ai_analysis(df: pd.DataFrame, question: Optional[str], providers_override: Optional[list[dict]] = None) -> AiAnalysisResult:
    llm = resolve_llm(providers_override)
    if llm is None:
        raise LlmNotConfiguredError(
            "No LLM_PROVIDER_<n>_API_KEY is configured for this deployment — AI-powered "
            "analysis is unavailable. Use local/privacy-preserving mode instead, or configure "
            "at least one provider."
        )

    pai.config.set({"llm": llm})
    pandasai_df = pai.DataFrame(df)
    response = pai.chat(question or DEFAULT_QUESTION, pandasai_df)

    if response.type == "chart":
        return AiAnalysisResult(answer=None, table=None, chart_base64=response.get_base64_image(), error=None)

    if response.type == "dataframe":
        table_df = response.value
        return AiAnalysisResult(
            answer=f"Returned a table with {len(table_df)} row(s).",
            table=table_df.head(MAX_TABLE_ROWS).to_dict(orient="records"),
            chart_base64=None,
            error=None,
        )

    if response.type == "error":
        return AiAnalysisResult(answer=None, table=None, chart_base64=None, error=str(response.value))

    # "string" and "number" responses are both plain scalar values.
    return AiAnalysisResult(answer=str(response.value), table=None, chart_base64=None, error=None)
