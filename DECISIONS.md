# DECISIONS.md – Key Technical & Product Decisions

## Core Architectural Decisions
1. **Layered Architecture** – The system is split into five deterministic layers (Data Acquisition, Earth‑Observation Routing, Deterministic Field Intelligence, Evidence Bundle, Gemini Reasoning). This separation enables swapping data providers or AI models without rewriting the whole pipeline.
2. **Evidence‑First Approach** – Raw observations are never sent directly to Gemini. A structured **Evidence Bundle** is constructed first, guaranteeing traceability and safe grounding of LLM output.
3. **Versioned API (`/api/v1/`)** – All public endpoints live under a versioned namespace to allow future breaking changes while preserving backward compatibility via legacy `/api/*` routes.
4. **Multilingual Advisory** – Language codes are centralized in `ai.LANGS`. Adding a language requires updating this map and any front‑end localisation assets – the API payload remains language‑agnostic.
5. **Container‑First Deployment** – The Dockerfile is the canonical build artifact; the local `uvicorn` command mirrors the container entrypoint, ensuring parity between dev and production.

## Technology Choices
- **FastAPI** for high‑performance async HTTP handling.
- **Google Gemini (gemini‑3.8‑flash)** as the LLM because of its multimodal capabilities and low latency.
- **SPEAR PlanetScope representation** for high‑resolution satellite features (downstream land‑cover intelligence).
- **Earth Engine API** for fallback Earth‑Observation data when PlanetScope is unavailable.
- **Python 3.12** – latest stable release offering performance improvements and typing enhancements.

## Rejected Alternatives
| Alternative | Reason for Rejection |
|-------------|----------------------|
| Monolithic LLM prompt (send raw lat/lon) | Breaks evidence grounding; makes the system non‑deterministic and hard to audit. |
| Single‑language design (English only) | The target user base spans many Indian languages; multilingual support is a core product requirement. |
| Using a heavy web framework (Django) | FastAPI provides a lighter async stack and aligns with the container‑first philosophy. |
| Storing large data files in Git | Keeps repository size manageable; large assets are provided separately and listed in `.gitignore`. |

## Open Design Questions (Unresolved)
- **Testing Strategy** – No test suite is currently present; deciding on unit vs integration coverage is pending.
- **Front‑end UI** – Placeholder `static/index.html` exists; a full‑featured UI is slated for future work.
- **CI/CD Pipeline** – The repository lacks a configured GitHub Actions workflow; will be added alongside the test suite.
- **Observability** – Structured logging and tracing are marked as low‑priority enhancements.

---
*All future contributors should update this file when making significant architectural or product‑level decisions.*
