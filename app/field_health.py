"""
Deterministic Field Health Score (0–100).
Gemini NEVER calculates this score — it is purely algorithmic.
Components:
  Vegetation  40%
  Weather     25%
  Soil        20%
  EO conf     15%
If any component is unavailable, the remaining weights are renormalized.
"""
import math

WEIGHTS = {
    "vegetation": 0.40,
    "weather": 0.25,
    "soil": 0.20,
    "eo_confidence": 0.15,
}

STATUS_THRESHOLDS = [
    (80, "healthy"),
    (60, "watch"),
    (0, "stressed"),
]


def _vegetation_score(land: dict) -> float | None:
    """Score vegetation from NDVI (0–1 mapped to 0–100)."""
    ndvi = land.get("ndvi_latest")
    if ndvi is None:
        series = land.get("ndvi_series", [])
        if series:
            ndvi = series[-1].get("ndvi")
    if ndvi is None:
        return None
    # NDVI mapping: < 0.1 → 0, 0.1–0.2 → 20, 0.6+ → 95
    if ndvi < 0.1:
        return max(0, ndvi * 100)
    if ndvi > 0.8:
        return 95
    # Linear interpolation between 0.1 (score 15) and 0.8 (score 95)
    return 15 + (ndvi - 0.1) / 0.7 * 80


def _weather_score(weather: dict) -> float | None:
    """Score weather conditions from rainfall and temperature."""
    if weather.get("error"):
        return None
    past_rain = weather.get("past7_rain_mm")
    next_rain = weather.get("next7_rain_mm")
    tmax_list = weather.get("tmax", [])

    if past_rain is None and next_rain is None:
        return None

    scores = []
    # Rainfall adequacy (not too little, not too much)
    if past_rain is not None:
        if past_rain < 2:
            scores.append(30)  # Very dry
        elif past_rain < 10:
            scores.append(55)  # Low rain
        elif past_rain < 50:
            scores.append(85)  # Good rain
        elif past_rain < 100:
            scores.append(65)  # Heavy rain
        else:
            scores.append(35)  # Flood risk

    if next_rain is not None:
        if next_rain < 2:
            scores.append(35)
        elif next_rain < 10:
            scores.append(55)
        elif next_rain < 50:
            scores.append(80)
        elif next_rain < 100:
            scores.append(60)
        else:
            scores.append(30)

    # Temperature stress
    if tmax_list:
        recent_tmax = [t for t in tmax_list[-7:] if t is not None]
        if recent_tmax:
            avg_tmax = sum(recent_tmax) / len(recent_tmax)
            if avg_tmax > 42:
                scores.append(20)
            elif avg_tmax > 38:
                scores.append(45)
            elif avg_tmax > 35:
                scores.append(65)
            elif avg_tmax > 25:
                scores.append(85)
            elif avg_tmax > 15:
                scores.append(75)
            else:
                scores.append(50)  # Cold stress

    return sum(scores) / len(scores) if scores else None


def _soil_score(soil: dict) -> float | None:
    """Score soil from SoilGrids topsoil data."""
    if soil.get("error"):
        return None
    top = soil.get("topsoil_0_5cm")
    if not top:
        return None

    scores = []
    # pH (ideal 6.0–7.5)
    ph = top.get("phh2o")
    if ph is not None:
        if 6.0 <= ph <= 7.5:
            scores.append(90)
        elif 5.5 <= ph <= 8.0:
            scores.append(70)
        elif 5.0 <= ph <= 8.5:
            scores.append(50)
        else:
            scores.append(30)

    # Soil organic carbon (g/kg; higher is better, up to ~30)
    soc = top.get("soc")
    if soc is not None:
        if soc > 25:
            scores.append(95)
        elif soc > 15:
            scores.append(80)
        elif soc > 8:
            scores.append(65)
        elif soc > 3:
            scores.append(45)
        else:
            scores.append(25)

    # Nitrogen (mg/kg)
    n = top.get("nitrogen")
    if n is not None:
        if n > 2.0:
            scores.append(90)
        elif n > 1.0:
            scores.append(75)
        elif n > 0.5:
            scores.append(55)
        else:
            scores.append(35)

    # Clay/sand ratio (good soil = balanced)
    clay = top.get("clay")
    sand = top.get("sand")
    if clay is not None and sand is not None:
        # Loamy soil (20-40% clay) is ideal
        if 20 <= clay <= 40:
            scores.append(85)
        elif 10 <= clay <= 50:
            scores.append(65)
        else:
            scores.append(40)

    return sum(scores) / len(scores) if scores else None


def _eo_confidence_score(land: dict) -> float | None:
    """Score based on EO data confidence and agreement."""
    source = land.get("source")
    if source == "none":
        return None

    score = 50  # Base

    conf = land.get("confidence")
    if conf is not None:
        score = conf * 100

    # Bonus for cross-check agreement
    model = land.get("model_prediction", {})
    if model.get("agrees_with_label"):
        score = min(100, score + 10)

    cross = land.get("cross_check")
    if cross:
        score = min(100, score + 5)

    # Source quality
    if source == "planet_highres":
        score = min(100, score + 5)  # High-res bonus

    return min(100, max(0, score))


WATER_CLASSES = {"water", "water body", "water bodies"}


def is_water_cover(cover: object) -> bool:
    """True when a land-cover label (e.g. Dynamic World "water") denotes a water body rather than land."""
    return str(cover or "").strip().lower().replace("_", " ") in WATER_CLASSES


def compute_field_health(land: dict, weather: dict, soil: dict) -> dict:
    """Compute deterministic field health score. Returns score, status, components.

    Water bodies yield status "no_land_detected" and points without any land-cover
    label yield "unavailable"; neither gets a score.
    """
    cover = str(land.get("land_cover", "")).lower().replace("_", " ")
    if is_water_cover(cover):
        return {"score": None, "status": "no_land_detected", "components": {key: None for key in WEIGHTS}, "available_components": 0}
    if cover in {"", "unknown"} or land.get("source") == "none":
        return {"score": None, "status": "unavailable", "components": {key: None for key in WEIGHTS}, "available_components": 0}
    components = {}
    component_fns = {
        "vegetation": (_vegetation_score, land),
        "weather": (_weather_score, weather),
        "soil": (_soil_score, soil),
        "eo_confidence": (_eo_confidence_score, land),
    }

    available_weights = {}
    for key, (fn, data) in component_fns.items():
        val = fn(data)
        if val is not None and not math.isnan(val):
            components[key] = round(val)
            available_weights[key] = WEIGHTS[key]
        else:
            components[key] = None

    if not available_weights:
        return {
            "score": None,
            "status": "unavailable",
            "components": components,
            "available_components": 0,
        }

    # Renormalize weights
    total_w = sum(available_weights.values())
    weighted_sum = 0
    for key, w in available_weights.items():
        weighted_sum += components[key] * (w / total_w)

    score = round(weighted_sum)
    score = max(0, min(100, score))

    status = "stressed"
    for threshold, label in STATUS_THRESHOLDS:
        if score >= threshold:
            status = label
            break

    return {
        "score": score,
        "status": status,
        "components": components,
        "available_components": len(available_weights),
    }
