import numpy as np
import pandas as pd

from analysis.local_mode import run_local_analysis


def test_run_local_analysis_produces_charts_with_zero_llm_calls():
    rng = np.random.default_rng(0)
    df = pd.DataFrame(
        {
            "category": rng.choice(["A", "B", "C"], 60),
            "score": rng.integers(1, 5, 60),
            "maturity": rng.random(60) * 5,
        }
    )

    result = run_local_analysis(df)

    assert result.row_count == 60
    assert result.column_count == 3
    assert {c["name"] for c in result.columns} == {"category", "score", "maturity"}
    assert len(result.charts) > 0
    for chart in result.charts:
        assert chart.title
        assert len(chart.image_base64) > 100
