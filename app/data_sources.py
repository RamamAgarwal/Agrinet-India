import httpx

async def weather(lat, lon):
    """Open-Meteo: past week + 7-day forecast (free, no key)."""
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = (await c.get("https://api.open-meteo.com/v1/forecast", params={
                "latitude": lat, "longitude": lon, "timezone": "auto", "past_days": 7, "forecast_days": 7,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum"})).json()["daily"]
        rain = r["precipitation_sum"]
        return {"days": r["time"], "tmax": r["temperature_2m_max"], "tmin": r["temperature_2m_min"], "rain_mm": rain,
                "past7_rain_mm": round(sum(x or 0 for x in rain[:7]), 1), "next7_rain_mm": round(sum(x or 0 for x in rain[7:]), 1)}
    except Exception as e:
        return {"error": f"weather unavailable: {e}"}

async def soil(lat, lon):
    """ISRIC SoilGrids v2 topsoil (0-5 cm). Free; can be slow/rate-limited, so failures are non-fatal."""
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            j = (await c.get("https://rest.isric.org/soilgrids/v2.0/properties/query", params=[
                ("lon", lon), ("lat", lat), ("depth", "0-5cm"), ("value", "mean"),
                *[("property", p) for p in ("phh2o", "soc", "nitrogen", "clay", "sand")]])).json()
        out = {}
        for l in j["properties"]["layers"]:
            v = l["depths"][0]["values"]["mean"]; f = l["unit_measure"]["d_factor"]
            out[l["name"]] = round(v / f, 2) if v is not None else None
        return {"topsoil_0_5cm": out, "source": "SoilGrids (ISRIC)"}
    except Exception as e:
        return {"error": f"soil unavailable: {e}"}
