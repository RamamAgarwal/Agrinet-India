# HANDOFF.md – Current Development Status & Next Steps

## Completed Work
- **FastAPI server** (`app/main.py`) exposing version‑1 API endpoints:
  - `POST /api/v1/analyze`
  - `POST /api/v1/advisory`
  - `POST /api/v1/diagnose`
  - `GET /api/v1/manifest`
  - Legacy `/api/*` routes retained for backward compatibility.
- **Deterministic field‑intelligence pipeline** (`app/field_state.py`, `app/geo.py`, `app/data_sources.py`).
- **Evidence‑bundle schema** (immutable JSON structure documented in `README.md`).
- **Gemini integration** (`app/ai.py`) with structured advisory (`ADVISORY_SCHEMA_V2`) and crop‑diagnosis (`DIAGNOSIS_SCHEMA`).
- **Multilingual support** for 10 Indian languages via `ai.LANGS`.
- **Containerisation** (`Dockerfile`) for deployment on Render.
- **Helper scripts** for model training and data preparation (`scripts/`).
- **Project documentation** (`README.md`, `AGENTS.md`, `PROJECT_CONTEXT.md`).

## Known Issues & Technical Debt
1. **No automated test suite** – the repository currently lacks unit/integration tests. CI pipelines will fail without them.
2. **Error handling for external services** (Earth Engine, Gemini) is minimal; transient failures may bubble up as 502 errors.
3. **Large data assets** (`data/lookup.parquet`, model binaries) are not version‑controlled; contributors must obtain them separately.
4. **Static front‑end** – the `static/` directory only contains a placeholder `index.html`; UI enhancements are pending.
5. **Logging** – only a simple middleware placeholder exists; structured logging and request tracing are not implemented.
6. **Configuration validation** – missing/invalid env variables raise generic `RuntimeError` rather than a clean startup check.
7. **Earth Engine IAM** – the account used locally lacks `serviceusage.services.use` on the `EE_PROJECT`; without the
   `roles/serviceusage.serviceUsageConsumer` role every non-Planet location returns no vegetation/EO confidence.
8. **Gemini free-tier quota** – the free tier allows ~20 requests/day per model; once exhausted, advisory and Crop Doctor
   return a quota message. Use a billed key for demos.

## Outstanding Tasks (Prioritized)
| Priority | Task | Description |
|----------|------|-------------|
| **High** | Add test suite | Write pytest tests for the API endpoints, field‑state calculations, and AI‑prompt generation. |
| **High** | Improve error handling | Wrap external calls (`geo`, `ds.weather`, `ds.soil`, Gemini) with retries and graceful degradation, returning standardized error payloads. |
| **Medium** | Front‑end UI | Implement a responsive farmer‑facing UI (HTML/CSS/JS) that consumes the API and supports language switching. |
| **Medium** | CI/CD pipeline | Configure GitHub Actions to lint, type‑check, run tests, and build the Docker image on push. |
| **Medium** | Configuration validator | Add a startup routine that validates required env vars and prints a helpful summary before the server starts. |
| **Low** | Add structured logging | Integrate Python `logging` with JSON output and expose request IDs for tracing. |
| **Low** | Documentation refinement | Expand `SETUP.md` with Docker‑compose examples and add contribution guidelines. |

## Recommendations for the New Owner
- Clone the repository and run the **setup steps** (see `SETUP.md`).
- Verify the Gemini API key works by calling `/api/v1/health`.
- Start with the test‑suite implementation; it will surface hidden bugs in the deterministic pipeline.
- Keep the **evidence‑bundle schema** unchanged unless a new version is deliberately released – the validation logic relies on it.
- When adding new endpoints, follow the same layering principles and update `AGENTS.md` accordingly.

---
*This hand‑off file is intended to give your friend a clear snapshot of where the project stands and what to tackle next.*
