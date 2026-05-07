"""
JSON to XMP Converter
=====================
Reads a Lightroom develop-parameter JSON file and writes a .xmp sidecar.
Extra or unknown keys in the JSON are silently ignored.

Usage:
    python json_to_xmp.py <params.json> [<image_path>]

    <params.json>   Path to the JSON file with develop parameters.
    <image_path>    Optional: path to the source image. If omitted, the XMP
                    is written next to the JSON file with the same base name.

Example:
    python json_to_xmp.py edits/IMG_1234_params.json /Photos/IMG_1234.png
"""

import sys
import os
import json
from datetime import datetime


# ─────────────────────────────────────────────
#  PARAMETER SCHEMA WITH VALID RANGES
# ─────────────────────────────────────────────

PARAM_SCHEMA = {
    # key: (min, max, default)
    "exposure":   (-5.0, 5.0,  0.0),
    "contrast":   (-100, 100,  0),
    "highlights": (-100, 100,  0),
    "shadows":    (-100, 100,  0),
    "whites":     (-100, 100,  0),
    "blacks":     (-100, 100,  0),
    "temp":       (-100, 100,  0),
    "tint":       (-150, 150,  0),
    "vibrance":   (-100, 100,  0),
    "saturation": (-100, 100,  0),
}

CROP_SCHEMA = {
    # key: (min, max, default)
    "angle":  (-45.0, 45.0, 0.0),
    "top":    (0.0,   1.0,  0.0),
    "left":   (0.0,   1.0,  0.0),
    "bottom": (0.0,   1.0,  1.0),
    "right":  (0.0,   1.0,  1.0),
}

VALID_ASPECT_RATIOS = [
    "original", "1:1", "4:3", "3:2", "16:9",
    "4:5", "5:7", "2:3", "3:4", "5:4", "7:5",
]


# ─────────────────────────────────────────────
#  VALIDATION & CLAMPING
# ─────────────────────────────────────────────

def clamp(value: float, mn: float, mx: float) -> float:
    return max(mn, min(mx, value))


def validate_and_clamp(raw: dict) -> tuple[dict, list[str]]:
    warnings = []
    result = {"basic": {}, "crop": {}}

    basic_raw = raw.get("basic", {})
    if not isinstance(basic_raw, dict):
        warnings.append("'basic' section missing or malformed — using all defaults")
        basic_raw = {}

    for key, (mn, mx, default) in PARAM_SCHEMA.items():
        raw_val = basic_raw.get(key)
        if raw_val is None:
            result["basic"][key] = default
            continue
        try:
            val = float(raw_val)
        except (TypeError, ValueError):
            warnings.append(f"basic.{key}: non-numeric '{raw_val}' — using default {default}")
            result["basic"][key] = default
            continue
        clamped = clamp(val, mn, mx)
        if clamped != val:
            warnings.append(f"basic.{key}: {val} out of [{mn}, {mx}] — clamped to {clamped}")
        result["basic"][key] = clamped

    crop_raw = raw.get("crop", {})
    if not isinstance(crop_raw, dict):
        warnings.append("'crop' section missing or malformed — using defaults")
        crop_raw = {}

    for key, (mn, mx, default) in CROP_SCHEMA.items():
        raw_val = crop_raw.get(key)
        if raw_val is None:
            result["crop"][key] = default
            continue
        try:
            val = float(raw_val)
        except (TypeError, ValueError):
            warnings.append(f"crop.{key}: non-numeric '{raw_val}' — using default {default}")
            result["crop"][key] = default
            continue
        clamped = clamp(val, mn, mx)
        if clamped != val:
            warnings.append(f"crop.{key}: {val} out of [{mn}, {mx}] — clamped to {clamped}")
        result["crop"][key] = clamped

    aspect = crop_raw.get("aspect_ratio", "original")
    if aspect not in VALID_ASPECT_RATIOS:
        warnings.append(f"crop.aspect_ratio: '{aspect}' not recognized — falling back to 'original'")
        aspect = "original"
    result["crop"]["aspect_ratio"] = aspect

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
    mapping = {
        "original": (0.0, 0.0),
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


def params_to_xmp(params: dict, source_label: str = "") -> str:
    b = params["basic"]
    c = params["crop"]
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    has_crop = "True" if (
        c["top"] != 0.0 or c["left"] != 0.0 or
        c["bottom"] != 1.0 or c["right"] != 1.0 or
        c["angle"] != 0.0
    ) else "False"

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by json_to_xmp.py -->
<!-- Source: {source_label} -->
<!-- Created: {now} -->
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      xmp:ModifyDate="{now}"
      xmp:CreatorTool="json_to_xmp.py"

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


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────

def convert(json_path: str, image_path: str | None = None) -> str:
    """
    Read a JSON parameter file and write an XMP sidecar.
    Returns the path to the written XMP file.
    """
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"JSON file not found: {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        try:
            raw = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in {json_path}: {e}")

    if not isinstance(raw, dict):
        raise ValueError("JSON root must be an object (dict)")

    validated, warnings = validate_and_clamp(raw)

    if warnings:
        print(f"  {len(warnings)} validation warning(s):")
        for w in warnings:
            print(f"    - {w}")

    # Determine output path
    if image_path:
        xmp_path = os.path.splitext(image_path)[0] + ".xmp"
        source_label = os.path.basename(image_path)
    else:
        xmp_path = os.path.splitext(json_path)[0] + ".xmp"
        source_label = os.path.basename(json_path)

    xmp_content = params_to_xmp(validated, source_label)

    with open(xmp_path, "w", encoding="utf-8") as f:
        f.write(xmp_content)

    return xmp_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    json_path = sys.argv[1]
    image_path = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        xmp_path = convert(json_path, image_path)
        print(f"XMP written to: {xmp_path}")
    except (FileNotFoundError, ValueError) as e:
        print(f"ERROR: {e}")
        sys.exit(1)