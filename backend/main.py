import base64
import hashlib
import io
import json
import os
import re
from collections import OrderedDict
from typing import Optional

import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from processing import (
    EditParams,
    CropParams,
    load_image,
    process_image,
    apply_crop,
    apply_persona_transforms,
    image_to_base64,
)
from personas import router as personas_router, PERSONAS_BY_ID

app = FastAPI(title="Photo Editor API")

_default_origins = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
]
_extra = os.environ.get("ALLOWED_ORIGINS", "")
_allowed_origins = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Mount personas router ────────────────────────────────────────────────────
app.include_router(personas_router)

# ─── In-memory image cache ────────────────────────────────────────────────────
# Keyed by SHA-1 of the raw base64 string. Stores the decoded PIL Image so
# repeated slider calls skip the decode + RAW-processing step entirely.
# Capped at 8 entries (LRU eviction) to stay memory-safe.

_IMG_CACHE: OrderedDict[str, Image.Image] = OrderedDict()
_CACHE_MAX = 8


def _cache_key(image_b64: str) -> str:
    # Hash first 64 KB of the b64 string — enough for a unique fingerprint,
    # avoids hashing multi-MB strings on every request.
    return hashlib.sha1(image_b64[:65536].encode()).hexdigest()


def get_cached_image(image_b64: str, filename: str) -> Image.Image:
    key = _cache_key(image_b64)
    if key in _IMG_CACHE:
        _IMG_CACHE.move_to_end(key)          # LRU: mark as recently used
        return _IMG_CACHE[key].copy()        # always return a fresh copy

    file_bytes = base64.b64decode(image_b64)
    img = load_image(file_bytes, filename)

    _IMG_CACHE[key] = img
    _IMG_CACHE.move_to_end(key)
    if len(_IMG_CACHE) > _CACHE_MAX:
        _IMG_CACHE.popitem(last=False)       # evict oldest entry

    return img.copy()


class ProcessRequest(BaseModel):
    image_b64: str
    filename: str
    params: dict = {}


class CropRequest(BaseModel):
    image_b64: str
    filename: str
    crop: dict = {}


