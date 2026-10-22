# CHANGELOG.md – Summary of Significant Changes

## [Unreleased]
- Initial project scaffolding (FastAPI server, layered architecture).
- Implemented deterministic field‑intelligence pipeline (`field_state`, `geo`, `data_sources`).
- Defined immutable **Evidence Bundle** JSON schema.
- Integrated Google Gemini for structured advisory (`advisory_v2`) and multimodal crop diagnosis.
- Added multilingual support for 10 Indian languages.
- Exposed versioned API under `/api/v1/` with endpoints:
  - `POST /api/v1/analyze`
  - `POST /api/v1/advisory`
  - `POST /api/v1/diagnose`
  - `GET /api/v1/manifest`
- Preserved legacy `/api/*` routes for backward compatibility.
- Containerised the application with `Dockerfile` (Python 3.12‑slim). 
- Added documentation files: `README.md`, `AGENTS.md`, `PROJECT_CONTEXT.md`, `HANDOFF.md`, `SETUP.md`.
- Added helper scripts for model training and data preparation.

## [0.1.0] – 2026‑10‑20
- Public release of the prototype as a Digital Public Good (DPG).
- First commit of source code and documentation.
- Initial CI configuration (placeholder, test suite pending).

---
*All future changes should be recorded here following semantic versioning.*
