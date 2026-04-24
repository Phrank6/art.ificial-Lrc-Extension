"""
Lightroom AI Pipeline
=====================
Analyzes a photo using a local vision model (via Ollama),
generates Lightroom develop parameters as JSON, validates and
clamps all values to safe ranges, then writes a .xmp sidecar
file next to the photo for Lightroom Classic to read.

Requirements:
    pip install ollama

Usage:
    python lightroom_ai_pipeline.py <image_path> "<creative_prompt>"

Example:
    python lightroom_ai_pipeline.py /Photos/IMG_1234.png "warm golden hour, lift shadows"
"""

import sys
import os
import json
import base64
import re
import textwrap
from datetime import datetime
from typing import Any

try:
    import ollama
except ImportError:
    print("ERROR: ollama package not installed. Run: pip install ollama")
    sys.exit(1)


# ─────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────

MODEL = "qwen2.5vl:7b"          # Change to gemma4:e4b or any vision model you have pulled
OLLAMA_HOST = "http://localhost:11434"
TEMPERATURE = 0.3               # Low temp = more consistent structured output


# ─────────────────────────────────────────────
#  PARAMETER SCHEMA WITH VALID RANGES
#  All ranges are for PNG/JPEG files in LrC.
#  RAW files use Kelvin for temp — different schema.
# ─────────────────────────────────────────────

PARAM_SCHEMA = {
    # key: (min, max, default, description)
    "exposure":    (-5.0,  5.0,   0.0,  "Overall brightness"),
    "contrast":    (-100,  100,   0,    "Global contrast"),
    "highlights":  (-100,  100,   0,    "Recover bright areas"),
    "shadows":     (-100,  100,   0,    "Lift shadow detail"),
    "whites":      (-100,  100,   0,    "White point adjustment"),
    "blacks":      (-100,  100,   0,    "Black point adjustment"),
    "temp":        (-100,  100,   0,    "Color temperature (PNG scale, not Kelvin)"),
    "tint":        (-150,  150,   0,    "Green-Magenta tint"),
    "vibrance":    (-100,  100,   0,    "Smart saturation (protects skin)"),
    "saturation":  (-100,  100,   0,    "Global saturation"),
}

CROP_SCHEMA = {
    # key: (min, max, default, description)
    "angle":  (-45.0, 45.0, 0.0, "Rotation in degrees"),
    "top":    (0.0,   1.0,  0.0, "Top crop edge (normalized 0-1)"),
    "left":   (0.0,   1.0,  0.0, "Left crop edge (normalized 0-1)"),
    "bottom": (0.0,   1.0,  1.0, "Bottom crop edge (normalized 0-1)"),
    "right":  (0.0,   1.0,  1.0, "Right crop edge (normalized 0-1)"),
}

VALID_ASPECT_RATIOS = [
    "original", "1:1", "4:3", "3:2", "16:9",
    "4:5", "5:7", "2:3", "3:4", "5:4", "7:5"
]


# ─────────────────────────────────────────────
#  SYSTEM PROMPT (THE SKILL)
# ─────────────────────────────────────────────

def build_system_prompt() -> str:
    param_lines = "\n".join(
        f"  - {key}: {mn} to {mx}  ({desc})"
        for key, (mn, mx, _, desc) in PARAM_SCHEMA.items()
    )
    crop_lines = "\n".join(
        f"  - {key}: {mn} to {mx}  ({desc})"
        for key, (mn, mx, _, desc) in CROP_SCHEMA.items()
    )
    aspect_list = ", ".join(VALID_ASPECT_RATIOS)

    return textwrap.dedent(f"""
        You are a professional photo editor and Lightroom Classic expert.
        The user will provide a photo and a creative intent prompt.

        Your task:
        1. Carefully analyze the actual image — assess current exposure level, color cast,
           shadow distribution, highlight clipping, subject position, and overall mood.
        2. Read the user's creative intent prompt.
        3. Reason about what parameter adjustments will achieve that look given the current
           state of the image — do not apply generic presets, tailor to what you see.
        4. Output ONLY a single valid JSON object. No markdown, no explanation, no extra text.

        IMPORTANT RULES:
        - All values MUST be within the ranges below. Never exceed them.
        - This is a PNG/JPEG file. Temperature uses a scale of -100 to 100, NOT Kelvin.
          A temp of 6200 is invalid and will break the file. Use values like 10, 20, -15.
        - Crop edges are normalized 0.0 to 1.0 (proportion of image width/height).
          top must be less than bottom. left must be less than right.
        - aspect_ratio must be one of: {aspect_list}
        - Output nothing except the JSON object.

        PARAMETER RANGES:
        Basic adjustments:
        {param_lines}

        Crop:
        {crop_lines}

        REQUIRED OUTPUT FORMAT:
        {{
          "basic": {{
            "exposure": 0.0,
            "contrast": 0,
            "highlights": 0,
            "shadows": 0,
            "whites": 0,
            "blacks": 0,
            "temp": 0,
            "tint": 0,
            "vibrance": 0,
            "saturation": 0
          }},
          "crop": {{
            "angle": 0.0,
            "aspect_ratio": "original",
            "top": 0.0,
            "left": 0.0,
            "bottom": 1.0,
            "right": 1.0
          }}
        }}
    """).strip()


