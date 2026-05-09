# AI Photo Editor

A Claude-powered photo editing assistant with a guided tutorial mode and full Lightroom-style editor.

## Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Python FastAPI + Pillow + numpy + rawpy
- **AI**: Anthropic Claude (claude-sonnet-4-20250514)

---

## Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Requires Python 3.10+. `rawpy` needs libraw — on macOS: `brew install libraw`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:3000

### API Key

Click **"Add API Key"** in the top-right of the chat interface and paste your `sk-ant-...` key.  
Stored only in `localStorage` — never sent to the backend.

---

## Supported Formats

JPEG, PNG, TIFF, DNG, CR2, CR3, NEF, ARW, ORF, RW2, RAF, PEF

---

## Workflow

1. Upload a photo + describe the look you want
2. Claude analyzes it and returns editing parameters
3. Before/After drag-split comparison
4. **Tutorial mode** — guided step-by-step walkthrough (one parameter at a time)
5. **Editor mode** — full Lightroom-style panel, export as PNG

### Editing Parameters

**Light**: Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Brightness  
**Color**: Temperature, Tint, Vibrance, Saturation  
**Detail**: Clarity, Texture, Dehaze  
**Effects**: Vignette, Grain, Fade  
**Crop**: Aspect ratio presets + rotation (±45°)
