#!/usr/bin/env python3
"""
XMP Sidecar Generator
=====================
A desktop GUI application that generates Adobe Lightroom Classic–compatible
.xmp sidecar files from a photo file and a JSON develop-parameters file.

Dependencies:
    - Python 3.8+
    - tkinter (ships with Python on most platforms)
    - tkinterdnd2 (optional — enables drag-and-drop; install with `pip install tkinterdnd2`)

Usage:
    python xmp_sidecar_generator.py
"""

import json
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString

# ---------------------------------------------------------------------------
# Try to import tkinterdnd2 for drag-and-drop support.  If the package is not
# installed the app still works — the user just uses the file-picker buttons.
# ---------------------------------------------------------------------------
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD

    DND_AVAILABLE = True
except ImportError:
    DND_AVAILABLE = False


# ===========================================================================
# XMP Generation Logic
# ===========================================================================

# Namespaces required by an XMP sidecar that Lightroom Classic will recognise.
NS_X = "adobe:ns:meta/"
NS_RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
NS_CRS = "http://ns.adobe.com/camera-raw-settings/1.0/"

# Mapping from JSON field paths to CRS property *local names*.
# Each entry is (json_section, json_key, crs_local_name).
BASIC_FIELD_MAP = [
    ("basic", "exposure",   "Exposure2012"),
    ("basic", "contrast",   "Contrast2012"),
    ("basic", "highlights", "Highlights2012"),
    ("basic", "shadows",    "Shadows2012"),
    ("basic", "whites",     "Whites2012"),
    ("basic", "blacks",     "Blacks2012"),
    ("basic", "temp",       "Temperature"),
    ("basic", "tint",       "Tint"),
    ("basic", "vibrance",   "Vibrance"),
    ("basic", "saturation", "Saturation"),
]

CROP_FIELD_MAP = [
    ("crop", "angle",  "CropAngle"),
    ("crop", "top",    "CropTop"),
    ("crop", "left",   "CropLeft"),
    ("crop", "bottom", "CropBottom"),
    ("crop", "right",  "CropRight"),
]


def build_xmp(params: dict) -> str:
    """
    Build a complete XMP sidecar XML string from the supplied develop
    parameters dictionary.

    Parameters
    ----------
    params : dict
        Parsed JSON object with optional "basic" and "crop" sections.

    Returns
    -------
    str
        A pretty-printed XML string ready to be written to a .xmp file.
    """

    # --- Root element: x:xmpmeta ----------------------------------------
    xmpmeta = Element("x:xmpmeta")
    xmpmeta.set("xmlns:x", NS_X)

    # --- rdf:RDF wrapper -------------------------------------------------
    rdf = SubElement(xmpmeta, "rdf:RDF")
    rdf.set("xmlns:rdf", NS_RDF)

    # --- rdf:Description — holds all CRS attributes ----------------------
    desc = SubElement(rdf, "rdf:Description")
    desc.set("rdf:about", "")
    desc.set("xmlns:crs", NS_CRS)

    # -- Mandatory metadata properties ------------------------------------
    # ProcessVersion tells Lightroom which processing engine to use.
    desc.set("crs:ProcessVersion", "11.0")

    # -- Basic develop settings -------------------------------------------
    basic = params.get("basic", {})
    for _section, key, crs_name in BASIC_FIELD_MAP:
        if key in basic:
            # Exposure is a float; everything else is an integer in practice,
            # but we format floats as-is and ints without decimals.
            value = basic[key]
            if isinstance(value, float) and not value.is_integer():
                desc.set(f"crs:{crs_name}", f"{value:.2f}")
            else:
                desc.set(f"crs:{crs_name}", str(int(value) if isinstance(value, float) else value))

    # -- Crop settings ----------------------------------------------------
    crop = params.get("crop", {})
    if crop:
        for _section, key, crs_name in CROP_FIELD_MAP:
            if key in crop:
                value = crop[key]
                if isinstance(value, float):
                    desc.set(f"crs:{crs_name}", f"{value}")
                else:
                    desc.set(f"crs:{crs_name}", str(value))

        # If an aspect_ratio is provided, flag the image as cropped.
        if "aspect_ratio" in crop:
            desc.set("crs:CropConstrainToWarp", "1")
            desc.set("crs:HasCrop", "True")

        # CropUnit = 0 means normalised (0–1) coordinates.
        desc.set("crs:CropUnit", "0")

    # -- Serialise to a pretty-printed XML string -------------------------
    raw_xml = tostring(xmpmeta, encoding="unicode")
    pretty = parseString(raw_xml).toprettyxml(indent="  ", encoding=None)

    # xml.dom.minidom adds an <?xml …?> declaration; keep it — Lightroom
    # expects it but tolerates its absence too.
    return pretty


