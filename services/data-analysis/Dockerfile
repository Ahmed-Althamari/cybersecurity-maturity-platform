# Production image for the data-analysis microservice (FastAPI + PandasAI + AutoViz).
#
# Isolated from apps/api and apps/web's Node build entirely — different language runtime,
# built and shipped independently. Build from the repo root:
#   docker build -f services/data-analysis/Dockerfile -t cmmp-data-analysis services/data-analysis

FROM python:3.11-slim

# libgomp1: required by some of matplotlib/autoviz's numeric dependencies at import time.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY analysis/ ./analysis/
COPY main.py .

RUN useradd --system --uid 1001 dataanalysis
USER dataanalysis

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