# ─────────────────────────────────────────────
#  VALIDATION & CLAMPING
#  Even if the model misbehaves, values are
#  corrected before touching any file.
# ─────────────────────────────────────────────

def clamp(value: float, mn: float, mx: float) -> float:
    """Clamp value to [mn, mx] range."""
    return max(mn, min(mx, value))


def validate_and_clamp(raw: dict) -> tuple[dict, list[str]]:
    """
    Validate the AI output against the schema.
    Returns (corrected_params, list_of_warnings).
    Warnings are logged so you can see where the model went out of range.
    """
    warnings = []
    result = {"basic": {}, "crop": {}}

    # --- Validate basic parameters ---
    basic_raw = raw.get("basic", {})
    if not isinstance(basic_raw, dict):
        warnings.append("'basic' section missing or malformed — using all defaults")
        basic_raw = {}

    for key, (mn, mx, default, _) in PARAM_SCHEMA.items():
        raw_val = basic_raw.get(key)

        if raw_val is None:
            warnings.append(f"basic.{key}: missing — using default ({default})")
            result["basic"][key] = default
            continue

        try:
            val = float(raw_val)
        except (TypeError, ValueError):
            warnings.append(f"basic.{key}: non-numeric value '{raw_val}' — using default ({default})")
            result["basic"][key] = default
            continue

        clamped = clamp(val, mn, mx)
        if clamped != val:
            warnings.append(
                f"basic.{key}: value {val} out of range [{mn}, {mx}] — clamped to {clamped}"
            )
        result["basic"][key] = clamped

    # --- Validate crop parameters ---
    crop_raw = raw.get("crop", {})
    if not isinstance(crop_raw, dict):
        warnings.append("'crop' section missing or malformed — using defaults")
        crop_raw = {}

    for key, (mn, mx, default, _) in CROP_SCHEMA.items():
        raw_val = crop_raw.get(key)

        if raw_val is None:
            warnings.append(f"crop.{key}: missing — using default ({default})")
            result["crop"][key] = default
            continue

        try:
            val = float(raw_val)
        except (TypeError, ValueError):
            warnings.append(f"crop.{key}: non-numeric value '{raw_val}' — using default ({default})")
            result["crop"][key] = default
            continue

        clamped = clamp(val, mn, mx)
        if clamped != val:
            warnings.append(
                f"crop.{key}: value {val} out of range [{mn}, {mx}] — clamped to {clamped}"
            )
        result["crop"][key] = clamped

    # --- Validate aspect ratio ---
    aspect = crop_raw.get("aspect_ratio", "original")
    if aspect not in VALID_ASPECT_RATIOS:
        warnings.append(
            f"crop.aspect_ratio: '{aspect}' not recognized — falling back to 'original'"
        )
        aspect = "original"
    result["crop"]["aspect_ratio"] = aspect

    # --- Sanity check crop geometry ---
    if result["crop"]["top"] >= result["crop"]["bottom"]:
        warnings.append("crop: top >= bottom — resetting to full height (0.0, 1.0)")
        result["crop"]["top"] = 0.0
        result["crop"]["bottom"] = 1.0

    if result["crop"]["left"] >= result["crop"]["right"]:
        warnings.append("crop: left >= right — resetting to full width (0.0, 1.0)")
        result["crop"]["left"] = 0.0
        result["crop"]["right"] = 1.0

    return result, warnings


# ─────────────────────────────────────────────
#  XMP GENERATOR
# ─────────────────────────────────────────────

def aspect_ratio_to_lrc(aspect: str) -> tuple[float, float]:
    """Convert aspect ratio string to LrC CropConstrainAspectRatio values."""
    mapping = {
        "original": (0.0, 0.0),   # 0,0 means unconstrained in LrC
        "1:1":  (1.0, 1.0),
        "4:3":  (4.0, 3.0),
        "3:2":  (3.0, 2.0),
        "16:9": (16.0, 9.0),
        "4:5":  (4.0, 5.0),
        "5:7":  (5.0, 7.0),
        "2:3":  (2.0, 3.0),
        "3:4":  (3.0, 4.0),
        "5:4":  (5.0, 4.0),
        "7:5":  (7.0, 5.0),
    }
    return mapping.get(aspect, (0.0, 0.0))


def params_to_xmp(params: dict, image_path: str, prompt: str) -> str:
    """Convert validated parameter dict to a Lightroom Classic XMP sidecar string."""
    b = params["basic"]
    c = params["crop"]
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    filename = os.path.basename(image_path)
    ar_w, ar_h = aspect_ratio_to_lrc(c["aspect_ratio"])

    # LrC stores crop as HasCrop + four edges + angle
    has_crop = "True" if (
        c["top"] != 0.0 or c["left"] != 0.0 or
        c["bottom"] != 1.0 or c["right"] != 1.0 or
        c["angle"] != 0.0
    ) else "False"

    xmp = f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by Lightroom AI Pipeline -->
