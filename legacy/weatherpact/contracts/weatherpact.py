# { "Depends": "py-genlayer:0pmqsckm6f5rk0944prs1a290dtftkj2yevk92ex9qye6bdy9ztm" }

import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import genlayer as gl
from genlayer.storage import allow as allow_storage


SOURCE_NAME = "Open-Meteo Historical Weather API"
SOURCE_HOST = "https://archive-api.open-meteo.com"
DATASET_NOTE = "Historical weather data may be model-derived or reanalysis-based and is not necessarily a direct local weather-station measurement."
RESOLUTION_DELAY_DAYS = 7
MAX_PAGE_SIZE = 50
# Open-Meteo may snap a request to its model grid; reject anything farther
# than 0.25 degrees on either axis rather than requiring exact coordinates.
PROVIDER_GRID_TOLERANCE = 250_000  # scaled by 1e6
ERROR_TRANSIENT = "[TRANSIENT] "
ERROR_EXTERNAL = "[EXTERNAL] "

# Values are stored and compared at 1/1000 of their displayed unit. Bounds are
# deliberately generous physical sanity limits, not forecasts or observations.
METRICS = {
    "rain_sum": {"unit": "mm", "min": 0, "max": 2_000_000},
    "precipitation_sum": {"unit": "mm", "min": 0, "max": 2_000_000},
    "temperature_2m_max": {"unit": "°C", "min": -100_000, "max": 70_000},
    "temperature_2m_min": {"unit": "°C", "min": -100_000, "max": 70_000},
    "wind_speed_10m_max": {"unit": "km/h", "min": 0, "max": 500_000},
}
OPERATORS = {"gt", "gte", "lt", "lte"}