def generate_xmp_file(photo_path: str, json_path: str) -> str:
    """
    High-level helper: read the JSON file, build the XMP, write the sidecar.

    Parameters
    ----------
    photo_path : str
        Path to the photo file (used only to derive the output .xmp path).
    json_path : str
        Path to the JSON develop-parameters file.

    Returns
    -------
    str
        Absolute path of the written .xmp file.

    Raises
    ------
    FileNotFoundError
        If either input file does not exist.
    ValueError
        If the JSON is malformed or does not contain the expected structure.
    """

    photo = Path(photo_path)
    json_file = Path(json_path)

    # --- Validate inputs --------------------------------------------------
    if not photo.exists():
        raise FileNotFoundError(f"Photo file not found: {photo}")
    if photo.suffix.lower() not in (".jpg", ".jpeg", ".png"):
        raise ValueError(f"Unsupported photo format: {photo.suffix}")

    if not json_file.exists():
        raise FileNotFoundError(f"JSON file not found: {json_file}")

    # --- Parse the JSON ---------------------------------------------------
    with open(json_file, "r", encoding="utf-8") as fh:
        try:
            params = json.load(fh)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON: {exc}") from exc

    if not isinstance(params, dict):
        raise ValueError("JSON root must be an object with 'basic' and/or 'crop' keys.")

    # --- Build and write the XMP -----------------------------------------
    xmp_content = build_xmp(params)
    xmp_path = photo.with_suffix(".xmp")
    with open(xmp_path, "w", encoding="utf-8") as fh:
        fh.write(xmp_content)

    return str(xmp_path.resolve())


# ===========================================================================
# GUI Application
# ===========================================================================

