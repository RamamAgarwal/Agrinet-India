"""
Google Gemini AI integration for AgriNet India.
Responsibilities:
  A. Localized agricultural reasoning over structured evidence
  B. Multilingual advisory generation
  C. Multimodal crop disease assessment
  D. Evidence explanation (WHY traceability)

Gemini receives structured evidence and field state — NOT raw coordinates.
The deterministic Field Health Score is computed by the backend, not Gemini.
"""
import os, json, time, hashlib, logging
from google import genai
from google.genai import types, errors

log = logging.getLogger("agrinet.ai")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
LANGS = {"en": "English", "hi": "Hindi", "ta": "Tamil", "te": "Telugu", "bn": "Bengali", "mr": "Marathi",
         "pa": "Punjabi", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam"}
# Per-request HTTP timeout. Without it a stalled call keeps its worker thread busy long after the
# API deadline, and repeated language switches exhaust the thread pool so the whole UI hangs.
HTTP_TIMEOUT_MS = 28_000
_client = None
def client():
    global _client
    if _client is None:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY not set")
        _client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=HTTP_TIMEOUT_MS))
    return _client

def _json(resp):
    t = resp.text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    return json.loads(t)

def _thinking_options(model: str) -> list[types.ThinkingConfig | None]:
    """Thinking configs to try, cheapest first. Thinking tokens count against max_output_tokens, so
    unbounded thinking both slows responses and truncates the JSON (a common parse failure)."""
    m = model.lower()
    if "2.5" in m:
        return [types.ThinkingConfig(thinking_budget=128 if "pro" in m else 0), None]
    low = [types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW), None]
    return low if "pro" in m else [types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)] + low

_thinking_choice = 0  # index into _thinking_options(MODEL); advanced when the model rejects an option

def is_quota_error(e: Exception) -> bool:
    """True for a 429 caused by an exhausted (e.g. daily free-tier) quota, which retrying cannot fix."""
    return isinstance(e, errors.ClientError) and e.code == 429 and "perday" in str(e).lower().replace(" ", "")

def _generate(contents, config: types.GenerateContentConfig | None = None):
    """Call the configured model with the lowest accepted thinking level, retrying once on transient errors.

    If the model rejects a thinking config (HTTP 400), the next, less restrictive option is used
    for this and all later calls.
    """
    global _thinking_choice
    options = _thinking_options(MODEL)
    user_thinking = config is not None and config.thinking_config is not None
    retried = False
    while True:
        cfg = config
        if config is not None and not user_thinking:
            cfg = config.model_copy(update={"thinking_config": options[min(_thinking_choice, len(options) - 1)]})
        try:
            return client().models.generate_content(model=MODEL, contents=contents, config=cfg)
        except errors.ClientError as e:
            if (e.code == 400 and cfg is not None and cfg.thinking_config is not None and not user_thinking
                    and "think" in str(e).lower() and _thinking_choice < len(options) - 1):
                _thinking_choice += 1
                log.warning("Model %s rejected thinking config (%s); trying %s", MODEL, e.message, options[_thinking_choice])
                continue
            if e.code == 429 and not retried and not is_quota_error(e):
                retried = True
                log.warning("Gemini %s rate-limited; retrying once", MODEL); time.sleep(1.0); continue
            raise
        except errors.ServerError as e:
            if not retried:
                retried = True
                log.warning("Gemini %s returned %s; retrying once", MODEL, e.code); time.sleep(1.0); continue
            raise

# ──────────────────────────────────────────────
# ENHANCED ADVISORY SCHEMA (structured reasoning)
# ──────────────────────────────────────────────