# IANA TZ Database 2026b snapshot: 599 canonical names and backward-compatible links.
# GenVM's pinned CPython runner deliberately has an empty TZPATH and no tzdata.
IANA_TIMEZONES = frozenset(
    """Africa/Abidjan
Africa/Accra
Africa/Addis_Ababa
Africa/Algiers
Africa/Asmara
Africa/Asmera
Africa/Bamako
Africa/Bangui
Africa/Banjul
Africa/Bissau
Africa/Blantyre
Africa/Brazzaville
Africa/Bujumbura
Africa/Cairo
Africa/Casablanca
Africa/Ceuta
Africa/Conakry
Africa/Dakar
Africa/Dar_es_Salaam
Africa/Djibouti
Africa/Douala
Africa/El_Aaiun
Africa/Freetown
Africa/Gaborone
Africa/Harare
Africa/Johannesburg
Africa/Juba
Africa/Kampala
Africa/Khartoum
Africa/Kigali
Africa/Kinshasa
Africa/Lagos
Africa/Libreville
Africa/Lome
Africa/Luanda
Africa/Lubumbashi
Africa/Lusaka
Africa/Malabo
Africa/Maputo
Africa/Maseru
Africa/Mbabane
Africa/Mogadishu
Africa/Monrovia
Africa/Nairobi
Africa/Ndjamena
Africa/Niamey
Africa/Nouakchott
Africa/Ouagadougou
Africa/Porto-Novo
Africa/Sao_Tome
Africa/Timbuktu
Africa/Tripoli
Africa/Tunis
Africa/Windhoek
America/Adak
America/Anchorage
America/Anguilla
America/Antigua
America/Araguaina
America/Argentina/Buenos_Aires
America/Argentina/Catamarca
America/Argentina/ComodRivadavia
America/Argentina/Cordoba
America/Argentina/Jujuy
America/Argentina/La_Rioja
America/Argentina/Mendoza
America/Argentina/Rio_Gallegos
America/Argentina/Salta
America/Argentina/San_Juan
America/Argentina/San_Luis
America/Argentina/Tucuman
America/Argentina/Ushuaia
America/Aruba
America/Asuncion
America/Atikokan
America/Atka
America/Bahia
America/Bahia_Banderas
America/Barbados
America/Belem
America/Belize
America/Blanc-Sablon
America/Boa_Vista
America/Bogota
America/Boise
America/Buenos_Aires
America/Cambridge_Bay
America/Campo_Grande
America/Cancun
America/Caracas
America/Catamarca
America/Cayenne
America/Cayman
America/Chicago
America/Chihuahua
America/Ciudad_Juarez
America/Coral_Harbour
America/Cordoba
America/Costa_Rica
America/Coyhaique
America/Creston
America/Cuiaba
America/Curacao
America/Danmarkshavn
America/Dawson
America/Dawson_Creek
America/Denver
America/Detroit
America/Dominica
America/Edmonton
America/Eirunepe
America/El_Salvador
America/Ensenada
America/Fort_Nelson
America/Fort_Wayne
America/Fortaleza
America/Glace_Bay
America/Godthab
America/Goose_Bay
America/Grand_Turk
America/Grenada
America/Guadeloupe
America/Guatemala
America/Guayaquil
America/Guyana
America/Halifax
America/Havana
America/Hermosillo
America/Indiana/Indianapolis
America/Indiana/Knox
America/Indiana/Marengo
America/Indiana/Petersburg
America/Indiana/Tell_City
America/Indiana/Vevay
America/Indiana/Vincennes
America/Indiana/Winamac
America/Indianapolis
America/Inuvik
America/Iqaluit
America/Jamaica
America/Jujuy
America/Juneau
America/Kentucky/Louisville
America/Kentucky/Monticello
America/Knox_IN
America/Kralendijk
America/La_Paz
America/Lima
America/Los_Angeles
America/Louisville
America/Lower_Princes
America/Maceio
America/Managua
America/Manaus
America/Marigot
America/Martinique
America/Matamoros
America/Mazatlan
America/Mendoza
America/Menominee
America/Merida
America/Metlakatla
America/Mexico_City
America/Miquelon
America/Moncton
America/Monterrey
America/Montevideo
America/Montreal
America/Montserrat
America/Nassau
America/New_York
America/Nipigon
America/Nome
America/Noronha
America/North_Dakota/Beulah
America/North_Dakota/Center
America/North_Dakota/New_Salem
America/Nuuk
America/Ojinaga
America/Panama
America/Pangnirtung
America/Paramaribo
America/Phoenix
America/Port-au-Prince
America/Port_of_Spain
America/Porto_Acre
America/Porto_Velho
America/Puerto_Rico
America/Punta_Arenas
America/Rainy_River
America/Rankin_Inlet
America/Recife
America/Regina
America/Resolute
America/Rio_Branco
America/Rosario
America/Santa_Isabel
America/Santarem
America/Santiago
America/Santo_Domingo
America/Sao_Paulo
America/Scoresbysund
America/Shiprock
America/Sitka
America/St_Barthelemy
America/St_Johns
America/St_Kitts
America/St_Lucia
America/St_Thomas
America/St_Vincent
America/Swift_Current
America/Tegucigalpa
America/Thule
America/Thunder_Bay
America/Tijuana
America/Toronto
America/Tortola
America/Vancouver
America/Virgin
America/Whitehorse
America/Winnipeg
America/Yakutat
America/Yellowknife
Antarctica/Casey
Antarctica/Davis
Antarctica/DumontDUrville
Antarctica/Macquarie
Antarctica/Mawson
Antarctica/McMurdo
Antarctica/Palmer
Antarctica/Rothera
Antarctica/South_Pole
Antarctica/Syowa
Antarctica/Troll
Antarctica/Vostok
Arctic/Longyearbyen
Asia/Aden
Asia/Almaty
Asia/Amman
Asia/Anadyr
Asia/Aqtau
Asia/Aqtobe
Asia/Ashgabat
Asia/Ashkhabad
Asia/Atyrau
Asia/Baghdad
Asia/Bahrain
Asia/Baku
Asia/Bangkok
Asia/Barnaul
Asia/Beirut
Asia/Bishkek
Asia/Brunei
Asia/Calcutta
Asia/Chita
Asia/Choibalsan
Asia/Chongqing
Asia/Chungking
Asia/Colombo
Asia/Dacca
Asia/Damascus
Asia/Dhaka
Asia/Dili
Asia/Dubai
Asia/Dushanbe
Asia/Famagusta
Asia/Gaza
Asia/Harbin
Asia/Hebron
Asia/Ho_Chi_Minh
Asia/Hong_Kong
Asia/Hovd
Asia/Irkutsk
Asia/Istanbul
Asia/Jakarta
Asia/Jayapura
Asia/Jerusalem
Asia/Kabul
Asia/Kamchatka
Asia/Karachi
Asia/Kashgar
Asia/Kathmandu
Asia/Katmandu
Asia/Khandyga
Asia/Kolkata
Asia/Krasnoyarsk
Asia/Kuala_Lumpur
Asia/Kuching
Asia/Kuwait
Asia/Macao
Asia/Macau
Asia/Magadan
Asia/Makassar
Asia/Manila
Asia/Muscat
Asia/Nicosia
Asia/Novokuznetsk
Asia/Novosibirsk
Asia/Omsk
Asia/Oral
Asia/Phnom_Penh
Asia/Pontianak
Asia/Pyongyang
Asia/Qatar
Asia/Qostanay
Asia/Qyzylorda
Asia/Rangoon
Asia/Riyadh
Asia/Saigon
Asia/Sakhalin
Asia/Samarkand
Asia/Seoul
Asia/Shanghai
Asia/Singapore
Asia/Srednekolymsk
Asia/Taipei
Asia/Tashkent
Asia/Tbilisi
Asia/Tehran
Asia/Tel_Aviv
Asia/Thimbu
Asia/Thimphu
Asia/Tokyo
Asia/Tomsk
Asia/Ujung_Pandang
Asia/Ulaanbaatar
Asia/Ulan_Bator
Asia/Urumqi
Asia/Ust-Nera
Asia/Vientiane
Asia/Vladivostok
Asia/Yakutsk
Asia/Yangon
Asia/Yekaterinburg
Asia/Yerevan
Atlantic/Azores
Atlantic/Bermuda
Atlantic/Canary
Atlantic/Cape_Verde
Atlantic/Faeroe
Atlantic/Faroe
Atlantic/Jan_Mayen
Atlantic/Madeira
Atlantic/Reykjavik
Atlantic/South_Georgia
Atlantic/St_Helena
Atlantic/Stanley
Australia/ACT
Australia/Adelaide
Australia/Brisbane
Australia/Broken_Hill
Australia/Canberra
Australia/Currie
Australia/Darwin
Australia/Eucla
Australia/Hobart
Australia/LHI
Australia/Lindeman
Australia/Lord_Howe
Australia/Melbourne
Australia/NSW
Australia/North
Australia/Perth
Australia/Queensland
Australia/South
Australia/Sydney
Australia/Tasmania
Australia/Victoria
Australia/West
Australia/Yancowinna
Brazil/Acre
Brazil/DeNoronha
Brazil/East
Brazil/West
CET
CST6CDT
Canada/Atlantic
Canada/Central
Canada/Eastern
Canada/Mountain
Canada/Newfoundland
Canada/Pacific
Canada/Saskatchewan
Canada/Yukon
Chile/Continental
Chile/EasterIsland
Cuba
EET
EST
EST5EDT
Egypt
Eire
Etc/GMT
Etc/GMT+0
Etc/GMT+1
Etc/GMT+10
Etc/GMT+11
Etc/GMT+12
Etc/GMT+2
Etc/GMT+3
Etc/GMT+4
Etc/GMT+5
Etc/GMT+6
Etc/GMT+7
Etc/GMT+8
Etc/GMT+9
Etc/GMT-0
Etc/GMT-1
Etc/GMT-10
Etc/GMT-11
Etc/GMT-12
Etc/GMT-13
Etc/GMT-14
Etc/GMT-2
Etc/GMT-3
Etc/GMT-4
Etc/GMT-5
Etc/GMT-6
Etc/GMT-7
Etc/GMT-8
Etc/GMT-9
Etc/GMT0
Etc/Greenwich
Etc/UCT
Etc/UTC
Etc/Universal
Etc/Zulu
Europe/Amsterdam
Europe/Andorra
Europe/Astrakhan
Europe/Athens
Europe/Belfast
Europe/Belgrade
Europe/Berlin
Europe/Bratislava
Europe/Brussels
Europe/Bucharest
Europe/Budapest
Europe/Busingen
Europe/Chisinau
Europe/Copenhagen
Europe/Dublin
Europe/Gibraltar
Europe/Guernsey
Europe/Helsinki
Europe/Isle_of_Man
Europe/Istanbul
Europe/Jersey
Europe/Kaliningrad
Europe/Kiev
Europe/Kirov
Europe/Kyiv
Europe/Lisbon
Europe/Ljubljana
Europe/London
Europe/Luxembourg
Europe/Madrid
Europe/Malta
Europe/Mariehamn
Europe/Minsk
Europe/Monaco
Europe/Moscow
Europe/Nicosia
Europe/Oslo
Europe/Paris
Europe/Podgorica
Europe/Prague
Europe/Riga
Europe/Rome
Europe/Samara
Europe/San_Marino
Europe/Sarajevo
Europe/Saratov
Europe/Simferopol
Europe/Skopje
Europe/Sofia
Europe/Stockholm
Europe/Tallinn
Europe/Tirane
Europe/Tiraspol
Europe/Ulyanovsk
Europe/Uzhgorod
Europe/Vaduz
Europe/Vatican
Europe/Vienna
Europe/Vilnius
Europe/Volgograd
Europe/Warsaw
Europe/Zagreb
Europe/Zaporozhye
Europe/Zurich
Factory
GB
GB-Eire
GMT
GMT+0
GMT-0
GMT0
Greenwich
HST
Hongkong
Iceland
Indian/Antananarivo
Indian/Chagos
Indian/Christmas
Indian/Cocos
Indian/Comoro
Indian/Kerguelen
Indian/Mahe
Indian/Maldives
Indian/Mauritius
Indian/Mayotte
Indian/Reunion
Iran
Israel
Jamaica
Japan
Kwajalein
Libya
MET
MST
MST7MDT
Mexico/BajaNorte
Mexico/BajaSur
Mexico/General
NZ
NZ-CHAT
Navajo
PRC
PST8PDT
Pacific/Apia
Pacific/Auckland
Pacific/Bougainville
Pacific/Chatham
Pacific/Chuuk
Pacific/Easter
Pacific/Efate
Pacific/Enderbury
Pacific/Fakaofo
Pacific/Fiji
Pacific/Funafuti
Pacific/Galapagos
Pacific/Gambier
Pacific/Guadalcanal
Pacific/Guam
Pacific/Honolulu
Pacific/Johnston
Pacific/Kanton
Pacific/Kiritimati
Pacific/Kosrae
Pacific/Kwajalein
Pacific/Majuro
Pacific/Marquesas
Pacific/Midway
Pacific/Nauru
Pacific/Niue
Pacific/Norfolk
Pacific/Noumea
Pacific/Pago_Pago
Pacific/Palau
Pacific/Pitcairn
Pacific/Pohnpei
Pacific/Ponape
Pacific/Port_Moresby
Pacific/Rarotonga
Pacific/Saipan
Pacific/Samoa
Pacific/Tahiti
Pacific/Tarawa
Pacific/Tongatapu
Pacific/Truk
Pacific/Wake
Pacific/Wallis
Pacific/Yap
Poland
Portugal
ROC
ROK
Singapore
Turkey
UCT
US/Alaska
US/Aleutian
US/Arizona
US/Central
US/East-Indiana
US/Eastern
US/Hawaii
US/Indiana-Starke
US/Michigan
US/Mountain
US/Pacific
US/Samoa
UTC
Universal
W-SU
WET
Zulu
localtime""".splitlines()
)


