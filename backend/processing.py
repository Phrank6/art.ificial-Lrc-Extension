import io
import math
import numpy as np
import rawpy
from PIL import Image, ImageEnhance, ImageFilter
from dataclasses import dataclass, field
from typing import Optional


# ─── Image Ingestion ──────────────────────────────────────────────────────────

RAW_EXTENSIONS = {"dng", "cr2", "cr3", "nef", "arw", "orf", "rw2", "raf", "pef"}


def load_image(file_bytes: bytes, filename: str) -> Image.Image:
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext in RAW_EXTENSIONS:
        with rawpy.imread(io.BytesIO(file_bytes)) as raw:
            rgb_array = raw.postprocess(use_camera_wb=True, output_bps=8)
        return Image.fromarray(rgb_array)
    else:
        return Image.open(io.BytesIO(file_bytes)).convert("RGB")


# ─── Parameter Definitions ────────────────────────────────────────────────────

@dataclass
class EditParams:
    # Light
    exposure: float = 0.0       # -5 to +5
    contrast: float = 0.0       # -100 to +100
    highlights: float = 0.0     # -100 to +100
    shadows: float = 0.0        # -100 to +100
    whites: float = 0.0         # -100 to +100
    blacks: float = 0.0         # -100 to +100
    brightness: float = 0.0     # -100 to +100
    # Color
    temperature: float = 0.0    # -100 to +100
    tint: float = 0.0           # -100 to +100
    vibrance: float = 0.0       # -100 to +100
    saturation: float = 0.0     # -100 to +100
    # Detail
    clarity: float = 0.0        # -100 to +100
    texture: float = 0.0        # -100 to +100
    dehaze: float = 0.0         # -100 to +100
    # Effects
    vignette: float = 0.0       # -100 to +100
    grain: float = 0.0          # 0 to 100
    fade: float = 0.0           # 0 to 100
    # Per-channel brightness offsets (applied after tint)
    r_offset: float = 0.0       # -50 to +50
    g_offset: float = 0.0       # -50 to +50
    b_offset: float = 0.0       # -50 to +50
    # Film softness — Gaussian blur at low radius (0–1.0 maps to radius 0.3–0.8)
    film_softness: float = 0.0  # 0 to 1.0
    # Crop — two modes (interactive coords take priority over ratio preset)
    crop_ratio: Optional[str] = None    # "free","1:1","4:3","16:9","3:2","4:5"
    crop_rotation: float = 0.0          # -45 to +45
    # Interactive crop box — percentages (0-100) of image dimensions
    crop_x: Optional[float] = None      # left edge %
    crop_y: Optional[float] = None      # top edge %
    crop_w: Optional[float] = None      # width %
    crop_h: Optional[float] = None      # height %


@dataclass
class CropParams:
    ratio: Optional[str] = None
    rotation: float = 0.0


# ─── Individual Processing Functions ─────────────────────────────────────────