<!-- Source: {filename} -->
<!-- Prompt: {prompt} -->
<!-- Created: {now} -->
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      xmp:ModifyDate="{now}"
      xmp:CreatorTool="Lightroom AI Pipeline v1.0"

      crs:ProcessVersion="11.0"
      crs:WhiteBalance="Custom"

      crs:Exposure2012="{b['exposure']:.2f}"
      crs:Contrast2012="{int(b['contrast'])}"
      crs:Highlights2012="{int(b['highlights'])}"
      crs:Shadows2012="{int(b['shadows'])}"
      crs:Whites2012="{int(b['whites'])}"
      crs:Blacks2012="{int(b['blacks'])}"
      crs:Temperature="{int(b['temp'])}"
      crs:Tint="{int(b['tint'])}"
      crs:Vibrance="{int(b['vibrance'])}"
      crs:Saturation="{int(b['saturation'])}"

      crs:HasCrop="{has_crop}"
      crs:CropTop="{c['top']:.6f}"
      crs:CropLeft="{c['left']:.6f}"
      crs:CropBottom="{c['bottom']:.6f}"
      crs:CropRight="{c['right']:.6f}"
      crs:CropAngle="{c['angle']:.2f}"
      crs:CropConstrainToWarp="0"
    />
  </rdf:RDF>
</x:xmpmeta>"""
    return xmp


# ─────────────────────────────────────────────
#  AI CALL
# ─────────────────────────────────────────────

def call_vision_model(image_path: str, prompt: str) -> dict:
    """
    Send the image and prompt to the local Ollama vision model.
    Returns the raw parsed JSON dict from the model.
    Raises ValueError if the model returns unparseable output.
    """
    print(f"  Loading image: {image_path}")
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    system_prompt = build_system_prompt()

    print(f"  Calling model: {MODEL}")
    print(f"  Prompt: \"{prompt}\"")

    client = ollama.Client(host=OLLAMA_HOST)
    response = client.chat(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": prompt,
                "images": [image_bytes],
            }
        ],
        options={
            "temperature": TEMPERATURE,
            "num_predict": 512,   # JSON output won't be long — cap for speed
        },
        format="json",           # Ollama JSON mode — enforces valid JSON output
    )

    raw_text = response["message"]["content"].strip()
    print(f"\n  Raw model output:\n{raw_text}\n")

    # Strip markdown code fences if model ignores format=json instruction
    cleaned = re.sub(r"```(?:json)?|```", "", raw_text).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model returned invalid JSON: {e}\nRaw output:\n{raw_text}")


# ─────────────────────────────────────────────
#  MAIN PIPELINE
# ─────────────────────────────────────────────

def run_pipeline(image_path: str, prompt: str) -> str:
    """
    Full pipeline: image + prompt → validated params → .xmp file.
    Returns the path to the written XMP file.
    """
    # --- Validate image path ---
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    ext = os.path.splitext(image_path)[1].lower()
    supported = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp"}
    if ext not in supported:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {supported}")

    print("\n" + "="*55)
    print("  LIGHTROOM AI PIPELINE")
    print("="*55)

    # Step 1: Call the vision model
    print("\n[1/4] Calling vision model...")
    raw_params = call_vision_model(image_path, prompt)

    # Step 2: Validate and clamp all values
    print("[2/4] Validating parameters...")
    validated, warnings = validate_and_clamp(raw_params)

    if warnings:
        print(f"\n  ⚠  {len(warnings)} validation warning(s):")
        for w in warnings:
            print(f"     - {w}")
    else:
        print("  ✓  All parameters within valid ranges")

    # Step 3: Show final validated params
    print("\n[3/4] Final parameters:")
    print("  Basic:")
    for k, v in validated["basic"].items():
        print(f"    {k:12s} = {v}")
    print("  Crop:")
    for k, v in validated["crop"].items():
        print(f"    {k:12s} = {v}")

    # Step 4: Write XMP file
    print("\n[4/4] Writing XMP sidecar file...")
    xmp_content = params_to_xmp(validated, image_path, prompt)

    base = os.path.splitext(image_path)[0]
    xmp_path = base + ".xmp"

    with open(xmp_path, "w", encoding="utf-8") as f:
        f.write(xmp_content)

    print(f"\n  ✓  XMP written to: {xmp_path}")
    print("\n  Open Lightroom Classic and press Ctrl+S (or Cmd+S)")
    print("  on the photo to force a metadata read, or go to:")
    print("  Metadata → Read Metadata From Files")
    print("="*55 + "\n")

    return xmp_path


# ─────────────────────────────────────────────
#  ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        print("\nUsage: python lightroom_ai_pipeline.py <image_path> \"<prompt>\"")
        print("Example: python lightroom_ai_pipeline.py /Photos/IMG_1234.png \"warm moody portrait\"")
        sys.exit(1)

    image_path = sys.argv[1]
    prompt = " ".join(sys.argv[2:])

    try:
        xmp_path = run_pipeline(image_path, prompt)
    except FileNotFoundError as e:
        print(f"\nERROR: {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"\nERROR: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        raise