ADVISORY_SCHEMA_V2 = """Return ONLY valid JSON matching this exact schema:
{
  "summary": "str (2-3 sentences, plain language overview of field condition)",
  "field_status": {
    "status": "str (good|monitor|critical)",
    "explanation": "str"
  },
  "what_the_data_shows": [
    {
      "observation": "str (what we see)",
      "evidence_id": "str (MUST be from supplied list)",
      "importance": "str"
    }
  ],
  "priority_risks": [
    {
      "risk": "str",
      "severity": "low|medium|high",
      "evidence": "str",
      "evidence_ids": ["str"],
      "why_it_matters": "str"
    }
  ],
  "immediate_actions": [
    {
      "action": "str",
      "timing": "str",
      "reason": "str",
      "priority": "now|this_week|monitor"
    }
  ],
  "soil_management": [
    {
      "action": "str",
      "reason": "str",
      "timing": "str"
    }
  ],
  "water_management": [
    {
      "action": "str",
      "reason": "str",
      "timing": "str"
    }
  ],
  "weather_response": [
    {
      "condition": "str",
      "action": "str",
      "timing": "str"
    }
  ],
  "crop_management": [
    {
      "action": "str",
      "reason": "str"
    }
  ],
  "regenerative_actions": [
    {
      "practice": "str",
      "how_to_apply": "str",
      "benefit": "str",
      "timing": "str"
    }
  ],
  "crop_options": [
    {
      "crop": "str",
      "suitability": "high|moderate|conditional",
      "reason": "str",
      "conditions": "str"
    }
  ],
  "monitoring_plan": [
    {
      "indicator": "str",
      "what_to_watch": "str",
      "when_to_check": "str",
      "action_if_condition_occurs": "str"
    }
  ],
  "why_this_advice": [
    {
      "recommendation": "str",
      "evidence_ids": ["str"],
      "reasoning": "str"
    }
  ],
  "when_to_seek_expert_help": "str",
  "confidence_note": "str"
}

If any section has no relevant evidence, return an empty list [] for it. Do NOT fabricate missing measurements.
Be concise: at most 3 items per list, and keep each text value to one or two short sentences.
"""

ADVISORY_CONFIG = dict(response_mime_type="application/json", temperature=0.3, max_output_tokens=8192)
_advisory_cache: dict = {}

def advisory(ctx: dict, lang: str):
    """Legacy advisory endpoint — works with raw context dict."""
    L = LANGS.get(lang, "English")
    prompt = f"""You are an agronomy advisor for small and marginal farmers in India. Use ONLY the data below; if data is missing or
uncertain, say so and do not invent numbers. Recommend regenerative, low-cost, locally practical options. If the land is not cropland,
say so and advise accordingly. Write every text value only in {L}, preferably in its native script. Do not include English alongside the translation. Keep JSON keys in English.
DATA: {json.dumps(ctx, ensure_ascii=False)}
{ADVISORY_SCHEMA_V2}"""
    r = _generate(contents=prompt,
        config=types.GenerateContentConfig(**ADVISORY_CONFIG))
    return _safe_parse(r)