def apply_exposure(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32)
    arr = arr * (2.0 ** value)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_contrast(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    factor = 1.0 + value / 100.0
    enhancer = ImageEnhance.Contrast(img)
    return enhancer.enhance(max(0.0, factor))


def apply_highlights(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32) / 255.0
    # Create a highlight mask (bright regions)
    luma = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    mask = np.clip((luma - 0.5) * 2.0, 0, 1) ** 2
    mask = mask[:, :, np.newaxis]
    adjustment = value / 100.0 * 0.5
    arr = arr + mask * adjustment * (1.0 - arr)  # expand toward white when positive
    if value < 0:
        arr = arr + mask * (value / 100.0) * arr  # compress toward black when negative
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_shadows(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32) / 255.0
    luma = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    mask = np.clip((0.5 - luma) * 2.0, 0, 1) ** 2
    mask = mask[:, :, np.newaxis]
    adjustment = value / 100.0 * 0.5
    if value > 0:
        arr = arr + mask * adjustment * (1.0 - arr)  # lift shadows
    else:
        arr = arr + mask * adjustment * arr  # crush shadows
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_whites(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32)
    # Shift the white point
    shift = value / 100.0 * 30.0
    arr = arr + shift
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_blacks(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32)
    # Shift the black point
    shift = value / 100.0 * 30.0
    arr = arr + shift
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_brightness(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    shift = value / 100.0 * 80.0
    arr = np.array(img, dtype=np.float32)
    arr = arr + shift
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_temperature(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32)
    shift = value / 100.0 * 30.0
    arr[:, :, 0] = np.clip(arr[:, :, 0] + shift, 0, 255)   # red channel
    arr[:, :, 2] = np.clip(arr[:, :, 2] - shift, 0, 255)   # blue channel
    return Image.fromarray(arr.astype(np.uint8))


def apply_tint(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32)
    shift = value / 100.0 * 20.0
    # Tint: positive = magenta (boost red+blue, reduce green), negative = green
    arr[:, :, 1] = np.clip(arr[:, :, 1] - shift, 0, 255)   # green channel inverse
    arr[:, :, 0] = np.clip(arr[:, :, 0] + shift * 0.5, 0, 255)
    arr[:, :, 2] = np.clip(arr[:, :, 2] + shift * 0.5, 0, 255)
    return Image.fromarray(arr.astype(np.uint8))


def apply_saturation(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    factor = 1.0 + value / 100.0
    enhancer = ImageEnhance.Color(img)
    return enhancer.enhance(max(0.0, factor))


def apply_vibrance(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32) / 255.0
    # Vibrance: boost less-saturated colors more
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    saturation = np.where(cmax > 0, (cmax - cmin) / cmax, 0)
    # Pixels with lower saturation get a bigger boost
    boost = (1.0 - saturation) * (value / 100.0)
    factor = 1.0 + boost
    factor = factor[:, :, np.newaxis]
    # Saturate around the mean
    luma = (0.299 * r + 0.587 * g + 0.114 * b)[:, :, np.newaxis]
    arr = luma + (arr - luma) * factor
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_clarity(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    # Clarity = local contrast via unsharp mask on midtones
    strength = abs(value) / 100.0
    blurred = img.filter(ImageFilter.GaussianBlur(radius=10))
    arr = np.array(img, dtype=np.float32)
    blur_arr = np.array(blurred, dtype=np.float32)
    detail = arr - blur_arr
    # Weight by midtone mask
    luma = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]) / 255.0
    midtone_mask = 1.0 - np.abs(2.0 * luma - 1.0) ** 2
    midtone_mask = midtone_mask[:, :, np.newaxis]
    sign = 1 if value > 0 else -1
    result = arr + sign * detail * midtone_mask * strength * 1.5
    result = np.clip(result, 0, 255).astype(np.uint8)
    return Image.fromarray(result)


def apply_texture(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    strength = abs(value) / 100.0
    # Fine-detail sharpening via unsharp mask with small radius
    blurred = img.filter(ImageFilter.GaussianBlur(radius=2))
    arr = np.array(img, dtype=np.float32)
    blur_arr = np.array(blurred, dtype=np.float32)
    detail = arr - blur_arr
    sign = 1 if value > 0 else -1
    result = arr + sign * detail * strength * 2.0
    result = np.clip(result, 0, 255).astype(np.uint8)
    return Image.fromarray(result)


def apply_dehaze(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    # Dehaze: increase contrast + saturation for hazy/foggy images
    strength = value / 100.0
    arr = np.array(img, dtype=np.float32)
    if value > 0:
        # Boost contrast and saturation
        mean = arr.mean()
        arr = mean + (arr - mean) * (1.0 + strength * 0.8)
    else:
        mean = arr.mean()
        arr = mean + (arr - mean) * (1.0 + strength * 0.5)  # strength is negative
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img2 = Image.fromarray(arr)
    # Also apply a saturation boost proportional to dehaze
    factor = 1.0 + strength * 0.5
    return ImageEnhance.Color(img2).enhance(max(0.1, factor))


def apply_vignette(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32)
    h, w = arr.shape[:2]
    # Radial gradient mask
    Y, X = np.mgrid[0:h, 0:w]
    cx, cy = w / 2.0, h / 2.0
    dist = np.sqrt(((X - cx) / (w / 2.0)) ** 2 + ((Y - cy) / (h / 2.0)) ** 2)
    # Smooth vignette falloff
    vignette_mask = np.clip(1.0 - dist * 0.7, 0, 1)
    vignette_mask = vignette_mask[:, :, np.newaxis]
    strength = value / 100.0
    if value < 0:
        # Darken edges
        arr = arr * (1.0 + strength * (1.0 - vignette_mask))
    else:
        # Lighten edges (positive vignette)
        arr = arr + strength * 255.0 * (1.0 - vignette_mask)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_grain(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32)
    strength = value / 100.0 * 25.0
    noise = np.random.normal(0, strength, arr.shape).astype(np.float32)
    arr = arr + noise
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_channel_offsets(img: Image.Image, r: float, g: float, b: float) -> Image.Image:
    """Per-channel brightness offset (additive). Handles RGB and RGBA — alpha preserved."""
    if r == 0 and g == 0 and b == 0:
        return img
    original_mode = img.mode
    arr = np.array(img.convert("RGB"), dtype=np.float32)
    arr[:, :, 0] = np.clip(arr[:, :, 0] + r, 0, 255)
    arr[:, :, 1] = np.clip(arr[:, :, 1] + g, 0, 255)
    arr[:, :, 2] = np.clip(arr[:, :, 2] + b, 0, 255)
    result = Image.fromarray(arr.astype(np.uint8), "RGB")
    if original_mode == "RGBA":
        result = result.convert("RGBA")
        result.putalpha(img.getchannel("A"))
    return result


# ─── Persona-style Pillow transforms ─────────────────────────────────────────
# Separate from the additive pipeline above; uses ImageEnhance multipliers
# as defined in each persona's pillow_signature.

def apply_grain_noise(img: Image.Image, opacity: float) -> Image.Image:
    """Blend a Gaussian noise layer at *opacity*. Handles RGB and RGBA."""
    if opacity <= 0.0:
        return img
    original_mode = img.mode
    rgb = img.convert("RGB")
    arr = np.array(rgb, dtype=np.float32)
    noise = np.random.normal(0, 25.0, arr.shape).astype(np.float32)
    blended = np.clip(arr + noise * opacity * 4.0, 0, 255).astype(np.uint8)
    result = Image.fromarray(blended, "RGB")
    if original_mode == "RGBA":
        result = result.convert("RGBA")
        result.putalpha(img.getchannel("A"))
    return result


def apply_color_shift_persona(img: Image.Image, r: int, g: int, b: int) -> Image.Image:
    """Fixed per-channel brightness offset from pillow_signature.color_shift.
    Handles both RGB and RGBA — alpha channel is preserved unchanged."""
    if r == 0 and g == 0 and b == 0:
        return img
    original_mode = img.mode
    arr = np.array(img.convert("RGB"), dtype=np.float32)
    arr[:, :, 0] = np.clip(arr[:, :, 0] + r, 0, 255)
    arr[:, :, 1] = np.clip(arr[:, :, 1] + g, 0, 255)
    arr[:, :, 2] = np.clip(arr[:, :, 2] + b, 0, 255)
    result = Image.fromarray(arr.astype(np.uint8), "RGB")
    if original_mode == "RGBA":
        result = result.convert("RGBA")
        result.putalpha(img.getchannel("A"))
    return result


def apply_persona_transforms(
    img: Image.Image,
    pillow_signature: dict,
    claude_params: dict,
) -> Image.Image:
    """Apply persona-constrained Pillow transforms.

    claude_params values are clipped to the persona's pillow_signature ranges
    before application — values outside bounds are silently clamped.

    Order: Contrast → Brightness → Color → Sharpness → Grain → ColorShift.

    Args:
        img: Source PIL image (RGB or RGBA).
        pillow_signature: The ``pillow_signature`` dict from the persona JSON.
        claude_params: Dict returned by Claude; may be flat or nested under
            a ``"pillow"`` key.  Expected keys: contrast, brightness, color,
            sharpness, grain_opacity.
    """
    sig = pillow_signature

    def _clip(value: float, range_pair: list) -> float:
        lo, hi = range_pair
        return max(float(lo), min(float(hi), float(value)))

    def _mid(range_pair: list) -> float:
        return (range_pair[0] + range_pair[1]) / 2.0

    # Claude may nest Pillow params under a "pillow" key
    p = claude_params.get("pillow", claude_params)

    contrast      = _clip(p.get("contrast",      _mid(sig["contrast_range"])),      sig["contrast_range"])
    brightness    = _clip(p.get("brightness",    _mid(sig["brightness_range"])),    sig["brightness_range"])
    color         = _clip(p.get("color",         _mid(sig["color_range"])),          sig["color_range"])
    sharpness     = _clip(p.get("sharpness",     _mid(sig["sharpness_range"])),      sig["sharpness_range"])
    grain_opacity = _clip(p.get("grain_opacity", _mid(sig["grain_opacity_range"])), sig["grain_opacity_range"])

    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Brightness(img).enhance(brightness)
    img = ImageEnhance.Color(img).enhance(color)
    img = ImageEnhance.Sharpness(img).enhance(sharpness)

    if grain_opacity > 0.005:
        img = apply_grain_noise(img, grain_opacity)

    shift = sig.get("color_shift", {"r": 0, "g": 0, "b": 0})
    r_s = shift.get("r", 0)
    g_s = shift.get("g", 0)
    b_s = shift.get("b", 0)
    if r_s or g_s or b_s:
        img = apply_color_shift_persona(img, r_s, g_s, b_s)

    return img


def apply_film_softness(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    # Map 0–1.0 → radius 0.3–0.8 (subtle, filmic diffusion)
    radius = 0.3 + value * 0.5
    return img.filter(ImageFilter.GaussianBlur(radius=radius))


def apply_fade(img: Image.Image, value: float) -> Image.Image:
    if value == 0:
        return img
    arr = np.array(img, dtype=np.float32)
    # Lift blacks — compress the tonal range upward
    lift = value / 100.0 * 60.0
    arr = lift + arr * (1.0 - lift / 255.0)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


RATIO_MAP = {
    "1:1": (1, 1),
    "4:3": (4, 3),
    "16:9": (16, 9),
    "3:2": (3, 2),
    "4:5": (4, 5),
}


def apply_crop(img: Image.Image, ratio: Optional[str], rotation: float,
               crop_x: Optional[float] = None, crop_y: Optional[float] = None,
               crop_w: Optional[float] = None, crop_h: Optional[float] = None) -> Image.Image:

    # 1. Rotation first (expand canvas so corners aren't clipped)
    if rotation != 0:
        img = img.rotate(-rotation, expand=True, resample=Image.BICUBIC)

    w, h = img.size

    # 2a. Interactive crop box (takes priority) — percentages → pixels
    if crop_x is not None and crop_y is not None and crop_w is not None and crop_h is not None:
        left   = max(0, int(crop_x / 100 * w))
        top    = max(0, int(crop_y / 100 * h))
        right  = min(w, int((crop_x + crop_w) / 100 * w))
        bottom = min(h, int((crop_y + crop_h) / 100 * h))
        if right > left and bottom > top:
            return img.crop((left, top, right, bottom))
        return img

    # 2b. Ratio preset (centered crop)
    if not ratio or ratio == "free":
        return img
    if ratio not in RATIO_MAP:
        return img

    target_w, target_h = RATIO_MAP[ratio]
    target_aspect = target_w / target_h
    current_aspect = w / h

    if current_aspect > target_aspect:
        new_w = int(h * target_aspect)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:
        new_h = int(w / target_aspect)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))

    return img


# ─── Full Pipeline ────────────────────────────────────────────────────────────

def process_image(img: Image.Image, params: EditParams) -> Image.Image:
    """Apply all editing parameters in a fixed, sensible order."""
    img = apply_exposure(img, params.exposure)
    img = apply_contrast(img, params.contrast)
    img = apply_highlights(img, params.highlights)
    img = apply_shadows(img, params.shadows)
    img = apply_whites(img, params.whites)
    img = apply_blacks(img, params.blacks)
    img = apply_brightness(img, params.brightness)
    img = apply_temperature(img, params.temperature)
    img = apply_tint(img, params.tint)
    img = apply_channel_offsets(img, params.r_offset, params.g_offset, params.b_offset)
    img = apply_film_softness(img, params.film_softness)
    img = apply_saturation(img, params.saturation)
    img = apply_vibrance(img, params.vibrance)
    img = apply_clarity(img, params.clarity)
    img = apply_texture(img, params.texture)
    img = apply_dehaze(img, params.dehaze)
    img = apply_crop(img, params.crop_ratio, params.crop_rotation,
                     params.crop_x, params.crop_y, params.crop_w, params.crop_h)
    img = apply_vignette(img, params.vignette)
    img = apply_grain(img, params.grain)
    img = apply_fade(img, params.fade)
    return img


def image_to_base64(img: Image.Image) -> str:
    import base64
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")
