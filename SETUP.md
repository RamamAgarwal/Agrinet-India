# SETUP.md – Installation & Run Instructions

## Prerequisites
- **Operating System**: Windows, macOS, or Linux (Docker works on all).
- **Python**: 3.12 (the Docker image uses `python:3.12-slim`).
- **Docker**: Optional, for containerised deployment.
- **Google Gemini API Key**: Obtain from https://aistudio.google.com or use Vertex AI with appropriate IAM.
- **Google Earth Engine (EE) Project**: Enable EE API and note the GCP project ID.

## 1. Clone the Repository
```bash
git clone <repo-url> agrinet-india
cd agrinet-india
```

## 2. Prepare Environment Variables
1. Copy the template:
```bash
copy .env.example .env   # Windows
# or
cp .env.example .env      # Unix/macOS
```
2. Edit `.env` and fill in the required values:
```
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.8-flash   # or another supported model
EE_PROJECT=your-gcp-project-id
PLANET_RADIUS_M=300            # radius in metres for PlanetScope lookup
```
> **Never** commit `.env` to version control – it is excluded via `.gitignore`.

## 3. Install Python Dependencies (local dev)
```bash
python -m venv .venv
.venv\Scripts\activate      # Windows PowerShell
# source .venv/bin/activate   # macOS/Linux
pip install --upgrade pip
pip install -r requirements.txt
```

## 4. Verify Data Assets
- Ensure the `data/` directory contains `lookup.parquet` and `classifier_emb.joblib` (large files are not tracked by Git).
- Ensure the `models/` directory contains the PlanetScope model files (`planet_mae_ckpt_32.pt`, `planet_scaler_32.joblib`).

## 5. Run the FastAPI Server (local)
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080
```
- Open a browser at `http://localhost:8080` – the static front‑end will be served from `static/`.
- Health endpoint: `GET http://localhost:8080/api/health` should return `{"ok": true, "ai_configured": true}` if the Gemini key is correctly set.

## 6. Dockerised Deployment (recommended for Render / production)
1. Build the image:
```bash
docker build -t agrinet-india .
```
2. Run locally for testing:
```bash
docker run -p 8080:8080 --env-file .env agrinet-india
```
3. Deploy to Render (or any container platform) by pushing the Dockerfile and configuring the environment variables in the platform UI.

## 7. Running Tests (once a test suite is added)
```bash
pytest
```
The CI workflow (GitHub Actions) will execute this on every push.

---
*Follow these steps on a fresh machine to get the application up and running.*
