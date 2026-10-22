# PROJECT_CONTEXT.md – Comprehensive Overview

## Repository Layout
```
agrinet-india/
├─ app/               # Python package with FastAPI server and core logic
│   ├─ __init__.py
│   ├─ main.py        # Entry point, API routes, middleware
│   ├─ ai.py          # Gemini integration (advisory & diagnosis)
│   ├─ geo.py         # Satellite / land analysis utilities
│   ├─ data_sources.py# Weather & soil data fetchers
│   ├─ field_state.py # Deterministic field‑health calculations
│   ├─ scenarios.py   # Demo scenario definitions
│   └─ other modules…
├─ static/            # Front‑end assets (HTML, CSS, JS) served by FastAPI
├─ data/              # Pre‑computed lookup tables & classifier embeddings
│   ├─ lookup.parquet
│   └─ classifier_emb.joblib
├─ models/            # Trained ML models for SPEAR PlanetScope intelligence
│   ├─ planet_mae_ckpt_32.pt
│   └─ planet_scaler_32.joblib
├─ scripts/           # Helper scripts for data prep & model training
├─ Dockerfile         # Container build definition
├─ requirements.txt   # Python dependencies (FastAPI, Gemini, etc.)
├─ .env.example       # Template for environment variables
├─ .gitignore         # Excludes virtualenvs, caches, large data files
└─ README.md          # Detailed project description & architecture
```

## Core Architecture (5 Logical Layers)
1. **Data Acquisition** – Satellite (PlanetScope, Sentinel‑2, Dynamic World), soil (SoilGrids), weather (Open‑Meteo). Implemented in `app/geo.py` and `app/data_sources.py`.
2. **Earth‑Observation Routing** – Chooses PlanetScope when available within a 300 m radius (configurable via `PLANET_RADIUS_M`), otherwise falls back to Earth Engine routes.
3. **Deterministic Field Intelligence** – Computes NDVI, NDWI, land‑cover, soil pH, rainfall, etc. (`app/field_state.py`). Results are **purely deterministic** and stored in the `field_state` dict.
4. **Evidence Bundle** – Normalises each measurement into a JSON record with fields `id, type, indicator, value, unit, source, date, interpretation, confidence`. Immutable schema defined in the README.
5. **Gemini Reasoning** – Consumes the structured `field_state` & `evidence` to produce a **structured advisory** (`app/ai.py` – `advisory_v2`) or a **crop‑disease diagnosis** (`ai.diagnose`). All prompts enforce “use only supplied evidence”.

## API Contract (Version 1)
- `POST /api/v1/analyze` → returns `{field_state, evidence, provenance, is_demo}`.
- `POST /api/v1/advisory` → requires `{field_state, evidence, lang}` and returns a JSON advisory adhering to `ADVISORY_SCHEMA_V2`.
- `POST /api/v1/diagnose` → multipart image + optional `field_context_json`; returns `DIAGNOSIS_SCHEMA`.
- `GET /api/v1/manifest` – DPG manifest with capabilities list.
- Legacy `/api/*` endpoints remain for backward compatibility.

## Data Flow Example
```
Client → /api/v1/analyze (lat,lon) →
   geo.analyze_land + ds.weather + ds.soil (async) →
   field_state.assemble_field_state →
   Evidence Bundle (JSON) → returned to client.

Client → /api/v1/advisory (field_state, evidence) →
   ai.advisory_v2 builds prompt → Gemini generates JSON →
   post‑processing validates evidence IDs → advisory JSON returned.
```

## Key Dependencies
- `fastapi==0.115.*`, `uvicorn[standard]==0.30.*`
- `google-genai` (Gemini client)
- `earthengine-api` (EE data access)
- `pandas`, `numpy`, `scikit-learn==1.8.*`, `joblib`
- `httpx` (async HTTP calls)

## Setup & Runtime Requirements
- Python 3.12 (slim Docker base image).
- Environment variables defined in `.env.example`:
  - `GEMINI_API_KEY` (or Vertex AI auth)
  - `GEMINI_MODEL` (default `gemini-3.8-flash`)
  - `EE_PROJECT` (Google Earth Engine project)
  - `PLANET_RADIUS_M` (lookup radius, default 300)
- Large data files (`data/lookup.parquet`, model binaries) are **not** tracked in Git and must be present at runtime (provided with the repo tarball or fetched separately).

---
*This file is intended for developers to quickly understand the codebase, data pipeline, and API contract.*