def advisory_v2(field_state_compact: dict, evidence: list, lang: str):
    """Enhanced advisory: structured evidence-grounded reasoning.

    Args:
        field_state_compact: compact field state from field_state.field_state_for_gemini()
        evidence: list of evidence items
        lang: language code
    """
    L = LANGS.get(lang, "English")
    # Only the fields Gemini reasons over; translation keys and badges just add prompt tokens.
    prompt_evidence = [{k: e.get(k) for k in ("id", "indicator", "value", "unit", "source", "date", "interpretation")}
                       for e in evidence if isinstance(e, dict)]
    evidence_text = json.dumps(prompt_evidence, ensure_ascii=False, default=str)
    field_text = json.dumps(field_state_compact, ensure_ascii=False, default=str)
    cache_key = hashlib.sha256(f"{MODEL}|{lang}|{field_text}|{evidence_text}".encode()).hexdigest()
    if cache_key in _advisory_cache:
        return json.loads(_advisory_cache[cache_key])
    valid_evidence_ids_str = ", ".join([e.get("id", "") for e in evidence if "id" in e])

    prompt = f"""You are an agronomy advisor for small and marginal farmers in India.

TASK: Analyze the FIELD STATE and EVIDENCE BUNDLE below. Produce a structured advisory.

RULES:
1. Use ONLY the data provided. Do NOT invent measurements or statistics.
2. Reference evidence IDs from the bundle when explaining risks and recommendations.
3. Use only evidence IDs from the supplied evidence list [{valid_evidence_ids_str}]. Never invent, modify, or fabricate an evidence ID.
4. If data is missing or uncertain, acknowledge it. Do NOT fabricate missing measurements.
5. Recommend regenerative, low-cost, locally practical options.
6. If the land is not cropland, say so and advise accordingly.
7. Write every text value only in {L} (simple words, no jargon), preferably in its native script. Do not include English alongside the translation.
8. Keep all JSON keys in English.
9. The Field Health Score is deterministic (computed by the system). You may explain it but do NOT recalculate it.
10. Each recommendation must have a clear WHY linked to specific evidence.
11. Give specific timing: now, next 24-48 hours, next 3-7 days, monitor over the coming weeks. Only use timing when justified by the supplied evidence.
12. Never create fake precision (do not invent fertilizer quantities, irrigation quantities, yield predictions).

FIELD STATE:
{field_text}

EVIDENCE BUNDLE:
{evidence_text}

{ADVISORY_SCHEMA_V2}"""

    r = _generate(contents=prompt,
        config=types.GenerateContentConfig(**ADVISORY_CONFIG))
    
    parsed = _safe_parse(r)
    
    # Enforce evidence safety validation in Python post-processing
    valid_ids = set([e.get("id") for e in evidence if "id" in e])
    
    def validate_ids(obj):
        if isinstance(obj, dict):
            for k in list(obj.keys()):
                if k == "evidence_ids" and isinstance(obj[k], list):
                    obj[k] = [eid for eid in obj[k] if eid in valid_ids]
                elif k == "evidence_id" and isinstance(obj[k], str):
                    if obj[k] not in valid_ids:
                        obj[k] = ""
                else:
                    validate_ids(obj[k])
        elif isinstance(obj, list):
            for item in obj:
                validate_ids(item)

    validate_ids(parsed)
    # Cache only real advisories; parser fallbacks should be retried.
    if isinstance(parsed, dict) and "_raw" not in parsed:
        _advisory_cache[cache_key] = json.dumps(parsed, ensure_ascii=False)
        if len(_advisory_cache) > 128:
            _advisory_cache.pop(next(iter(_advisory_cache)))
    return parsed

# ──────────────────────────────────────────────

DIAGNOSIS_SCHEMA = """Return ONLY valid JSON:
{
  "crop": "str (identified crop)",
  "healthy": "bool",
  "likely_issue": "str (most likely disease/issue or 'healthy')",
  "diagnosis": "str (detailed diagnosis)",
  "confidence": "low|medium|high",
  "observed_symptoms": ["str"],
  "recommended_action": ["str (immediate actions)"],
  "treatment_organic": ["str"],
  "treatment_chemical": ["str (only if needed; advise consulting the local Krishi Vigyan Kendra)"],
  "prevention": ["str"],
  "expert_escalation": "str (when to seek expert help)",
  "disclaimer": "AI-assisted crop disease assessment — not laboratory confirmation. Verify with agricultural extension officer."
}
If the image is not a plant or is too unclear, set healthy=false, likely_issue="cannot determine" and explain in observed_symptoms.
"healthy" must be a JSON boolean (true/false). Be concise: at most 4 items per list, one short sentence each."""

_diagnosis_cache = {}