def _error(message: str):
    raise gl.vm.UserError(message)


def _decimal(value: str, field: str, places: int) -> tuple[int, str]:
    if not isinstance(value, str) or not value or len(value) > 32:
        _error(field + " must be a decimal string")
    negative = value.startswith("-")
    unsigned = value[1:] if negative else value
    if not unsigned or unsigned.startswith("+"):
        _error("Invalid " + field)
    parts = unsigned.split(".")
    if len(parts) > 2:
        _error("Invalid " + field)
    whole = parts[0]
    fraction = parts[1] if len(parts) == 2 else ""
    if not whole or not whole.isdigit() or (fraction and not fraction.isdigit()):
        _error("Invalid " + field)
    if len(fraction) > places or (len(whole) > 1 and whole.startswith("0")):
        _error("Invalid " + field + " precision or format")
    scale = 10**places
    scaled = int(whole) * scale + int(fraction.ljust(places, "0") or "0")
    if negative:
        scaled = -scaled
    return scaled, _decimal_string(scaled, places)

def _decimal_string(value: int, places: int) -> str:
    sign = "-" if value < 0 else ""
    absolute = abs(value)
    scale = 10**places
    whole = str(absolute // scale)
    fraction = str(absolute % scale).rjust(places, "0").rstrip("0")
    if absolute == 0:
        sign = ""
    return sign + whole + ("." + fraction if fraction else "")


def _numeric_text(value, field: str, places: int) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _error(ERROR_EXTERNAL + "weather response has no numeric " + field)
    # Fixed formatting also rejects NaN/infinity through _decimal and makes
    # the stored representation independent of JSON number formatting.
    text = format(value, "." + str(places) + "f")
    _, normalized = _decimal(text, field, places)
    return normalized

def _observation(body, url: str, metric: str, target_date: str, zone: str) -> str:
    try:
        data = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
    except Exception:
        _error(ERROR_EXTERNAL + "weather response is not valid JSON")
    try:
        if not isinstance(data, dict) or data.get("error") is True:
            _error(ERROR_EXTERNAL + "unexpected weather response")
        daily = data["daily"]
        units = data["daily_units"]
        if not isinstance(daily, dict) or not isinstance(units, dict):
            _error(ERROR_EXTERNAL + "weather response is missing daily data")
        if data.get("timezone") != zone or units.get(metric) != METRICS[metric]["unit"]:
            _error(ERROR_EXTERNAL + "weather response zone or unit mismatch")
        if daily.get("time") != [target_date] or len(daily.get(metric, [])) != 1:
            _error(ERROR_EXTERNAL + "weather response is future, incomplete, or ambiguous")
        observed = _numeric_text(daily[metric][0], "observation", 3)
        observed_scaled, _ = _decimal(observed, "observation", 3)
        definition = METRICS[metric]
        if observed_scaled < definition["min"] or observed_scaled > definition["max"]:
            _error(ERROR_EXTERNAL + "weather observation is outside the valid range")
        provider_latitude = _numeric_text(data["latitude"], "provider latitude", 6)
        provider_longitude = _numeric_text(data["longitude"], "provider longitude", 6)
        provider_latitude_scaled, _ = _decimal(provider_latitude, "provider latitude", 6)
        provider_longitude_scaled, _ = _decimal(provider_longitude, "provider longitude", 6)
        if not -90_000_000 <= provider_latitude_scaled <= 90_000_000:
            _error(ERROR_EXTERNAL + "provider latitude is out of range")
        if not -180_000_000 <= provider_longitude_scaled <= 180_000_000:
            _error(ERROR_EXTERNAL + "provider longitude is out of range")
        offset = data["utc_offset_seconds"]
        if isinstance(offset, bool) or not isinstance(offset, int) or offset % 60 != 0:
            _error(ERROR_EXTERNAL + "weather response has an invalid UTC offset")
        if offset < -43_200 or offset > 50_400:
            _error(ERROR_EXTERNAL + "weather response has an invalid UTC offset")
        return json.dumps(
            {
                "observed": observed,
                "provider_latitude": provider_latitude,
                "provider_longitude": provider_longitude,
                "utc_offset_seconds": str(offset),
                "source_url": url,
            },
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
    except gl.vm.UserError:
        raise
    except Exception:
        _error(ERROR_EXTERNAL + "malformed or unexpected weather response")



@allow_storage
@dataclass
class Pact:
    id: str
    creator: gl.Address
    location_name: str
    admin1: str
    country: str
    country_code: str
    latitude: str
    longitude: str
    timezone: str
    target_date: str
    metric: str
    operator: str
    unit: str
    threshold: str
    prediction: str
    status: str
    created_at: str
    ready_at: str
    source_url: str
    observed_value: str
    condition_met: bool
    resolved_at: str
    resolver: str
    provider_latitude: str
    provider_longitude: str
    provider_utc_offset_seconds: str


@allow_storage
@dataclass
class Activity:
    id: str
    pact_id: str
    kind: str
    timestamp: str
    actor: gl.Address


@allow_storage
@dataclass
class Reputation:
    correct: gl.u256
    streak: gl.u256
    finalized: gl.u256


class WeatherPact(gl.contract.Contract):
    pacts: gl.storage.TreeMap[str, Pact]
    pact_ids: gl.storage.DynArray[str]
    activities: gl.storage.DynArray[Activity]
    reputation: gl.storage.TreeMap[gl.Address, Reputation]
    next_pact_number: gl.u256
    next_activity_number: gl.u256

    def __init__(self):
        self.next_pact_number = 1
        self.next_activity_number = 1

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _iso(self, value: datetime) -> str:
        return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    def _text(self, value: str, field: str, maximum: int, required: bool) -> str:
        if not isinstance(value, str):
            _error(field + " must be text")
        value = value.strip()
        if required and not value:
            _error(field + " is required")
        if len(value) > maximum:
            _error(field + " is too long")
        for character in value:
            if ord(character) < 32 or ord(character) == 127:
                _error(field + " contains control characters")
        return value

    def _coordinate(self, value: str, field: str, limit: int) -> str:
        scaled, normalized = _decimal(value, field, 6)
        if scaled < -limit * 1_000_000 or scaled > limit * 1_000_000:
            _error(field + " is out of range")
        return normalized

    def _validate_timezone(self, value: str) -> str:
        value = self._text(value, "timezone", 64, True)
        if value not in IANA_TIMEZONES:
            _error("timezone must be a valid IANA identifier")
        return value

    def _validate_date(self, value: str) -> date:
        if not isinstance(value, str) or len(value) != 10:
            _error("target_date must be an ISO calendar date")
        try:
            parsed = date.fromisoformat(value)
        except Exception:
            _error("target_date must be an ISO calendar date")
        if parsed.isoformat() != value or parsed < date(1940, 1, 1) or parsed > date(2100, 12, 24):
            _error("target_date is outside the supported archive range")
        return parsed

    def _source_url(
        self,
        latitude: str,
        longitude: str,
        target_date: str,
        metric: str,
        zone: str,
    ) -> str:
        zone_parameter = zone.replace("+", "%2B").replace("/", "%2F")
        return (
            SOURCE_HOST
            + "/v1/archive?latitude="
            + latitude
            + "&longitude="
            + longitude
            + "&start_date="
            + target_date
            + "&end_date="
            + target_date
            + "&daily="
            + metric
            + "&timezone="
            + zone_parameter
            + "&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timeformat=iso8601"
        )

    def _activity(self, pact_id: str, kind: str, actor: gl.Address):
        activity_id = "EV-" + str(self.next_activity_number).rjust(10, "0")
        self.next_activity_number += 1
        self.activities.append(
            Activity(
                id=activity_id,
                pact_id=pact_id,
                kind=kind,
                timestamp=self._iso(self._now()),
                actor=actor,
            )
        )

    @gl.public.write
    def create_pact(
        self,
        location_name: str,
        admin1: str,
        country: str,
        country_code: str,
        latitude: str,
        longitude: str,
        timezone_name: str,
        target_date: str,
        metric: str,
        operator: str,
        threshold: str,
        prediction: str,
    ) -> str:
        location_name = self._text(location_name, "location_name", 100, True)
        admin1 = self._text(admin1, "admin1", 100, False)
        country = self._text(country, "country", 100, False)
        country_code = self._text(country_code, "country_code", 2, False).upper()
        if country_code and (len(country_code) != 2 or not country_code.isalpha()):
            _error("country_code must contain two letters")
        latitude = self._coordinate(latitude, "latitude", 90)
        longitude = self._coordinate(longitude, "longitude", 180)
        timezone_name = self._validate_timezone(timezone_name)
        parsed_date = self._validate_date(target_date)
        if metric not in METRICS:
            _error("Unsupported weather metric")
        if operator not in OPERATORS:
            _error("Unsupported threshold operator")
        if prediction not in {"YES", "NO"}:
            _error("prediction must be YES or NO")
        threshold_scaled, threshold = _decimal(threshold, "threshold", 3)
        definition = METRICS[metric]
        if threshold_scaled < definition["min"] or threshold_scaled > definition["max"]:
            _error("threshold is outside the metric range")

        sender = gl.message.sender_address
        pact_id = "WP-" + str(self.next_pact_number).rjust(10, "0")
        self.next_pact_number += 1
        ready = datetime(
            parsed_date.year,
            parsed_date.month,
            parsed_date.day,
            tzinfo=timezone.utc,
        ) + timedelta(days=RESOLUTION_DELAY_DAYS)
        self.pacts[pact_id] = Pact(
            id=pact_id,
            creator=sender,
            location_name=location_name,
            admin1=admin1,
            country=country,
            country_code=country_code,
            latitude=latitude,
            longitude=longitude,
            timezone=timezone_name,
            target_date=target_date,
            metric=metric,
            operator=operator,
            unit=definition["unit"],
            threshold=threshold,
            prediction=prediction,
            status="OPEN",
            created_at=self._iso(self._now()),
            ready_at=self._iso(ready),
            source_url=self._source_url(latitude, longitude, target_date, metric, timezone_name),
            observed_value="",
            condition_met=False,
            resolved_at="",
            resolver="",
            provider_latitude="",
            provider_longitude="",
            provider_utc_offset_seconds="",
        )
        self.pact_ids.append(pact_id)
        self._activity(pact_id, "CREATED", sender)
        return pact_id

    def _condition(self, observed: int, threshold: int, operator: str) -> bool:
        if operator == "gt":
            return observed > threshold
        if operator == "gte":
            return observed >= threshold
        if operator == "lt":
            return observed < threshold
        return observed <= threshold

    @gl.public.write
    def resolve_pact(self, pact_id: str):
        if pact_id not in self.pacts:
            _error("Pact not found")
        pact = self.pacts[pact_id]
        if pact.status != "OPEN":
            _error("Pact already resolved")
        ready_at = datetime.fromisoformat(pact.ready_at.replace("Z", "+00:00"))
        if self._now() < ready_at:
            _error("Resolution delay has not elapsed; retry after " + pact.ready_at)

        # Copy every required storage field before entering the nondeterministic
        # closure. Storage objects never cross that boundary.
        source_url = pact.source_url
        metric = pact.metric
        target_date = pact.target_date
        zone = pact.timezone
        threshold_scaled, _ = _decimal(pact.threshold, "threshold", 3)
        operator = pact.operator

        def failure(message: str) -> str:
            return json.dumps(
                {"ok": False, "error": message},
                sort_keys=True,
                separators=(",", ":"),
            )

        def leader_fn() -> str:
            try:
                response = gl.nondet.web.get(source_url)
            except Exception:
                return failure(ERROR_TRANSIENT + "Open-Meteo request failed; retry later")
            status = response.status
            if status == 408 or status == 429 or status >= 500:
                return failure(ERROR_TRANSIENT + "Open-Meteo is temporarily unavailable; retry later")
            if status != 200:
                return failure(ERROR_EXTERNAL + "Open-Meteo rejected the fixed historical request")
            try:
                observation = _observation(response.body, source_url, metric, target_date, zone)
            except gl.vm.UserError as error:
                message = error.data if isinstance(error.data, str) else ERROR_EXTERNAL + "invalid weather response"
                return failure(message)
            except Exception:
                return failure(ERROR_EXTERNAL + "malformed or unexpected weather response")
            # Both success and failure are ordinary normalized values. This lets
            # run_nondet compare validator results without comparing
            # implementation-specific exception representations.
            return json.dumps(
                {"ok": True, "observation": observation},
                sort_keys=True,
                separators=(",", ":"),
            )

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                own_result = leader_fn()
            except Exception:
                return False
            return own_result == leader_result.calldata

        normalized = gl.vm.run_nondet(leader_fn, validator_fn)
        result = json.loads(normalized)
        if not isinstance(result, dict) or not isinstance(result.get("ok"), bool):
            _error(ERROR_EXTERNAL + "invalid normalized source result")
        if not result["ok"]:
            _error(result["error"])
        evidence = json.loads(result["observation"])
        requested_latitude, _ = _decimal(pact.latitude, "latitude", 6)
        requested_longitude, _ = _decimal(pact.longitude, "longitude", 6)
        provider_latitude, _ = _decimal(evidence["provider_latitude"], "provider latitude", 6)
        provider_longitude, _ = _decimal(evidence["provider_longitude"], "provider longitude", 6)
        if (
            abs(provider_latitude - requested_latitude) > PROVIDER_GRID_TOLERANCE
            or abs(provider_longitude - requested_longitude) > PROVIDER_GRID_TOLERANCE
        ):
            _error(ERROR_EXTERNAL + "provider coordinates do not match the requested model grid")
        observed_scaled, observed = _decimal(evidence["observed"], "observation", 3)
        condition = self._condition(observed_scaled, threshold_scaled, operator)
        pact.observed_value = observed
        pact.condition_met = condition
        pact.status = "RESOLVED_YES" if condition else "RESOLVED_NO"
        pact.resolved_at = self._iso(self._now())
        pact.resolver = gl.message.sender_address.as_hex
        pact.provider_latitude = evidence["provider_latitude"]
        pact.provider_longitude = evidence["provider_longitude"]
        pact.provider_utc_offset_seconds = evidence["utc_offset_seconds"]

        creator = pact.creator
        if creator not in self.reputation:
            self.reputation[creator] = Reputation(correct=0, streak=0, finalized=0)
        reputation = self.reputation[creator]
        actual = "YES" if condition else "NO"
        correct = actual == pact.prediction
        reputation.finalized += 1
        if correct:
            reputation.correct += 1
            reputation.streak += 1
        else:
            reputation.streak = 0
        self._activity(pact_id, "RESOLVED", gl.message.sender_address)

    def _pagination(self, offset: int, limit: int) -> tuple[int, int]:
        if isinstance(offset, bool) or isinstance(limit, bool) or not isinstance(offset, int) or not isinstance(limit, int):
            _error("Pagination values must be integers")
        if offset < 0 or limit < 1 or limit > MAX_PAGE_SIZE:
            _error("Pagination must use offset >= 0 and limit from 1 to 50")
        return offset, limit

    def _pact_view(self, pact: Pact) -> dict:
        status = pact.status
        if status == "OPEN" and self._now() >= datetime.fromisoformat(pact.ready_at.replace("Z", "+00:00")):
            status = "READY_TO_RESOLVE"
        resolved = pact.status != "OPEN"
        return {
            "id": pact.id,
            "creator": pact.creator.as_hex,
            "location": {
                "name": pact.location_name,
                "admin1": pact.admin1,
                "country": pact.country,
                "countryCode": pact.country_code,
                "latitude": pact.latitude,
                "longitude": pact.longitude,
                "timezone": pact.timezone,
            },
            "targetDate": pact.target_date,
            "metric": pact.metric,
            "operator": pact.operator,
            "unit": pact.unit,
            "threshold": pact.threshold,
            "prediction": pact.prediction,
            "status": status,
            "createdAt": pact.created_at,
            "readyAt": pact.ready_at,
            "evidence": {
                "observedValue": pact.observed_value if resolved else "",
                "unit": pact.unit if resolved else "",
                "sourceName": SOURCE_NAME if resolved else "",
                "sourceUrl": pact.source_url if resolved else "",
                "datasetNote": DATASET_NOTE if resolved else "",
                "resolvedAt": pact.resolved_at if resolved else "",
                "resolver": pact.resolver,
                "providerLatitude": pact.provider_latitude,
                "providerLongitude": pact.provider_longitude,
                "providerTimezone": pact.timezone if resolved else "",
                "providerUtcOffsetSeconds": pact.provider_utc_offset_seconds,
            },
        }

    @gl.public.view
    def get_pact(self, pact_id: str) -> dict:
        if pact_id not in self.pacts:
            return {}
        return self._pact_view(self.pacts[pact_id])

    @gl.public.view
    def get_pacts(self, offset: int, limit: int) -> dict:
        offset, limit = self._pagination(offset, limit)
        total = len(self.pact_ids)
        items = []
        end = min(offset + limit, total)
        for index in range(offset, end):
            storage_index = total - 1 - index
            items.append(self._pact_view(self.pacts[self.pact_ids[storage_index]]))
        return {"items": items, "total": total, "offset": offset, "limit": limit, "hasMore": end < total}

    @gl.public.view
    def get_activity(self, offset: int, limit: int) -> dict:
        offset, limit = self._pagination(offset, limit)
        total = len(self.activities)
        items = []
        end = min(offset + limit, total)
        for index in range(offset, end):
            item = self.activities[total - 1 - index]
            items.append(
                {
                    "id": item.id,
                    "pactId": item.pact_id,
                    "type": item.kind,
                    "timestamp": item.timestamp,
                    "actor": item.actor.as_hex,
                }
            )
        return {"items": items, "total": total, "offset": offset, "limit": limit, "hasMore": end < total}

    @gl.public.view
    def get_reputation(self, address: str) -> dict:
        creator = gl.Address(address)
        if creator not in self.reputation:
            return {"correctPredictions": 0, "currentStreak": 0, "finalizedPacts": 0}
        reputation = self.reputation[creator]
        return {
            "correctPredictions": reputation.correct,
            "currentStreak": reputation.streak,
            "finalizedPacts": reputation.finalized,
        }

    @gl.public.view
    def get_metadata(self) -> dict:
        return {
            "name": "WeatherPact",
            "version": 1,
            "resolutionDelayDays": RESOLUTION_DELAY_DAYS,
            "sourceName": SOURCE_NAME,
            "sourceHost": SOURCE_HOST,
            "pactCount": len(self.pact_ids),
            "activityCount": len(self.activities),
        }
