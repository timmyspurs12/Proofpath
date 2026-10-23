"""Shared helpers for WeatherPact Direct Mode tests."""

import json


CONTRACT = "contracts/weatherpact.py"
ARCHIVE_URL = r".*archive-api\.open-meteo\.com/v1/archive.*"
TARGET_DATE = "2026-10-10"
READY_TIME = "2026-10-17T00:00:00+00:00"
CREATE_TIME = "2026-10-01T09:30:00+00:00"


def to_hex(address):
    if hasattr(address, "as_hex"):
        return address.as_hex
    from genlayer.types import Address

    return Address(address).as_hex


def create_pact(contract, **overrides):
    values = {
        "location_name": "Lagos",
        "admin1": "Lagos",
        "country": "Nigeria",
        "country_code": "NG",
        "latitude": "6.524400",
        "longitude": "3.379200",
        "timezone_name": "Africa/Lagos",
        "target_date": TARGET_DATE,
        "metric": "rain_sum",
        "operator": "gt",
        "threshold": "10",
        "prediction": "YES",
    }
    values.update(overrides)
    return contract.create_pact(**values)


def weather_payload(metric="rain_sum", value=12.5, target_date=TARGET_DATE):
    units = {
        "rain_sum": "mm",
        "precipitation_sum": "mm",
        "temperature_2m_max": "°C",
        "temperature_2m_min": "°C",
        "wind_speed_10m_max": "km/h",
    }
    return {
        "latitude": 6.5244,
        "longitude": 3.3792,
        "utc_offset_seconds": 3600,
        "timezone": "Africa/Lagos",
        "daily_units": {metric: units[metric]},
        "daily": {"time": [target_date], metric: [value]},
        # Deliberately variable and omitted from normalized contract evidence.
        "generationtime_ms": 1.2345,
    }


def mock_weather(vm, payload, status=200):
    body = payload if isinstance(payload, str) else json.dumps(payload)
    vm.mock_web(ARCHIVE_URL, {"status": status, "body": body})


def make_ready(vm):
    vm.warp(READY_TIME)
