# Auto-Apply XMP from Folder

A small Lightroom Classic plug-in (Lua, SDK 6+) that scans a folder, pairs each
image with its `.xmp` sidecar, and applies the develop settings from the sidecar
to the photo in your catalog — no manual *Read Metadata from File* required.

## What it does

1. Adds two menu entries (same action, two locations for convenience):
   - **Library > Plug-in Extras > Auto-Apply XMP from Folder...**
   - **File > Plug-in Extras > Auto-Apply XMP from Folder...**
2. Prompts you to pick a folder.
3. Scans the folder for `.jpg` / `.jpeg` / `.png` / `.tif` / `.tiff` files.
4. For each image where a sidecar with the same base name exists
   (`photo001.jpg` ↔ `photo001.xmp`):
   - Adds the photo to the active catalog if it isn't there yet.
   - Parses the XMP for the supported `crs:*` develop parameters.
   - Calls `photo:applyDevelopSettings(...)` so the look is applied immediately.
5. Shows a progress dialog while it runs and a summary dialog at the end
   (with the first 20 errors inline if anything went wrong).

## Supported XMP develop parameters

Both attribute form (`crs:Key="value"`) and element form
(`<crs:Key>value</crs:Key>`) are recognised.

```
Exposure2012   Contrast2012   Highlights2012   Shadows2012
Whites2012     Blacks2012     Temperature      Tint
Vibrance       Saturation     CropTop          CropLeft
CropBottom     CropRight      CropAngle
```

`HasCrop` is set automatically when any crop value is present (or honoured
explicitly if the XMP includes `crs:HasCrop`).

Any other XMP attributes are ignored — they will not overwrite existing
settings on the photo.

## Files

```
AutoApplyXMP.lrplugin/
├── Info.lua        # Plug-in manifest (SDK version, identifier, menu items)
├── Main.lua        # Entry point: folder picker, scanner, progress, summary
└── XmpParser.lua   # Minimal sidecar parser (no external XML dependency)
README.md
```

## Installation

1. Copy the entire `AutoApplyXMP.lrplugin` folder anywhere on your system
   (a stable location is best — e.g. `~/Library/Application Support/Adobe/Lightroom/Modules/`
   on macOS, or `%APPDATA%\Adobe\Lightroom\Modules\` on Windows).
2. In Lightroom Classic: **File > Plug-in Manager...**
3. Click **Add** and select the `AutoApplyXMP.lrplugin` folder.
4. Confirm the plug-in shows status **Installed and running**.

> **Note:** On macOS the `.lrplugin` folder is treated as a bundle. You can
> either keep it as a folder or rename it once you're sure it ends in
> `.lrplugin` — Lightroom will accept either.

## Usage

1. Make sure your image files and `.xmp` sidecars share the same base name and
   sit in the same folder, for example:
   ```
   /Photos/Shoot/photo001.jpg
   /Photos/Shoot/photo001.xmp
   /Photos/Shoot/photo002.tif
   /Photos/Shoot/photo002.xmp
   ```
2. Run **Library > Plug-in Extras > Auto-Apply XMP from Folder...**
3. Select the folder.
4. Wait for the progress dialog to finish. Switch to the Library or Develop
   module — the adjustments are already on the photos.

## Error handling

The plug-in handles several failure modes gracefully and continues processing
the remaining files:

- **Missing XMP** — the image is counted under *Skipped (no matching XMP)*.
- **Malformed XMP** — file unreadable, not actually an XMP packet, or no
  recognised `crs:*` keys; counted under *Malformed XMP files*.
- **Already in catalog** — the photo is reused; no duplicate import.
- **Write-access conflicts** — surfaced under *Write-access conflicts* in the
  summary; the plug-in uses a 30-second timeout per write transaction.
- **Unexpected errors** — caught at the top level, surfaced in a dialog, and
  written to the plug-in log (see below).

## Logs

Trace output is written through the Lightroom logger to:

- macOS: `~/Documents/LrClassicLogs/AutoApplyXMP.log`
- Windows: `Documents\LrClassicLogs\AutoApplyXMP.log`

If you ever see "... and N more (see plug-in log)" in the summary dialog, the
full list is in that file.

## Caveats

- `LrFileUtils.files` is non-recursive. If you need to walk subfolders, swap
  the call in `findImagesInFolder` for `LrFileUtils.recursiveFiles`.
- `catalog:addPhoto({ path = ... })` will fail for file types Lightroom can't
  catalog directly (e.g. some PNG variants). Such files appear in the error
  list and are otherwise skipped.
- Applying develop settings to a JPEG/TIFF works, but Lightroom's results may
  differ from a RAW because some `crs:*` parameters are RAW-only.
