---
name: lightroom-ai-edit
description: Analyzes a photo and a natural language creative prompt to generate Lightroom Classic develop parameters as a valid JSON object ready for XMP sidecar output. Use when the user uploads a photo (PNG or JPEG) and describes a desired editing style, mood, or look — such as "warm golden hour portrait", "moody cinematic grade", "lift shadows", or "crop to 4:5". Do NOT use for RAW file editing, HSL adjustments, tone curves, local masking, or sharpening and noise reduction (out of scope in v1.0).
license: MIT
metadata:
  author: Alfred
  version: 1.0.0
  category: photo-editing
---

# Lightroom AI Edit

A vision-to-parameter pipeline. Given a photo and a natural language prompt, analyze the image and output a single valid JSON object containing Lightroom Classic develop parameters ready to embed in an XMP sidecar file.

## Instructions

### Step 1: Receive and validate inputs

Two inputs are required:

- **Photo**: A PNG or JPEG image uploaded by the user.
- **Prompt**: A natural language description of the desired look (e.g. "warm golden hour portrait, lift face shadows, crop to 4:5").

If either input is missing, ask the user to provide it before proceeding.

### Step 2: Analyze the image

Before deciding on any parameter values, reason about the image content:

- **Exposure**: Is the image under- or overexposed? Where are the brightest and darkest regions?
- **Color cast**: Does the image lean warm or cool? Is there a noticeable tint?
- **Shadow distribution**: Are shadows deep and blocked, or already lifted?
- **Subject position**: Where is the main subject? Does the crop need to be adjusted to improve composition?
- **Contrast and tone**: How much dynamic range is present? Are highlights clipped?

Do not skip this step. Parameters must be derived from what is actually in the image, not inferred from the prompt alone.

### Step 3: Interpret the creative prompt

Map the user's intent to specific adjustments. For example:

- "Warm" → increase `temp`, possibly increase `vibrance`
- "Lift shadows" → raise `shadows`, optionally raise `blacks`
- "Moody" → lower `highlights`, deepen `blacks`, reduce `saturation`
- "Cinematic" → reduce `contrast`, lower `saturation`, adjust `tint`
- "Crop to 4:5" → set `aspect_ratio` to `"4:5"` and adjust `top`/`bottom` crop edges accordingly

### Step 4: Output the JSON

Output a single JSON object — no markdown, no explanation, no preamble. The object must contain exactly two sections: `crop` and `basic`.

```json
{
  "crop": {
    "angle": 0.0,
    "aspect_ratio": "4:5",
    "top": 0.05,
    "left": 0.0,
    "bottom": 0.95,
    "right": 1.0
  },
  "basic": {
    "exposure": 0.0,
    "contrast": 0,
    "highlights": -40,
    "shadows": 55,
    "whites": -10,
    "blacks": 10,
    "temp": 15,
    "tint": 5,
    "vibrance": 20,
    "saturation": -5
  }
}
```

## Parameter Ranges (PNG / JPEG in Lightroom Classic)

All values must stay within these bounds. Note that `temp` uses a -100 to 100 scale, not Kelvin.

| Parameter      | Min    | Max   | Notes                          |
|----------------|--------|-------|--------------------------------|
| exposure       | -5.0   | 5.0   | Overall brightness             |
| contrast       | -100   | 100   |                                |
| highlights     | -100   | 100   | Pull back bright areas         |
| shadows        | -100   | 100   | Lift shadow detail             |
| whites         | -100   | 100   | White point                    |
| blacks         | -100   | 100   | Black point                    |
| temp           | -100   | 100   | PNG/JPEG scale — not Kelvin    |
| tint           | -150   | 150   | Green ↔ Magenta                |
| vibrance       | -100   | 100   | Smart saturation               |
| saturation     | -100   | 100   | Global saturation              |
| crop angle     | -45.0  | 45.0  | Rotation in degrees            |
| crop edges     | 0.0    | 1.0   | Normalized — 0 = image edge    |

## Constraints

- Output must be **pure JSON only** — no markdown fences, no explanation, no extra text.
- All parameter values must stay within the ranges above.
- Crop edge values must be normalized (0.0 to 1.0), representing proportional position from the image edge.
- Image analysis must happen before values are committed.

## Out of Scope (v1.0)

The following are not supported in this version:

- HSL / per-channel color grading
- Local adjustments or masking (e.g. subject-specific shadow lifting)
- Tone curve manipulation
- Sharpening and noise reduction
- RAW file support (Kelvin temperature scale differs from PNG/JPEG)

## Examples

### Example 1: Warm portrait with shadow lift and crop

**User says**: "Warm golden hour portrait, lift face shadows, crop to 4:5"

**Actions**:
1. Analyze image — subject is slightly underlit in shadow areas, overall tone is neutral
2. Prompt maps to: increase `temp`, raise `shadows`, set crop to 4:5
3. Adjust `top`/`bottom` crop edges to center subject in 4:5 frame

**Output**: JSON with `temp: 15`, `shadows: 55`, `aspect_ratio: "4:5"`, adjusted crop edges

---

### Example 2: Moody cinematic grade

**User says**: "Dark and moody, desaturated, slightly cooler tone"

**Actions**:
1. Analyze image — highlights are already moderate, image has slight warm cast
2. Prompt maps to: lower `highlights`, deepen `blacks`, reduce `saturation`, shift `temp` negative
3. Keep crop at full frame unless composition clearly benefits from adjustment

**Output**: JSON with `highlights: -50`, `blacks: -30`, `saturation: -25`, `temp: -10`

---

## Troubleshooting

**Issue**: User uploads a RAW file  
**Response**: Explain that RAW files use a Kelvin-based temperature scale that differs from the PNG/JPEG pipeline. Ask the user to export a JPEG preview from Lightroom and resubmit.

**Issue**: Prompt is very vague (e.g. "make it look good")  
**Response**: Ask one clarifying question — e.g. "Any particular mood or style in mind — warm, cool, moody, clean?" — then proceed once answered.

**Issue**: Requested adjustment (e.g. "add vignette" or "sharpen") is out of scope  
**Response**: Note that the feature is not supported in v1.0 and output the JSON for the supported parameters only.