class XmpGeneratorApp:
    """Tkinter GUI for the XMP sidecar generator."""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("XMP Sidecar Generator")
        self.root.resizable(False, False)
        self.root.configure(padx=20, pady=20)

        # Paths chosen by the user.
        self.photo_path = tk.StringVar()
        self.json_path = tk.StringVar()

        self._build_ui()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        """Lay out all widgets."""

        # --- Title / instructions ----------------------------------------
        title = tk.Label(
            self.root,
            text="XMP Sidecar Generator",
            font=("Helvetica", 16, "bold"),
        )
        title.grid(row=0, column=0, columnspan=3, pady=(0, 4))

        subtitle = tk.Label(
            self.root,
            text="Generate a Lightroom Classic .xmp sidecar from a photo and a JSON parameters file.",
            wraplength=480,
            justify="center",
        )
        subtitle.grid(row=1, column=0, columnspan=3, pady=(0, 16))

        # --- Photo input row ---------------------------------------------
        tk.Label(self.root, text="Photo file:", anchor="w").grid(
            row=2, column=0, sticky="w"
        )
        photo_entry = tk.Entry(
            self.root, textvariable=self.photo_path, width=50, state="readonly"
        )
        photo_entry.grid(row=2, column=1, padx=8)
        tk.Button(self.root, text="Browse…", command=self._pick_photo).grid(
            row=2, column=2
        )

        # --- JSON input row ----------------------------------------------
        tk.Label(self.root, text="JSON file:", anchor="w").grid(
            row=3, column=0, sticky="w", pady=(8, 0)
        )
        json_entry = tk.Entry(
            self.root, textvariable=self.json_path, width=50, state="readonly"
        )
        json_entry.grid(row=3, column=1, padx=8, pady=(8, 0))
        tk.Button(self.root, text="Browse…", command=self._pick_json).grid(
            row=3, column=2, pady=(8, 0)
        )

        # --- Generate button ---------------------------------------------
        gen_btn = tk.Button(
            self.root,
            text="Generate XMP",
            command=self._generate,
            bg="#2563eb",
            fg="white",
            font=("Helvetica", 12, "bold"),
            padx=16,
            pady=6,
        )
        gen_btn.grid(row=4, column=0, columnspan=3, pady=(20, 8))

        # --- Status label (shows output path or error) -------------------
        self.status_var = tk.StringVar(value="")
        self.status_label = tk.Label(
            self.root,
            textvariable=self.status_var,
            wraplength=480,
            justify="center",
            fg="#16a34a",
        )
        self.status_label.grid(row=5, column=0, columnspan=3, pady=(4, 0))

        # --- Drag-and-drop zones (only if tkinterdnd2 is available) ------
        if DND_AVAILABLE:
            dnd_frame = tk.LabelFrame(
                self.root, text="Drag & Drop", padx=10, pady=10
            )
            dnd_frame.grid(row=6, column=0, columnspan=3, pady=(16, 0), sticky="ew")

            # Photo drop target
            photo_drop = tk.Label(
                dnd_frame,
                text="Drop photo here\n(JPEG / PNG)",
                relief="groove",
                width=24,
                height=4,
                bg="#f0f4ff",
            )
            photo_drop.pack(side="left", expand=True, fill="both", padx=(0, 4))
            photo_drop.drop_target_register(DND_FILES)
            photo_drop.dnd_bind("<<Drop>>", self._on_drop_photo)

            # JSON drop target
            json_drop = tk.Label(
                dnd_frame,
                text="Drop JSON here",
                relief="groove",
                width=24,
                height=4,
                bg="#f0fff4",
            )
            json_drop.pack(side="right", expand=True, fill="both", padx=(4, 0))
            json_drop.drop_target_register(DND_FILES)
            json_drop.dnd_bind("<<Drop>>", self._on_drop_json)
        else:
            # Inform the user that drag-and-drop is unavailable.
            note = tk.Label(
                self.root,
                text="Tip: install tkinterdnd2 (`pip install tkinterdnd2`) to enable drag-and-drop.",
                fg="#6b7280",
                font=("Helvetica", 9),
                wraplength=480,
            )
            note.grid(row=6, column=0, columnspan=3, pady=(16, 0))

    # ------------------------------------------------------------------
    # File-picker callbacks
    # ------------------------------------------------------------------

    def _pick_photo(self):
        """Open a file dialog for selecting a JPEG or PNG photo."""
        path = filedialog.askopenfilename(
            title="Select a photo",
            filetypes=[
                ("Image files", "*.jpg *.jpeg *.png"),
                ("All files", "*.*"),
            ],
        )
        if path:
            self.photo_path.set(path)
            self._clear_status()

    def _pick_json(self):
        """Open a file dialog for selecting a JSON parameters file."""
        path = filedialog.askopenfilename(
            title="Select a JSON parameters file",
            filetypes=[
                ("JSON files", "*.json"),
                ("All files", "*.*"),
            ],
        )
        if path:
            self.json_path.set(path)
            self._clear_status()

    # ------------------------------------------------------------------
    # Drag-and-drop callbacks (only used when tkinterdnd2 is available)
    # ------------------------------------------------------------------

    def _clean_dropped_path(self, raw: str) -> str:
        """
        Normalise a path received from a DnD event.  On some platforms
        the path is wrapped in curly braces or contains extra whitespace.
        """
        path = raw.strip().strip("{}")
        return path

    def _on_drop_photo(self, event):
        """Handle a file dropped onto the photo zone."""
        path = self._clean_dropped_path(event.data)
        if path.lower().endswith((".jpg", ".jpeg", ".png")):
            self.photo_path.set(path)
            self._clear_status()
        else:
            self._show_error("Please drop a JPEG or PNG file.")

    def _on_drop_json(self, event):
        """Handle a file dropped onto the JSON zone."""
        path = self._clean_dropped_path(event.data)
        if path.lower().endswith(".json"):
            self.json_path.set(path)
            self._clear_status()
        else:
            self._show_error("Please drop a .json file.")

    # ------------------------------------------------------------------
    # Core action
    # ------------------------------------------------------------------

    def _generate(self):
        """Validate inputs and generate the XMP sidecar file."""
        photo = self.photo_path.get().strip()
        json_file = self.json_path.get().strip()

        # Basic validation before calling the generator.
        if not photo:
            self._show_error("Please select a photo file first.")
            return
        if not json_file:
            self._show_error("Please select a JSON parameters file first.")
            return

        try:
            output_path = generate_xmp_file(photo, json_file)
            self._show_success(f"XMP saved to:\n{output_path}")
        except (FileNotFoundError, ValueError, OSError) as exc:
            self._show_error(str(exc))

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------

    def _show_success(self, msg: str):
        self.status_label.configure(fg="#16a34a")
        self.status_var.set(msg)

    def _show_error(self, msg: str):
        self.status_label.configure(fg="#dc2626")
        self.status_var.set(msg)

    def _clear_status(self):
        self.status_var.set("")


# ===========================================================================
# Entry point
# ===========================================================================

def main():
    # Use TkinterDnD root if drag-and-drop support is available;
    # otherwise fall back to a standard Tk root.
    if DND_AVAILABLE:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()

    app = XmpGeneratorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
