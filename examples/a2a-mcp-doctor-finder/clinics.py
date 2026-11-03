"""Fictional clinic directory shared by the MCP tool and the scripted model.

The browser toy in src/components/demos/packet.ts uses the same eight rows.
Nothing here is a real practice, and there are no street addresses or phone numbers.
"""

from __future__ import annotations

import json
import re
from typing import Any

CLINICS: list[dict[str, Any]] = [
    {
        "name": "Harbor & Pine Pediatrics",
        "clinician": "Amira Solano",
        "specialty": "pediatrics",
        "city": "Seattle",
        "state": "WA",
        "accepting": True,
    },
    {
        "name": "Rainier Family Medicine",
        "clinician": "Jonah Peck",
        "specialty": "family medicine",
        "city": "Seattle",
        "state": "WA",
        "accepting": True,
    },
    {
        "name": "Cedar Current Cardiology",
        "clinician": "Naomi Berg",
        "specialty": "cardiology",
        "city": "Tacoma",
        "state": "WA",
        "accepting": True,
    },
    {
        "name": "Willamette Children's Clinic",
        "clinician": "Priya Raman",
        "specialty": "pediatrics",
        "city": "Portland",
        "state": "OR",
        "accepting": False,
    },
    {
        "name": "Lake Effect Dermatology",
        "clinician": "Elena Voss",
        "specialty": "dermatology",
        "city": "Madison",
        "state": "WI",
        "accepting": True,
    },
    {
        "name": "Mesa Sunrise Orthopedics",
        "clinician": "Luis Ortega",
        "specialty": "orthopedics",
        "city": "Tucson",
        "state": "AZ",
        "accepting": True,
    },
    {
        "name": "Fremont Mind Clinic",
        "clinician": "Hana Ito",
        "specialty": "psychiatry",
        "city": "Seattle",
        "state": "WA",
        "accepting": True,
    },
    {
        "name": "Bayou Hearing",
        "clinician": "Camille Broussard",
        "specialty": "audiology",
        "city": "Lafayette",
        "state": "LA",
        "accepting": True,
    },
]

_SPECIALTIES: list[tuple[str, re.Pattern[str]]] = [
    ("pediatrics", re.compile(r"pediatric|paediatric|pediatrics", re.I)),
    ("family medicine", re.compile(r"family medicine|family doctor|general practice", re.I)),
    ("cardiology", re.compile(r"cardiolog|heart doctor", re.I)),
    ("dermatology", re.compile(r"dermatolog|skin doctor", re.I)),
    ("orthopedics", re.compile(r"orthoped", re.I)),
    ("psychiatry", re.compile(r"psychiatr", re.I)),
    ("audiology", re.compile(r"audiolog|hearing", re.I)),
]

_CITIES: list[tuple[str, str, re.Pattern[str]]] = [
    ("Seattle", "WA", re.compile(r"\bseattle\b", re.I)),
    ("Tacoma", "WA", re.compile(r"\btacoma\b", re.I)),
    ("Portland", "OR", re.compile(r"\bportland\b", re.I)),
    ("Madison", "WI", re.compile(r"\bmadison\b", re.I)),
    ("Tucson", "AZ", re.compile(r"\btucson\b", re.I)),
    ("Lafayette", "LA", re.compile(r"\blafayette\b", re.I)),
]

_STATES: list[tuple[str, re.Pattern[str], re.Pattern[str]]] = [
    ("WA", re.compile(r"\bwashington\b", re.I), re.compile(r"\bWA\b")),
    ("OR", re.compile(r"\boregon\b", re.I), re.compile(r"\bOR\b")),
    ("WI", re.compile(r"\bwisconsin\b", re.I), re.compile(r"\bWI\b")),
    ("AZ", re.compile(r"\barizona\b", re.I), re.compile(r"\bAZ\b")),
    ("LA", re.compile(r"\blouisiana\b", re.I), re.compile(r"\bLA\b")),
]


def parse_question(text: str) -> dict[str, str | None | bool]:
    """Pull a city, state, and specialty out of a short question. No model."""
    city = state = specialty = None
    for name, st, pattern in _CITIES:
        if pattern.search(text):
            city, state = name, st
            break
    if city is None:
        for st, name_pattern, abbrev in _STATES:
            if name_pattern.search(text) or abbrev.search(text):
                state = st
                break
    for spec, pattern in _SPECIALTIES:
        if pattern.search(text):
            specialty = spec
            break
    return {
        "city": city,
        "state": state,
        "specialty": specialty,
        "understood": bool(city or state or specialty),
    }


def find_clinics(
    city: str | None = None,
    state: str | None = None,
    specialty: str | None = None,
) -> list[dict[str, Any]]:
    """Filter the directory. At least one argument is required."""
    if not city and not state and not specialty:
        return [{"error": "Provide a city, a state, or a specialty."}]
    city_q = city.strip().lower() if city else None
    state_q = state.strip().lower() if state else None
    spec_q = specialty.strip().lower() if specialty else None
    hits = []
    for row in CLINICS:
        if city_q and row["city"].lower() != city_q:
            continue
        if state_q and row["state"].lower() != state_q:
            continue
        if spec_q and spec_q not in row["specialty"].lower():
            continue
        hits.append(row)
    return hits


def render_answer(parsed: dict[str, Any], clinics: list[dict[str, Any]]) -> str:
    """Write a sentence that names only clinics present in `clinics`."""
    if not parsed.get("understood"):
        return "I need a city or a specialty from the directory. I will not guess a name."
    real = [row for row in clinics if "error" not in row and "name" in row]
    if not real:
        where = ", ".join(
            str(parsed[key]) for key in ("specialty", "city", "state") if parsed.get(key)
        )
        return (
            f"The directory has no clinic for {where}. "
            "I am not adding a name that was not in the tool result."
        )
    bits = []
    for row in real:
        accepting = "accepting new patients" if row["accepting"] else "not accepting new patients"
        bits.append(
            f"{row['name']} ({row['clinician']}, {row['specialty']}, {row['city']}, {row['state']}, {accepting})"
        )
    return "From the directory: " + "; ".join(bits) + "."


def clinics_from_tool_content(content: Any) -> list[dict[str, Any]]:
    """Read the text block LangChain's MCP adapter returned from tools/call."""
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        chunks: list[str] = []
        for block in content:
            if isinstance(block, str):
                chunks.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                chunks.append(str(block.get("text", "")))
        text = "\n".join(chunks)
    else:
        text = str(content)
    parsed = json.loads(text)
    if not isinstance(parsed, list):
        raise ValueError("tool result was not a list")
    return parsed
