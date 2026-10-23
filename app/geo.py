import os, json, math
from pathlib import Path
import numpy as np, pandas as pd, joblib
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
LABELS = json.loads((Path(__file__).parent / "label_map.json").read_text())
RADIUS_M = float(os.getenv("PLANET_RADIUS_M", 300))
B = [f"B{i}" for i in range(1, 9)]
_B32 = "0123456789bcdefghjkmnpqrstuvwxyz"

def geohash(lat, lon, precision=7):
    lat_r, lon_r, bits, ch, even, out = [-90.0, 90.0], [-180.0, 180.0], 0, 0, True, ""
    while len(out) < precision:
        rng, v = (lon_r, lon) if even else (lat_r, lat)
        mid = (rng[0] + rng[1]) / 2
        ch <<= 1
        if v >= mid: ch |= 1; rng[0] = mid
        else: rng[1] = mid
        even = not even; bits += 1
        if bits == 5: out += _B32[ch]; bits = ch = 0
    return out

# ---- Planet (local, high-res) path ----
_lookup = _tree = _clf = _enc = _scaler = None
def _load():
    global _lookup, _tree, _clf, _enc, _scaler
    if _lookup is None:
        p = ROOT / "data" / "lookup.parquet"
        if p.exists():
            _lookup = pd.read_parquet(p)
            _tree = cKDTree(np.c_[np.radians(_lookup.Lat), np.radians(_lookup.Lon) * math.cos(math.radians(22))])
        c = ROOT / "data" / "classifier_emb.joblib"
        if c.exists() and (ROOT / "models" / "planet_mae_ckpt_32.pt").exists():
            from .spear_encoder import PlanetEncoder
            _clf = joblib.load(c); _scaler = joblib.load(ROOT / "models" / "planet_scaler_32.joblib")
            _enc = PlanetEncoder(str(ROOT / "models" / "planet_mae_ckpt_32.pt"))
    return _lookup is not None

def spear_predict(bands):
    """SPEAR MAE embedding + bands -> land-cover head. Returns (id, prob, top3) or None if bands incomplete."""
    if _clf is None or np.isnan(bands).any(): return None
    xs = _scaler.transform(bands.reshape(1, -1).astype(np.float32)).astype(np.float32)
    pr = _clf.predict_proba(np.c_[_enc.embed(xs), xs])[0]; k = int(np.argmax(pr))
    top = sorted(zip(_clf.classes_, pr), key=lambda t: -t[1])[:3]
    return int(_clf.classes_[k]), float(pr[k]), [{"class": LABELS["planet_classes"][str(int(c))], "p": round(float(p), 2)} for c, p in top]

def planet_lookup(lat, lon):
    """Return Planet-derived result if a stored pixel lies within RADIUS_M, else None.
    land_cover = stored Dynamic World label for that cell (reference); model_prediction = SPEAR head (second opinion)."""
    if not _load(): return None
    d, i = _tree.query([math.radians(lat), math.radians(lon) * math.cos(math.radians(22))])
    dist_m = float(d) * 6371000
    if dist_m > RADIUS_M: return None
    r = _lookup.iloc[int(i)]
    bands = r[B].astype(float).values
    ndvi = float((bands[7] - bands[5]) / (bands[7] + bands[5] + 1e-6))
    # NDWI = (Green - NIR) / (Green + NIR); PlanetScope B2=Green(490nm), B7=NIR(865nm) → index 1,6 (0-based)
    ndwi_denom = bands[1] + bands[6]
    ndwi = float((bands[1] - bands[6]) / (ndwi_denom + 1e-6)) if ndwi_denom != 0 else None
    ref = int(r.label); out = {"source": "planet_highres", "resolution": "~3 m PlanetScope", "observed": str(r.date),
        "distance_m": round(dist_m), "land_cover_id": ref, "land_cover": LABELS["planet_classes"][str(ref)],
        "label_origin": "Dynamic World label stored with this Planet cell", "is_cropland": ref in LABELS["cropland_ids"],
        "ndvi_planet": None if math.isnan(ndvi) else round(ndvi, 3),
        "ndwi_planet": None if (ndwi is None or math.isnan(ndwi)) else round(ndwi, 3)}
    sp = spear_predict(np.array(bands))
    if sp:
        out["model_prediction"] = {"land_cover": LABELS["planet_classes"][str(sp[0])], "confidence": round(sp[1], 2),
                                   "top3": sp[2], "agrees_with_label": sp[0] == ref, "model": "SPEAR PlanetScope MAE (32-d) + head"}
        out["confidence"] = round(sp[1], 2)
    return out