def decode_image(image_b64: str, filename: str) -> Image.Image:
    try:
        return get_cached_image(image_b64, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {str(e)}")


@app.post("/process")
async def process_endpoint(req: ProcessRequest):
    img = decode_image(req.image_b64, req.filename)

    # Build EditParams from dict, ignoring unknown keys
    params = EditParams(**{k: v for k, v in req.params.items() if k in EditParams.__dataclass_fields__})

    result = process_image(img, params)
    return {"result_b64": image_to_base64(result)}


@app.post("/process-crop")
async def process_crop_endpoint(req: CropRequest):
    img = decode_image(req.image_b64, req.filename)
    ratio    = req.crop.get("ratio",   None)
    rotation = float(req.crop.get("rotation", 0.0))
    # Forward interactive crop-box coordinates if present (apply_crop already handles them)
    crop_x = req.crop.get("crop_x", None)
    crop_y = req.crop.get("crop_y", None)
    crop_w = req.crop.get("crop_w", None)
    crop_h = req.crop.get("crop_h", None)
    result = apply_crop(img, ratio, rotation, crop_x, crop_y, crop_w, crop_h)
    return {"result_b64": image_to_base64(result)}


# ─── POST /edit/style ─────────────────────────────────────────────────────────
# Calls Claude with the persona's system_prompt_fragment as the style directive.
# Clips Claude's output to pillow_signature bounds, then applies Pillow transforms.
# Returns the rendered image AND tutorial data so the frontend needs only one call.

class StyleRequest(BaseModel):
    persona_id:     str
    image_b64:      str
    filename:       str
    image_analysis: dict = {}
    api_key:        str   # forwarded from the user's browser session


# Claude param-range rules shared with the system prompt
_TUTORIAL_PARAM_RULES = """For tutorial_steps, use ONLY these param names and STRICT value ranges:
- exposure: -5 to +5
- contrast, highlights, shadows, whites, blacks, brightness: -100 to +100
- temperature, tint, vibrance, saturation: -100 to +100
- clarity, texture, dehaze: -100 to +100
- vignette: -100 to +100
- grain, fade: 0 to +100
- r_offset, g_offset, b_offset: -50 to +50
- film_softness: 0 to 1.0
Only include steps that meaningfully express the photographer's style."""


@app.post("/edit/style")
async def edit_style_endpoint(req: StyleRequest):
    persona = PERSONAS_BY_ID.get(req.persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail=f"Unknown persona: {req.persona_id}")

    sig = persona["pillow_signature"]
    img = decode_image(req.image_b64, req.filename)
    analysis = req.image_analysis

    system_prompt = f"""You are a professional photo editor and photography teacher implementing a specific photographic style.

Style directive: {persona["system_prompt_fragment"]}

Photo context:
- Subject: {analysis.get("subject", "unknown")}
- Lighting: {analysis.get("lighting", "unknown")}
- Mood: {analysis.get("mood", "unknown")}
- Color profile: {analysis.get("color_profile", "unknown")}
- Technical notes: {analysis.get("technical_notes", "")}

Respond ONLY with valid JSON (no markdown, no code fences):
{{
  "pillow": {{
    "contrast":      <float in [{sig["contrast_range"][0]}, {sig["contrast_range"][1]}]>,
    "brightness":    <float in [{sig["brightness_range"][0]}, {sig["brightness_range"][1]}]>,
    "color":         <float in [{sig["color_range"][0]}, {sig["color_range"][1]}]>,
    "sharpness":     <float in [{sig["sharpness_range"][0]}, {sig["sharpness_range"][1]}]>,
    "grain_opacity": <float in [{sig["grain_opacity_range"][0]}, {sig["grain_opacity_range"][1]}]>
  }},
  "tutorial_steps": [
    {{ "param": "paramName", "value": number, "explanation": "what this control does", "reasoning": "why {persona["name"]}'s style calls for this specific value on this photo" }}
  ],
  "summary": "1–2 sentences describing how this edit embodies {persona["name"]}'s aesthetic.",
  "suggested_crop": null
}}

Pillow values MUST be within the specified ranges — they will be hard-clamped to those bounds.
{_TUTORIAL_PARAM_RULES}
Reference {persona["name"]} by name in tutorial_steps reasoning."""

    try:
        client = anthropic.Anthropic(api_key=req.api_key)
        response = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=2048,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": req.image_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": f"Apply the {persona['name']} style to this photo.",
                        },
                    ],
                }
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")

    # Parse Claude's JSON response
    text = response.content[0].text
    try:
        claude_params = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                claude_params = json.loads(match.group(0))
            except json.JSONDecodeError:
                raise HTTPException(status_code=500, detail="Claude returned malformed JSON")
        else:
            raise HTTPException(status_code=500, detail="Claude returned malformed JSON")

    # Apply persona Pillow transforms (Claude's pillow values are clipped inside the function)
    result_img = apply_persona_transforms(img, sig, claude_params)

    # Build applied_params in EditParams format from tutorial_steps.
    #
    # WHY: The frontend maps applied_params → claudeResult.params and passes it directly
    # to processImage() (POST /process), which feeds into the EditParams dataclass.
    # EditParams uses additive offsets (e.g. contrast: -100 to +100, 0 = no change).
    # The Pillow pillow_signature values are ImageEnhance multipliers (1.0 = no change,
    # range ~0.5–2.0) — a completely different scale that would render as near-zero
    # when interpreted as EditParams offsets.
    #
    # tutorial_steps are generated by Claude using the EditParams naming convention
    # and value ranges, making them the correct source for applied_params.
    tutorial_steps = claude_params.get("tutorial_steps", [])
    applied_params: dict = {}
    for step in tutorial_steps:
        param = step.get("param")
        value = step.get("value")
        if param and value is not None and param in EditParams.__dataclass_fields__:
            applied_params[param] = value

    return {
        "result_b64":     image_to_base64(result_img),
        "applied_params": applied_params,   # EditParams-compatible (from tutorial_steps)
        "tutorial_steps": tutorial_steps,
        "summary":        claude_params.get("summary", ""),
        "suggested_crop": claude_params.get("suggested_crop", None),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
