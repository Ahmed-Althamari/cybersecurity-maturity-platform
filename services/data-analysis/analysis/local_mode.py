"""Privacy-preserving analysis: AutoViz only, zero LLM calls, data never leaves this process.

For tenants who don't want their spreadsheet data sent to any external LLM — AutoViz runs
entirely offline against the DataFrame in memory, no network calls of any kind. Verified
against a real installed autoviz 0.1.807: `AutoViz_Class.AutoViz(...)` only writes chart files
to disk when `verbose=2` (verbose=0/1 render inline for a notebook and save nothing), so that's
required here even though we don't want its console output at info level in a server process.
"""

from __future__ import annotations

import base64
import glob
import os
import tempfile
from dataclasses import dataclass, field

import matplotlib

matplotlib.use("Agg")  # headless: no display available in a server process

import pandas as pd
from autoviz import AutoViz_Class


@dataclass
class Chart:
    title: str
    image_base64: str


@dataclass
class LocalAnalysisResult:
    row_count: int
    column_count: int
    columns: list[dict[str, str]]
    charts: list[Chart] = field(default_factory=list)


def _humanize(filename: str) -> str:
    name = os.path.splitext(os.path.basename(filename))[0]
    return name.replace("_", " ").strip()


def run_local_analysis(df: pd.DataFrame) -> LocalAnalysisResult:
    columns = [{"name": str(col), "dtype": str(dtype)} for col, dtype in df.dtypes.items()]

    with tempfile.TemporaryDirectory(prefix="autoviz-") as plot_dir:
        av = AutoViz_Class()
        av.AutoViz(
            filename="",
            sep=",",
            depVar="",
            dfte=df,
            chart_format="png",
            max_rows_analyzed=150_000,
            max_cols_analyzed=30,
            save_plot_dir=plot_dir,
            verbose=2,
        )

        charts: list[Chart] = []
        for path in sorted(glob.glob(os.path.join(plot_dir, "**", "*.png"), recursive=True)):
            with open(path, "rb") as f:
                image_base64 = base64.b64encode(f.read()).decode("utf-8")
            charts.append(Chart(title=_humanize(path), image_base64=image_base64))

    return LocalAnalysisResult(
        row_count=len(df),
        column_count=len(df.columns),
        columns=columns,
        charts=charts,
    )