# ---- Earth Engine (live, everywhere) path ----
_ee_ok = None
def _ee():
    global _ee_ok
    if _ee_ok is None:
        try:
            import ee
            ee.Initialize(project=os.getenv("EE_PROJECT") or None); _ee_ok = True
        except Exception as e:
            print("Earth Engine unavailable:", e); _ee_ok = False
    return _ee_ok

def ee_analysis(lat, lon, days=180):
    """Dynamic World land cover (mode, last 90d) + Sentinel-2 NDVI + NDWI series at the point."""
    if not _ee(): return None
    import ee, datetime as dt
    pt = ee.Geometry.Point([lon, lat]); end = dt.date.today(); start = end - dt.timedelta(days=days)
    dw = (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(pt)
          .filterDate(str(end - dt.timedelta(days=90)), str(end)).select("label").mode())
    label_value = dw.reduceRegion(ee.Reducer.first(), pt, 10).get("label")
    probability_bands = ["water", "trees", "grass", "flooded_vegetation", "crops", "shrub_and_scrub", "built", "bare", "snow_and_ice"]
    confidence_img = (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(pt)
                      .filterDate(str(end - dt.timedelta(days=90)), str(end))
                      .select(probability_bands).mean().reduce(ee.Reducer.max()))
    confidence_value = confidence_img.reduceRegion(ee.Reducer.first(), pt, 10).get("max")
    ee_values = ee.Dictionary({"label": label_value, "confidence": confidence_value}).getInfo()
    lab = ee_values.get("label")
    confidence = ee_values.get("confidence")
    s2 = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(pt).filterDate(str(start), str(end))
          .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30)))
    def f(img):
        ndvi_v = img.normalizedDifference(["B8", "B4"]).reduceRegion(ee.Reducer.mean(), pt.buffer(30), 10).get("nd")
        # NDWI = (Green - NIR) / (Green + NIR) using Sentinel-2 B3 (Green) and B8 (NIR)
        ndwi_v = img.normalizedDifference(["B3", "B8"]).reduceRegion(ee.Reducer.mean(), pt.buffer(30), 10).get("nd")
        return ee.Feature(None, {"d": img.date().format("YYYY-MM-dd"), "ndvi": ndvi_v, "ndwi": ndwi_v})
    features = s2.map(f).getInfo()["features"]
    ndvi_rows = [x["properties"] for x in features if x["properties"].get("ndvi") is not None]
    ndvi_rows.sort(key=lambda r: r["d"])
    ndvi_series = [{"date": r["d"], "ndvi": round(r["ndvi"], 3)} for r in ndvi_rows]
    ndwi_rows = [x["properties"] for x in features if x["properties"].get("ndwi") is not None]
    ndwi_rows.sort(key=lambda r: r["d"])
    ndwi_series = [{"date": r["d"], "ndwi": round(r["ndwi"], 3)} for r in ndwi_rows]
    if lab is None: return {"series": ndvi_series, "ndwi_series": ndwi_series}
    return {"series": ndvi_series, "ndwi_series": ndwi_series,
            "source": "earth_engine_live", "resolution": "10 m Dynamic World / Sentinel-2",
            "observed": str(end), "land_cover_id": int(lab), "land_cover": LABELS["dynamic_world"][str(int(lab))],
            "confidence": round(float(confidence), 3) if confidence is not None else None,
            "is_cropland": int(lab) in LABELS["dynamic_world_cropland_ids"]}

def analyze_land(lat, lon):
    """Routing: Planet data if it exists nearby, otherwise Earth Engine. NDVI/NDWI trends from EE when available."""
    planet = planet_lookup(lat, lon)
    try: ee_res = ee_analysis(lat, lon)
    except Exception as e:
        print("EE query failed:", e); ee_res = None
    ndvi_series = (ee_res or {}).get("series", [])
    ndwi_series = (ee_res or {}).get("ndwi_series", [])
    if planet:
        res = dict(planet)
        if ee_res and ee_res.get("land_cover"): res["cross_check"] = {"dynamic_world": ee_res["land_cover"], "note": "independent live check"}
    elif ee_res and ee_res.get("land_cover"):
        res = {k: v for k, v in ee_res.items() if k not in ("series", "ndwi_series")}
    else:
        res = {"source": "none", "land_cover": "unknown", "note": "No Planet data nearby and Earth Engine not configured."}
    res["geohash"] = geohash(lat, lon)
    # NDVI
    res["ndvi_series"] = ndvi_series
    if ndvi_series: res["ndvi_latest"] = ndvi_series[-1]["ndvi"]
    # NDWI
    res["ndwi_series"] = ndwi_series
    if ndwi_series:
        res["ndwi_latest"] = ndwi_series[-1]["ndwi"]
    elif planet and planet.get("ndwi_planet") is not None:
        res["ndwi_latest"] = planet["ndwi_planet"]
    return res