def diagnose(image: bytes, mime: str, lang: str, crop: str = "", field_context: dict = None):
    """Multimodal crop disease assessment with optional field context."""
    L = LANGS.get(lang, "English")
    hint = f" (crop: {crop})" if crop else ""

    context_section = ""
    if field_context:
        cover = field_context.get("land_cover", {}) if isinstance(field_context, dict) else {}
        vegetation = field_context.get("vegetation", {}) if isinstance(field_context, dict) else {}
        compact_context = {
            "land_cover": cover.get("class") if isinstance(cover, dict) else cover,
            "is_cropland": cover.get("is_cropland") if isinstance(cover, dict) else None,
            "ndvi": vegetation.get("ndvi") if isinstance(vegetation, dict) else None,
            "ndwi": vegetation.get("ndwi") if isinstance(vegetation, dict) else None,
        }
        context_section = f"""
FIELD CONTEXT (use to provide more specific advice):
{json.dumps(compact_context, ensure_ascii=False, default=str)}
"""
    else:
        compact_context = {}

    prompt = f"""You are a plant pathologist helping an Indian farmer. Examine this crop photo{hint}.
{context_section}
{DIAGNOSIS_SCHEMA}
Write every user-facing text value only in {L}, preferably using its native script. Do not include English alongside the translation; keep JSON keys and standard crop/scientific abbreviations in English."""

    cache_context = json.dumps(compact_context, sort_keys=True, ensure_ascii=False, default=str)
    cache_key = hashlib.sha256(image + lang.encode() + crop.encode() + cache_context.encode()).hexdigest()
    if cache_key in _diagnosis_cache:
        return dict(_diagnosis_cache[cache_key])
    r = _generate(
        contents=[types.Part.from_bytes(data=image, mime_type=mime), prompt],
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0, seed=0, max_output_tokens=4096))
    result = _safe_parse(r)
    cacheable = isinstance(result, dict) and bool(result.get("diagnosis")) and "_raw" not in result
    if not isinstance(result, dict):
        result = {}
    if "_raw" in result:
        result = {
            "healthy": False,
            "likely_issue": "Could not determine",
            "diagnosis": "The image response could not be read. Please retry with a clear, well-lit crop photo.",
            "confidence": "low",
            "observed_symptoms": [],
            "recommended_action": [],
            "expert_escalation": "Please consult a local agricultural expert if the issue persists.",
            "_raw": result.get("_raw", ""),
        }
    # Ensure backward compatibility
    if "likely_issue" not in result:
        result["likely_issue"] = result.get("diagnosis", "unknown")
    if not result.get("diagnosis"):
        result["diagnosis"] = result.get("summary", "The image could not be assessed clearly. Please try another photo.")
    if isinstance(result.get("healthy"), str):
        result["healthy"] = result["healthy"].strip().lower() in ("true", "yes", "1")
    elif not isinstance(result.get("healthy"), bool):
        result["healthy"] = False
    if isinstance(result.get("confidence"), str):
        result["confidence"] = result["confidence"].strip().lower()
    if result.get("confidence") not in ("low", "medium", "high"):
        result["confidence"] = "low"
    if "recommended_action" not in result:
        result["recommended_action"] = result.get("treatment_organic", [])
    if not isinstance(result["recommended_action"], list):
        result["recommended_action"] = [str(result["recommended_action"])] if result["recommended_action"] else []
    if "expert_escalation" not in result:
        result["expert_escalation"] = result.get("when_to_seek_expert", "")
    if "observed_symptoms" not in result:
        result["observed_symptoms"] = result.get("symptoms_seen", [])
    if not isinstance(result["observed_symptoms"], list):
        result["observed_symptoms"] = [str(result["observed_symptoms"])] if result["observed_symptoms"] else []
    # The UI joins these lists as text, so flatten any object items the model returns.
    for k in ("observed_symptoms", "recommended_action"):
        result[k] = [x if isinstance(x, str) else " ".join(str(v) for v in x.values()) if isinstance(x, dict) else str(x)
                     for x in result[k] if x]
    result.setdefault("expert_escalation", result.get("when_to_seek_expert", "Consult a local agricultural expert if symptoms continue."))
    # Do not cache provider/parser fallback text; later attempts may succeed.
    if cacheable:
        _diagnosis_cache[cache_key] = dict(result)
        if len(_diagnosis_cache) > 64:
            _diagnosis_cache.pop(next(iter(_diagnosis_cache)))
    return result


# ──────────────────────────────────────────────
# SAFE JSON PARSING
# ──────────────────────────────────────────────

def _safe_parse(resp):
    """Parse Gemini response JSON with fallback handling."""
    try:
        return _json(resp)
    except (json.JSONDecodeError, AttributeError):
        # Try to extract JSON from response text
        text = resp.text.strip() if resp and resp.text else ""
        # Try finding JSON block
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        # Return raw text as summary fallback
        return {
            "summary": text[:500] if text else "AI response could not be parsed.",
            "field_condition": "Unable to generate structured advisory.",
            "risks": [],
            "recommendations": [],
            "regenerative_actions": [],
            "crop_options": [],
            "weather_actions": [],
            "soil_actions": [],
            "confidence_note": "Response parsing failed — showing raw AI output.",
            "_raw": text[:1000],
        }


def is_available() -> bool:
    """Check if Gemini API is configured."""
    return bool(os.getenv("GEMINI_API_KEY"))
