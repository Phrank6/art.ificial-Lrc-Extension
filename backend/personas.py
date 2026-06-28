"""
Persona router — loaded once at startup, never per-request.

Endpoints
---------
GET  /personas          — public fields only (no pillow_signature, no system_prompt_fragment)
POST /personas/match    — weighted Python keyword matching, no LLM
"""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# ─── Load persona data once at module import ──────────────────────────────────
_DATA_PATH = Path(__file__).parent / "data" / "personas.json"
PERSONAS: list[dict] = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
PERSONAS_BY_ID: dict[str, dict] = {p["id"]: p for p in PERSONAS}

# Fields exposed through GET /personas
# pillow_signature and system_prompt_fragment are intentionally excluded
_PUBLIC_FIELDS = frozenset({
    "id", "name", "era", "nationality",
    "mood_descriptor", "keywords", "example_image_hint", "confidence",
})


# ─── GET /personas ─────────────────────────────────────────────────────────────
@router.get("/personas")
def get_personas() -> list[dict]:
    """Return all personas with public fields only."""
    return [
        {k: v for k, v in p.items() if k in _PUBLIC_FIELDS}
        for p in PERSONAS
    ]


# ─── POST /personas/match ──────────────────────────────────────────────────────
class MatchRequest(BaseModel):
    subject:         str       = ""
    lighting:        str       = ""
    mood:            str       = ""
    color_profile:   str       = ""
    technical_notes: str       = ""
    keywords:        list[str] = []


@router.post("/personas/match")
def match_personas_endpoint(req: MatchRequest) -> dict:
    """
    Return the 8 best-matching persona IDs ranked by keyword overlap score.
    Runs entirely in Python — no LLM call.
    """
    from utils.persona_matching import match_personas

    analysis = req.model_dump()
    matched_ids = match_personas(PERSONAS, analysis, top_n=8)
    return {"matched_ids": matched_ids}
