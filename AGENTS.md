# AGENTS.md – Antigravity Project Directives

## Purpose
This file provides **persistent instructions** for any Antigravity agent that opens the repository. It is automatically discovered by Antigravity because it lives at the repository root.

## Architecture Constraints
- **Layered Architecture** – Preserve the five logical layers: Data Acquisition → Earth‑Observation Routing → Deterministic Field Intelligence → Evidence Bundle → Gemini Reasoning.
- **API Contract** – The public API lives under `/api/v1/` and must continue to expose the endpoints defined in `app/main.py` with the exact request/response schemas (`/analyze`, `/advisory`, `/diagnose`, `/manifest`). Legacy `/api/*` endpoints must remain backward compatible.
- **Evidence Bundle Schema** – The JSON structure (id, type, indicator, value, unit, source, date, interpretation, confidence) described in the README is immutable. Additions must retain these fields and be version‑controlled.
- **Multilingual Support** – Language codes are keys of `ai.LANGS`. Adding a language requires updating that mapping and front‑end localisation files – never change the API payload semantics.
- **Environment Variables** – The `.env` file must contain exactly the variables listed in `.env.example`. Do **not** rename or remove them without updating the Dockerfile and startup scripts.

## Coding Conventions
- Use **type‑annotated** Python 3.12 code.
- Follow existing naming style (`snake_case` for functions, `PascalCase` for classes).
- Public functions must have comprehensive docstrings and Pydantic models where appropriate.
- Keep the `app/` package free of side‑effects on import; initialise heavy resources lazily.
- Add logging via the middleware in `app/main.py` (line 53); avoid `print` statements.
- New dependencies must be pinned in `requirements.txt` and installed via the existing Dockerfile steps.

## Things Not to Change Without Approval
- Manifest structure returned by `/api/v1/manifest`.
- Evidence identifier format (e.g., `SAT‑NDVI‑001`).
- Dockerfile base image (`python:3.12-slim`).
- Directory layout (`app/`, `static/`, `data/`, `models/`).
- `.gitignore` rules that protect large data files.

## Recommended Workflow for Contributors
1. Run `git status` – ensure no secrets or large data files are staged.
2. Create a feature branch and reference the relevant issue.
3. Run the test suite (`pytest`) before pushing.
4. Update documentation (`PROJECT_CONTEXT.md`, `HANDOFF.md`) for any public‑facing change.
5. Submit a pull request – CI will verify linting, type‑checking, and Docker image build.

---
*Antigravity will read this file on startup to enforce the above policies.*
