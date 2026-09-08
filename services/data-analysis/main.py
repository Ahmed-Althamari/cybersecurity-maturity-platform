"""Data-analysis microservice: Excel/CSV -> dashboard-style analysis, in one of two modes.

Deliberately isolated from the main NestJS API and its Postgres-backed domain (assessments,
risks, frameworks) — this service is stateless, holds no tenant data of its own, and knows
nothing about the platform's auth/tenancy model. It's called server-side, over HTTP, by a thin
proxying module in the NestJS API (apps/api/src/data-analysis/), which is the only thing that
enforces auth/tenancy for this feature. Kept as a separate Python process rather than embedded
in the Node API because its dependencies (pandas, PandasAI, AutoViz, matplotlib) are a
different language runtime entirely.

Two analysis modes, both accepting the same upload:
  - "local": AutoViz only. Zero LLM calls, zero network calls of any kind — the explicit option
    for tenants who don't want their spreadsheet data leaving the platform at all.
  - "ai": PandasAI, backed by whichever LLM chain is configured via LLM_PROVIDER_<n>_* env vars
    (mirrors apps/api/src/assessments/import-mapping/llm-client.ts's scheme exactly). The
    dataframe's contents leave this process for that provider — this is the explicit trade for
    natural-language analysis beyond AutoViz's fixed chart set.
"""

from __future__ import annotations

import io
import json
import logging

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from analysis.ai_mode import LlmNotConfiguredError, run_ai_analysis
from analysis.local_mode import run_local_analysis

logger = logging.getLogger("data-analysis")

app = FastAPI(title="CMMP Data Analysis Service")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # matches @cmmp/import-engine's MAX_FILE_SIZE_BYTES
SUPPORTED_MODES = {"local", "ai"}


def _read_dataframe(filename: str, content: bytes) -> pd.DataFrame:
    lower = filename.lower()
    buffer = io.BytesIO(content)
    if lower.endswith(".csv"):
        return pd.read_csv(buffer)
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return pd.read_excel(buffer)
    raise HTTPException(status_code=400, detail=f"Unsupported file type: {filename} (expected .csv, .xlsx or .xls)")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    mode: str = Form(...),
    question: str | None = Form(default=None),
    llm_providers: str | None = Form(default=None),
) -> JSONResponse:
    if mode not in SUPPORTED_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {sorted(SUPPORTED_MODES)}, got {mode!r}")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds the maximum allowed size of {MAX_UPLOAD_BYTES // (1024 * 1024)}MB")

    try:
        df = _read_dataframe(file.filename or "upload", content)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Could not parse file as a spreadsheet: {error}") from error

    if df.empty:
        raise HTTPException(status_code=400, detail="The uploaded file has no rows")

    if mode == "local":
        result = run_local_analysis(df)
        return JSONResponse(
            {
                "mode": "local",
                "rowCount": result.row_count,
                "columnCount": result.column_count,
                "columns": result.columns,
                "charts": [{"title": c.title, "imageBase64": c.image_base64} for c in result.charts],
                "answer": None,
                "table": None,
                "error": None,
            }
        )

    # mode == "ai" — `llm_providers`, when present, is a JSON-encoded list of this tenant's own
    # UI-configured provider credentials (apps/api's DataAnalysisService resolves and forwards
    # it); malformed JSON is treated the same as "not provided" rather than a hard failure, since
    # falling back to the env-configured chain is still a reasonable outcome.
    providers_override = None
    if llm_providers:
        try:
            providers_override = json.loads(llm_providers)
        except json.JSONDecodeError:
            logger.warning("Ignoring malformed llm_providers form field (not valid JSON)")

    try:
        ai_result = run_ai_analysis(df, question, providers_override)
    except LlmNotConfiguredError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("AI-powered analysis failed")
        return JSONResponse(
            {
                "mode": "ai",
                "rowCount": len(df),
                "columnCount": len(df.columns),
                "columns": [{"name": str(col), "dtype": str(dtype)} for col, dtype in df.dtypes.items()],
                "charts": [],
                "answer": None,
                "table": None,
                "error": f"Analysis failed: {error}",
            }
        )

    return JSONResponse(
        {
            "mode": "ai",
            "rowCount": len(df),
            "columnCount": len(df.columns),
            "columns": [{"name": str(col), "dtype": str(dtype)} for col, dtype in df.dtypes.items()],
            "charts": [{"title": "AI-generated chart", "imageBase64": ai_result.chart_base64}] if ai_result.chart_base64 else [],
            "answer": ai_result.answer,
            "table": ai_result.table,
            "error": ai_result.error,
        }
    )
