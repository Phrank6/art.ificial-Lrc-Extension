"""
Persona matching — pure function module, no FastAPI dependency.

Scoring weights:
    subject  × 0.4
    mood     × 0.4
    style    × 0.2

Each dimension's score is the fraction of the persona's keywords for that dimension
that appear as substrings in the corresponding analysis text.

This module is intentionally free of I/O so it can be unit-tested in isolation.
"""

from __future__ import annotations


def _token_overlap(persona_kws: list[str], text: str) -> float:
    """Return the fraction of persona_kws that appear as substrings in *text*.

    A keyword is considered a match when it appears verbatim (case-insensitive)
    anywhere in the text string, including as part of a longer word.
    """
    if not persona_kws:
        return 0.0
    text_lower = text.lower()
    hits = sum(1 for kw in persona_kws if kw.lower() in text_lower)
    return hits / len(persona_kws)


def score_persona(persona: dict, image_analysis: dict) -> float:
    """Compute a weighted relevance score for *persona* against *image_analysis*.

    Returns a float in [0, 1].

    Args:
        persona: A single persona dict (must have a ``keywords`` key with
            ``subject``, ``mood``, and ``style`` sub-lists).
        image_analysis: Dict with keys ``subject``, ``lighting``, ``mood``,
            ``color_profile``, ``technical_notes``, and ``keywords`` (list).
    """
    kws = persona.get("keywords", {})
    subject_kws: list[str] = kws.get("subject", [])
    mood_kws:    list[str] = kws.get("mood",    [])
    style_kws:   list[str] = kws.get("style",   [])

    # Build analysis corpus for each scoring dimension.
    # The image-analysis ``keywords`` field (Claude-generated) feeds subject matching.
    subject_text = " ".join([
        image_analysis.get("subject", ""),
        " ".join(image_analysis.get("keywords", [])),
    ])
    mood_text = " ".join([
        image_analysis.get("mood", ""),
        image_analysis.get("color_profile", ""),
    ])
    style_text = " ".join([
        image_analysis.get("lighting", ""),
        image_analysis.get("technical_notes", ""),
    ])

    s = _token_overlap(subject_kws, subject_text)
    m = _token_overlap(mood_kws,    mood_text)
    t = _token_overlap(style_kws,   style_text)

    return s * 0.4 + m * 0.4 + t * 0.2


def match_personas(
    personas: list[dict],
    image_analysis: dict,
    top_n: int = 8,
) -> list[str]:
    """Return the IDs of the *top_n* best-matching personas, highest score first.

    Args:
        personas: Full list of persona dicts (from personas.json).
        image_analysis: Structured analysis dict for the uploaded photo.
        top_n: Number of personas to return (default 8, for the 3×3 grid).

    Returns:
        List of persona ID strings in descending relevance order.
    """
    scored: list[tuple[str, float]] = [
        (p["id"], score_persona(p, image_analysis))
        for p in personas
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [pid for pid, _ in scored[:top_n]]
