"""
AgriNet India — Digital Public Good Prototype API.
Interoperable agricultural network with field intelligence, health scoring,
and evidence-grounded Gemini AI advisory.
"""
import asyncio
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import json
import typing

class UJSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"
    
    def render(self, content: typing.Any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")

from . import geo, data_sources as ds, ai, field_state as fs, scenarios

app = FastAPI(title="AgriNet India", version="0.1", description="Interoperable agro-advisory API (digital public good prototype)", default_response_class=UJSONResponse)
STATIC = Path(__file__).resolve().parent.parent / "static"

#
# ─── V1 DATA MODELS ──────────────────────────────────────────
#
class AnalyzeRequest(BaseModel):
    lat: float
    lon: float
    lang: str = "en"
    crop: str = ""
    is_demo: bool = False
    scenario_key: str = ""

class AdvisoryRequestV1(BaseModel):
    field_state: dict
    evidence: list
    lang: str = "en"


async def _land_with_deadline(lat: float, lon: float) -> dict:
    """Return EO results promptly when a remote Earth Engine request stalls."""
    try:
        return await asyncio.wait_for(asyncio.to_thread(geo.analyze_land, lat, lon), timeout=12)
    except asyncio.TimeoutError:
        return {"source": "none", "land_cover": "unknown", "note": "Earth observation query timed out."}

#
# ─── MIDDLEWARE FOR FALLBACK HANDLING ────────────────────────
#
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    # This middleware could be extended for logging, timing, etc.
    response = await call_next(request)
    return response

#
# ─── NEW V1 API ENDPOINTS ─────────────────────────────────────
#
@app.post("/api/v1/analyze")
async def analyze_v1(p: AnalyzeRequest):
    """
    V1 Analyze: Returns the complete Field State and Evidence Bundle.
    This is the core interoperable contract.
    """
    if p.scenario_key:
        scen = scenarios.get_scenario(p.scenario_key)
        if scen:
            # Reconstruct field state from scenario
            fs_data = fs.assemble_field_state(
                scen["lat"], scen["lon"], scen["land"],
                scen["weather"], scen["soil"],
                crop=scen["crop"], is_demo=True,
                scenario_key=p.scenario_key
            )
            return {
                "field_state": fs_data,
                "evidence": fs_data.get("evidence", []),
                "provenance": fs_data.get("provenance", {}),
                "is_demo": True
            }
        raise HTTPException(404, "Scenario not found")

    if not (6 <= p.lat <= 38 and 67 <= p.lon <= 98):
        raise HTTPException(400, "Location is outside India")

    # Fetch data concurrently; catch failures gracefully inside ds modules
    land, wx, soil = await asyncio.gather(
        _land_with_deadline(p.lat, p.lon),
        ds.weather(p.lat, p.lon),
        ds.soil(p.lat, p.lon)
    )

    # Assemble and return the complete field state contract
    fs_data = fs.assemble_field_state(
        p.lat, p.lon, land, wx, soil, crop=p.crop, is_demo=p.is_demo
    )
    return {
        "field_state": fs_data,
        "evidence": fs_data.get("evidence", []),
        "provenance": fs_data.get("provenance", {}),
        "is_demo": p.is_demo
    }

@app.post("/api/v1/advisory")
async def advisory_v1(r: AdvisoryRequestV1):
    """
    V1 Advisory: Gemini reasoning over the structured Field State and Evidence.
    """
    land_class = str(r.field_state.get("land_cover", {}).get("class", "")).lower().replace("_", " ")
    if land_class in {"water", "water body", "water bodies"}:
        return {"summary": "No land detected at this location.", "field_condition": "AI advisory is unavailable for water bodies.", "risks": [], "recommendations": [], "regenerative_actions": [], "crop_options": [], "confidence_note": "No land detected."}

    if not ai.is_available():
        # Fallback if Gemini key is missing
        return {
            "summary": "AI reasoning is currently unavailable. Displaying deterministic field evidence.",
            "field_condition": "Offline mode active.",
            "risks": [], "recommendations": [],
            "regenerative_actions": [], "crop_options": [],
            "confidence_note": "API Key missing or service offline."
        }
    
    compact_fs = fs.field_state_for_gemini(r.field_state)
    try:
        return await asyncio.to_thread(ai.advisory_v2, compact_fs, r.evidence, r.lang)
    except Exception as e:
        # Don't crash; return a graceful fallback advisory
        print(f"Gemini error: {e}")
        return {
            "summary": "AI reasoning temporarily unavailable.",
            "field_condition": "Service error occurred.",
            "risks": [{"risk": "Service Connectivity", "reason": "Could not reach AI provider.", "evidence_ids": []}],
            "recommendations": [], "regenerative_actions": [], "crop_options": [],
            "confidence_note": "Fallback state activated due to generation error."
        }

@app.post("/api/v1/diagnose")
async def diagnose_v1(
    image: UploadFile = File(...),
    lang: str = Form("en"),
    crop: str = Form(""),
    field_context_json: str = Form("")
):
    """
    V1 Diagnose: Multimodal crop disease assessment with optional field context.
    """
    data = await image.read()
    if len(data) > 8_000_000:
        raise HTTPException(413, "Image too large (max 8 MB)")
    if not data:
        raise HTTPException(400, "Image is empty")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(415, "Unsupported image format")
        
    context = None
    if field_context_json:
        import json
        try:
            context = json.loads(field_context_json)
        except:
            pass # Ignore invalid JSON
            
    try:
        return await asyncio.to_thread(ai.diagnose, data, image.content_type or "image/jpeg", lang, crop, context)
    except Exception as e:
        print(f"Gemini error: {e}")
        return {
            "healthy": False,
            "likely_issue": "AI Diagnosis Unavailable",
            "diagnosis": "Could not complete diagnosis due to service error.",
            "confidence": "low",
            "observed_symptoms": [], "recommended_action": [],
            "expert_escalation": "Please consult a local expert."
        }

@app.get("/api/v1/manifest")
def manifest_v1():
    """V1 DPG Manifest: Expanded interoperability contract."""
    return {
        "network_id": "agrinet-india",
        "schema_version": "1.0",
        "type": "Digital Public Good Prototype",
        "license": "CC-BY-4.0 (data) / Apache-2.0 (code)",
        "capabilities": [
            "Satellite Intelligence (PlanetScope, Sentinel-2)",
            "Soil Health (SoilGrids)",
            "Weather Risk (Open-Meteo)",
            "Deterministic Field Health Scoring",
            "Contextual SPEAR Earth Observation",
            "AI Advisory (Google Gemini)",
            "Multimodal Crop Doctor"
        ],
        "endpoints": {
            "analyze": "/api/v1/analyze (Field State Generation)",
            "advisory": "/api/v1/advisory (Evidence-grounded Reasoning)"
        },
        "supported_languages": list(ai.LANGS.keys()),
        "data_abstractions": [
            "State Data Adapter Plugin Model",
            "Common Field State Schema",
            "Evidence Bundle Standard"
        ]
    }

@app.get("/api/scenarios")
def api_scenarios():
    """List available demo scenarios."""
    return {"scenarios": scenarios.list_scenarios()}

@app.get("/api/network")
def api_network():
    """List network nodes/states."""
    return {"states": scenarios.NETWORK_STATES}


#
# ─── LEGACY ENDPOINTS (PRESERVED FOR BACKWARD COMPATIBILITY) ─
#
class Plot(BaseModel):
    lat: float
    lon: float
    lang: str = "en"

@app.get("/api/health")
def health(): return {"ok": True, "ai_configured": ai.is_available()}

@app.post("/api/analyze")
async def analyze(p: Plot):
    if not (6 <= p.lat <= 38 and 67 <= p.lon <= 98): raise HTTPException(400, "Location is outside India")
    land, wx, soil = await asyncio.gather(_land_with_deadline(p.lat, p.lon), ds.weather(p.lat, p.lon), ds.soil(p.lat, p.lon))
    return {"location": {"lat": p.lat, "lon": p.lon}, "land": land, "weather": wx, "soil": soil}

class AdvisoryReq(BaseModel):
    context: dict
    lang: str = "en"

@app.post("/api/advisory")
async def advisory(r: AdvisoryReq):
    ctx = dict(r.context)
    if "land" in ctx:
        land = {k: v for k, v in ctx["land"].items() if k != "ndvi_series" and k != "ndwi_series"}
        land["ndvi_last_5"] = ctx["land"].get("ndvi_series", [])[-5:]
        ctx["land"] = land
    if "weather" in ctx: ctx["weather"] = {k: v for k, v in ctx["weather"].items() if k in ("past7_rain_mm", "next7_rain_mm", "error")} | {"tmax_next7": ctx["weather"].get("tmax", [])[7:], "rain_next7": ctx["weather"].get("rain_mm", [])[7:]}
    try: return await asyncio.to_thread(ai.advisory, ctx, r.lang)
    except Exception as e: raise HTTPException(502, f"Gemini error: {e}")

@app.post("/api/diagnose")
async def diagnose(image: UploadFile = File(...), lang: str = Form("en"), crop: str = Form("")):
    data = await image.read()
    if len(data) > 8_000_000: raise HTTPException(413, "Image too large (max 8 MB)")
    try: return await asyncio.to_thread(ai.diagnose, data, image.content_type or "image/jpeg", lang, crop)
    except Exception as e: raise HTTPException(502, f"Gemini error: {e}")

@app.get("/api/dpg/manifest")
def manifest():
    return manifest_v1() # Point to new manifest


#
# ─── FRONTEND MOUNT ──────────────────────────────────────────
#
app.mount("/static", StaticFiles(directory=STATIC), name="static")

@app.get("/")
def index(): return FileResponse(STATIC / "index.html")
