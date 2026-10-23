import json

import pytest

from tests.direct.conftest import (
    CONTRACT,
    CREATE_TIME,
    TARGET_DATE,
    create_pact,
    make_ready,
    mock_weather,
    to_hex,
    weather_payload,
)


def deploy(direct_vm, direct_deploy, sender):
    direct_vm.warp(CREATE_TIME)
    direct_vm.sender = sender
    return direct_deploy(CONTRACT)


def test_creation_uses_actual_sender_and_normalized_inputs(
    direct_vm, direct_deploy, direct_alice
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)

    pact_id = create_pact(contract, threshold="10.500")

    assert pact_id == "WP-0000000001"
    pact = contract.get_pact(pact_id)
    assert pact["creator"] == to_hex(direct_alice)
    assert pact["status"] == "OPEN"
    assert pact["threshold"] == "10.5"
    assert pact["location"]["latitude"] == "6.5244"
    assert pact["location"]["longitude"] == "3.3792"
    assert pact["createdAt"] == "2026-10-01T09:30:00Z"
    assert pact["readyAt"] == "2026-10-17T00:00:00Z"
    assert pact["evidence"]["observedValue"] == ""
    assert pact["evidence"]["sourceUrl"] == ""


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"location_name": "  "}, "location_name is required"),
        ({"location_name": "Lagos\nadmin"}, "control characters"),
        ({"country_code": "NGA"}, "country_code"),
        ({"latitude": "90.000001"}, "latitude is out of range"),
        ({"longitude": "-180.000001"}, "longitude is out of range"),
        ({"latitude": "1e2"}, "Invalid latitude"),
        ({"timezone_name": "Mars/Olympus"}, "valid IANA identifier"),
        ({"target_date": "2026-02-30"}, "ISO calendar date"),
        ({"target_date": "1939-12-31"}, "supported archive range"),
        ({"metric": "weather_code"}, "Unsupported weather metric"),
        ({"operator": "=="}, "Unsupported threshold operator"),
        ({"threshold": "-0.001"}, "threshold is outside"),
        ({"threshold": "1.2345"}, "precision or format"),
        ({"prediction": "MAYBE"}, "prediction must be YES or NO"),
    ],
)
def test_creation_rejects_invalid_inputs(
    direct_vm, direct_deploy, direct_alice, override, message
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    with direct_vm.expect_revert(message):
        create_pact(contract, **override)
    assert contract.get_metadata()["pactCount"] == 0


def test_premature_resolution_reverts_without_evidence(
    direct_vm, direct_deploy, direct_alice
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract)
    direct_vm.warp("2026-10-16T23:59:59+00:00")

    with direct_vm.expect_revert("Resolution delay has not elapsed"):
        contract.resolve_pact(pact_id)

    pact = contract.get_pact(pact_id)
    assert pact["status"] == "OPEN"
    assert pact["evidence"]["observedValue"] == ""
    assert contract.get_metadata()["activityCount"] == 1


def test_resolution_matches_threshold_and_tracks_resolver_and_reputation(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract, threshold="10.000")
    mock_weather(direct_vm, weather_payload(value=12.3456))
    make_ready(direct_vm)
    direct_vm.sender = direct_bob

    contract.resolve_pact(pact_id)

    pact = contract.get_pact(pact_id)
    assert pact["status"] == "RESOLVED_YES"
    assert pact["creator"] == to_hex(direct_alice)
    assert pact["evidence"]["observedValue"] == "12.346"
    assert pact["evidence"]["unit"] == "mm"
    assert pact["evidence"]["sourceName"] == "Open-Meteo Historical Weather API"
    assert pact["evidence"]["sourceUrl"].startswith(
        "https://archive-api.open-meteo.com/v1/archive?"
    )
    assert pact["evidence"]["resolvedAt"] == "2026-10-17T00:00:00Z"
    assert pact["evidence"]["resolver"] == to_hex(direct_bob)
    assert pact["evidence"]["providerUtcOffsetSeconds"] == "3600"
    assert contract.get_reputation(to_hex(direct_alice)) == {
        "correctPredictions": 1,
        "currentStreak": 1,
        "finalizedPacts": 1,
    }
    assert contract.get_reputation(to_hex(direct_bob))["finalizedPacts"] == 0

    with direct_vm.expect_revert("Pact already resolved"):
        contract.resolve_pact(pact_id)
    assert contract.get_metadata()["activityCount"] == 2


@pytest.mark.parametrize(
    ("operator", "threshold", "observed", "expected"),
    [
        ("gt", "10", 10, "RESOLVED_NO"),
        ("gte", "10", 10, "RESOLVED_YES"),
        ("lt", "10", 10, "RESOLVED_NO"),
        ("lte", "10", 10, "RESOLVED_YES"),
        ("lt", "10", 9.9994, "RESOLVED_YES"),
    ],
)
def test_all_threshold_comparisons_are_deterministic(
    direct_vm,
    direct_deploy,
    direct_alice,
    operator,
    threshold,
    observed,
    expected,
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract, operator=operator, threshold=threshold)
    mock_weather(direct_vm, weather_payload(value=observed))
    make_ready(direct_vm)

    contract.resolve_pact(pact_id)

    assert contract.get_pact(pact_id)["status"] == expected


def test_non_matching_prediction_does_not_earn_points(
    direct_vm, direct_deploy, direct_alice
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract, prediction="NO")
    mock_weather(direct_vm, weather_payload(value=11))
    make_ready(direct_vm)
    contract.resolve_pact(pact_id)

    assert contract.get_pact(pact_id)["status"] == "RESOLVED_YES"
    assert contract.get_reputation(to_hex(direct_alice)) == {
        "correctPredictions": 0,
        "currentStreak": 0,
        "finalizedPacts": 1,
    }


@pytest.mark.parametrize(
    ("payload", "status", "message"),
    [
        (weather_payload(), 500, "temporarily unavailable"),
        (weather_payload(), 429, "temporarily unavailable"),
        (weather_payload(), 400, "rejected the fixed historical request"),
        ("not-json", 200, "not valid JSON"),
        ({"daily": {}}, 200, "malformed or unexpected"),
        (weather_payload(value=None), 200, "no numeric observation"),
        (weather_payload(value="12.5"), 200, "no numeric observation"),
        (weather_payload(target_date="2026-10-11"), 200, "future, incomplete, or ambiguous"),
    ],
)
def test_source_failures_never_finalize(
    direct_vm, direct_deploy, direct_alice, payload, status, message
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract)
    mock_weather(direct_vm, payload, status=status)
    make_ready(direct_vm)

    with direct_vm.expect_revert(message):
        contract.resolve_pact(pact_id)

    pact = contract.get_pact(pact_id)
    assert pact["status"] == "READY_TO_RESOLVE"
    assert pact["evidence"]["observedValue"] == ""
    assert contract.get_reputation(to_hex(direct_alice))["finalizedPacts"] == 0
    assert contract.get_metadata()["activityCount"] == 1


def test_provider_coordinate_mismatch_never_finalizes(
    direct_vm, direct_deploy, direct_alice
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract)
    payload = weather_payload()
    payload["latitude"] = 50.0
    payload["longitude"] = 50.0
    mock_weather(direct_vm, payload)
    make_ready(direct_vm)

    with direct_vm.expect_revert("provider coordinates do not match"):
        contract.resolve_pact(pact_id)

    pact = contract.get_pact(pact_id)
    assert pact["status"] == "READY_TO_RESOLVE"
    assert pact["evidence"]["observedValue"] == ""
    assert contract.get_metadata()["activityCount"] == 1


def test_missing_source_is_retryable(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract)
    make_ready(direct_vm)

    with direct_vm.expect_revert("retry later"):
        contract.resolve_pact(pact_id)

    direct_vm.clear_mocks()
    mock_weather(direct_vm, weather_payload(value=13))
    contract.resolve_pact(pact_id)
    assert contract.get_pact(pact_id)["status"] == "RESOLVED_YES"


def test_transient_failure_can_be_retried(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract)
    mock_weather(direct_vm, weather_payload(), status=503)
    make_ready(direct_vm)
    with direct_vm.expect_revert("temporarily unavailable"):
        contract.resolve_pact(pact_id)

    direct_vm.clear_mocks()
    mock_weather(direct_vm, weather_payload(value=8))
    contract.resolve_pact(pact_id)
    assert contract.get_pact(pact_id)["status"] == "RESOLVED_NO"


def test_validator_independently_fetches_normalized_evidence(
    direct_vm, direct_deploy, direct_alice
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract)
    mock_weather(direct_vm, weather_payload(value=14))
    make_ready(direct_vm)
    contract.resolve_pact(pact_id)

    assert direct_vm.run_validator(index=0) is True


def test_validator_rejects_different_observation(
    direct_vm, direct_deploy, direct_alice
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    pact_id = create_pact(contract)
    mock_weather(direct_vm, weather_payload(value=14))
    make_ready(direct_vm)
    contract.resolve_pact(pact_id)

    direct_vm.clear_mocks()
    mock_weather(direct_vm, weather_payload(value=99))
    assert direct_vm.run_validator(index=0) is False


def test_bounded_views_and_multiple_pacts(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    first = create_pact(contract, location_name="Lagos")
    second = create_pact(contract, location_name="Abuja", latitude="9.0765", longitude="7.3986")
    direct_vm.sender = direct_bob
    third = create_pact(contract, location_name="Nairobi", latitude="-1.2921", longitude="36.8219", timezone_name="Africa/Nairobi", country="Kenya", country_code="KE")

    page = contract.get_pacts(0, 2)
    assert page["total"] == 3
    assert [item["id"] for item in page["items"]] == [third, second]
    assert page["hasMore"] is True
    last_page = contract.get_pacts(2, 2)
    assert [item["id"] for item in last_page["items"]] == [first]
    assert last_page["hasMore"] is False
    assert contract.get_pact("WP-does-not-exist") == {}
    assert contract.get_activity(0, 2)["total"] == 3
    assert contract.get_activity(2, 2)["items"][0]["pactId"] == first
    assert contract.get_metadata()["pactCount"] == 3

    with direct_vm.expect_revert("limit from 1 to 50"):
        contract.get_pacts(0, 51)
    with direct_vm.expect_revert("offset >= 0"):
        contract.get_activity(-1, 10)


def test_all_supported_metrics_resolve(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_alice)
    cases = [
        ("rain_sum", "mm", 1.25),
        ("precipitation_sum", "mm", 2.25),
        ("temperature_2m_max", "°C", 30.25),
        ("temperature_2m_min", "°C", -4.25),
        ("wind_speed_10m_max", "km/h", 22.25),
    ]
    for index, (metric, unit, value) in enumerate(cases, start=1):
        direct_vm.clear_mocks()
        threshold = "0" if metric != "temperature_2m_min" else "-5"
        pact_id = create_pact(contract, metric=metric, threshold=threshold)
        mock_weather(direct_vm, weather_payload(metric=metric, value=value))
        make_ready(direct_vm)
        contract.resolve_pact(pact_id)
        evidence = contract.get_pact(pact_id)["evidence"]
        assert evidence["unit"] == unit
        assert evidence["observedValue"] == str(value)
        assert contract.get_pact(pact_id)["id"] == "WP-" + str(index).rjust(10, "0")
