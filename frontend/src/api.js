const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

// ─── Preview downscaling ─────────────────────────────────────────────────────
// Generates a downscaled JPEG b64 (max PREVIEW_MAX_PX on longest side) from a
// full-res b64. Used for all live-editing calls so the backend processes far
// fewer pixels, making slider updates feel instant.
const PREVIEW_MAX_PX = 1200

export function createPreviewB64(b64, maxPx = PREVIEW_MAX_PX) {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      // JPEG at 88% quality — good visual fidelity, ~3-5× smaller than PNG
      resolve(canvas.toDataURL('image/jpeg', 0.88).split(',')[1])
    }
    img.src = `data:image/jpeg;base64,${b64}`
  })
}

// signal is an optional AbortController signal — pass one to cancel stale requests
export async function processImage(imageB64, filename, params, signal) {
  const res = await fetch(`${BACKEND}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64: imageB64, filename, params }),
    signal,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    // FastAPI 422 returns {detail: [{loc, msg, type}]} — show the first message
    const msg = detail?.detail
      ? (Array.isArray(detail.detail)
          ? detail.detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
          : String(detail.detail))
      : `Backend error: ${res.status}`
    throw new Error(msg)
  }
  const data = await res.json()
  return data.result_b64
}

export async function processCrop(imageB64, filename, crop) {
  const res = await fetch(`${BACKEND}/process-crop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64: imageB64, filename, crop }),
  })
  if (!res.ok) throw new Error(`Backend error: ${res.status}`)
  const data = await res.json()
  return data.result_b64
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // Strip the data URL prefix
      const b64 = reader.result.split(',')[1]
      resolve(b64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const ACCEPTED_TYPES =
  '.jpg,.jpeg,.png,.tiff,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2,.raf,.pef'

export const DEFAULT_PARAMS = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, brightness: 0,
  temperature: 0, tint: 0, vibrance: 0, saturation: 0,
  clarity: 0, texture: 0, dehaze: 0,
  vignette: 0, grain: 0, fade: 0,
  // Per-channel brightness offsets
  r_offset: 0, g_offset: 0, b_offset: 0,
  // Film softness (Gaussian diffusion, 0–1.0)
  film_softness: 0,
  crop_ratio: null, crop_rotation: 0,
  // Interactive crop box (percentages). null = no interactive crop active.
  crop_x: null, crop_y: null, crop_w: null, crop_h: null,
}

export const PARAM_RANGES = {
  exposure:      { min: -5,   max: 5,   step: 0.1  },
  contrast:      { min: -100, max: 100, step: 1    },
  highlights:    { min: -100, max: 100, step: 1    },
  shadows:       { min: -100, max: 100, step: 1    },
  whites:        { min: -100, max: 100, step: 1    },
  blacks:        { min: -100, max: 100, step: 1    },
  brightness:    { min: -100, max: 100, step: 1    },
  temperature:   { min: -100, max: 100, step: 1    },
  tint:          { min: -100, max: 100, step: 1    },
  vibrance:      { min: -100, max: 100, step: 1    },
  saturation:    { min: -100, max: 100, step: 1    },
  clarity:       { min: -100, max: 100, step: 1    },
  texture:       { min: -100, max: 100, step: 1    },
  dehaze:        { min: -100, max: 100, step: 1    },
  vignette:      { min: -100, max: 100, step: 1    },
  grain:         { min: 0,    max: 100, step: 1    },
  fade:          { min: 0,    max: 100, step: 1    },
  r_offset:      { min: -50,  max: 50,  step: 1    },
  g_offset:      { min: -50,  max: 50,  step: 1    },
  b_offset:      { min: -50,  max: 50,  step: 1    },
  film_softness: { min: 0,    max: 1,   step: 0.05 },
  crop_rotation: { min: -45,  max: 45,  step: 0.5  },
}

export const PARAM_SECTIONS = {
  Light:   ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'brightness'],
  Color:   ['temperature', 'tint', 'vibrance', 'saturation', 'r_offset', 'g_offset', 'b_offset'],
  Detail:  ['clarity', 'texture', 'dehaze'],
  Effects: ['vignette', 'grain', 'fade', 'film_softness'],
}

export function paramLabel(key) {
  const labels = {
    exposure: 'Exposure', contrast: 'Contrast', highlights: 'Highlights',
    shadows: 'Shadows', whites: 'Whites', blacks: 'Blacks', brightness: 'Brightness',
    temperature: 'Temperature', tint: 'Tint', vibrance: 'Vibrance', saturation: 'Saturation',
    clarity: 'Clarity', texture: 'Texture', dehaze: 'Dehaze',
    vignette: 'Vignette', grain: 'Grain', fade: 'Fade',
    r_offset: 'Red Channel', g_offset: 'Green Channel', b_offset: 'Blue Channel',
    film_softness: 'Film Softness',
    crop_ratio: 'Aspect Ratio', crop_rotation: 'Rotation',
  }
  return labels[key] || key
}

// ─── Clamp helper — enforces valid ranges on every value Claude returns ───────
// Claude occasionally outputs values outside the declared ranges (e.g. -200 for
// temperature). This hard-clamps everything before it ever reaches the UI or backend.
export function clampParams(params) {
  if (!params || typeof params !== 'object') return {}
  const out = {}
  for (const [key, val] of Object.entries(params)) {
    const range = PARAM_RANGES[key]
    if (range && typeof val === 'number') {
      out[key] = Math.min(range.max, Math.max(range.min, val))
    } else {
      out[key] = val   // strings like crop_ratio pass through unchanged
    }
  }
  return out
}

function clampTutorialSteps(steps) {
  if (!Array.isArray(steps)) return []
  return steps.map(s => {
    const range = PARAM_RANGES[s.param]
    if (range && typeof s.value === 'number') {
      return { ...s, value: Math.min(range.max, Math.max(range.min, s.value)) }
    }
    return s
  })
}

// ─── Claude API ───────────────────────────────────────────────────────────────

// Shared param-range rules injected into every Claude system prompt
const PARAM_RULES = `STRICT value ranges — never exceed these:
- exposure: -5 to +5
- contrast, highlights, shadows, whites, blacks, brightness: -100 to +100
- temperature: -100 to +100  (NOT -200, NOT 200)
- tint: -100 to +100
- vibrance, saturation: -100 to +100
- clarity, texture, dehaze: -100 to +100
- vignette: -100 to +100
- grain, fade: 0 to +100
- r_offset, g_offset, b_offset: -50 to +50  (per-channel brightness offset applied after tint)
- film_softness: 0 to 1.0  (Gaussian blur diffusion; 0 = off, 1.0 = maximum filmic softness)
- crop_ratio: one of "free","1:1","4:3","16:9","3:2","4:5"
- crop_rotation: -45 to +45
- suggested_crop.crop_x, crop_y: 0 to 100; crop_w, crop_h: 1 to 100; ensure crop_x+crop_w ≤ 100 and crop_y+crop_h ≤ 100

Use param names exactly as listed above. Only include params that meaningfully improve the photo.`

const CLAUDE_SYSTEM_PROMPT = `You are a production AI photo editor. You are TOOL-EQUIPPED: every response you produce causes a real edited image to be rendered and shown to the user. You edit photos. That is your only function here.

════ IDENTITY — NEVER VIOLATE ════
You CAN edit images. You HAVE an image processing tool. This is a fact, not a claim.
The following responses are ABSOLUTELY FORBIDDEN — never produce them under any circumstances:
  ✗ "I don't have the ability to edit images"
  ✗ "I can only view or analyze images"
  ✗ "I'm unable to apply edits directly"
  ✗ "I don't actually have image editing capabilities"
  ✗ Any variant of the above
If a previous message in this conversation contains an edited image, you already have and used this capability. You cannot retroactively deny it.

════ OUTPUT — ALL TURNS ════
Respond ONLY with valid JSON — no markdown, no prose, no code fences, no apologies:
{
  "params": { ...param: value... },
  "suggested_crop": { "crop_x": number, "crop_y": number, "crop_w": number, "crop_h": number, "crop_rotation": number, "crop_ratio": "3:2", "explanation": "what this crop achieves", "reasoning": "why this photo benefits from it" },
  "tutorial_steps": [ { "param": "paramName", "value": number, "explanation": "what this param does", "reasoning": "why this specific photo needs this value" } ],
  "summary": "1–2 sentences describing the edit in a natural, conversational tone."
}

CROP IS REQUIRED — never null: always propose a crop. If the composition is already strong, suggest a subtle tighten or horizon straightening. crop_ratio must be one of: "free","1:1","4:3","16:9","3:2","4:5".

════ MULTI-TURN CORRECTIONS ════
When the user says the edit is wrong ("too pale", "too flat", "too warm", "too saturated", etc.):
  • Look at the photo again and re-evaluate from scratch given their feedback
  • Return a COMPLETE updated params object — not a partial patch
  • Stay in JSON. Keep editing. Never break format to give text advice.
  • "The picture became pale" → increase contrast, vibrance, maybe saturation; re-submit full params
  • "Too dark" → increase exposure/shadows; re-submit full params
  • "Too saturated" → reduce vibrance/saturation; re-submit full params

════ EDIT PHILOSOPHY ════
SUBTLETY IS THE DEFAULT — prefer natural, understated looks:
- contrast: typically ±10–25 (rarely above ±40 unless a flat RAW needs rescue)
- saturation/vibrance: typically ±8–20 (rarely above ±35)
- exposure: typically ±0.2–0.8
- clarity/texture: sparingly, ±5–20
- Avoid HDR or over-processed aesthetics unless the user explicitly asks for them

${PARAM_RULES}`

export async function askClaude(imageB64, userMessage, apiKey) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: CLAUDE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageB64,
            },
          },
          {
            type: 'text',
            text: userMessage,
          },
        ],
      },
    ],
  })

  const text = response.content[0].text
  let result
  try {
    result = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) result = JSON.parse(match[0])
    else throw new Error('Claude returned malformed JSON: ' + text.slice(0, 200))
  }

  // Hard-clamp all values to valid ranges — Claude sometimes exceeds them
  if (result.params) result.params = clampParams(result.params)
  if (result.tutorial_steps) result.tutorial_steps = clampTutorialSteps(result.tutorial_steps)
  return result
}

/**
 * askClaudeEditMultiturn — multi-turn photo editing call.
 *
 * apiHistory: [{role, content, attachImage?}]
 *   - The FIRST user entry should have attachImage:true (includes the image bytes)
 *   - Subsequent user entries are text-only refinements
 *   - Assistant entries are the raw JSON strings Claude previously returned
 *
 * Returns the parsed result object: { params, suggested_crop, tutorial_steps, summary }
 */
export async function askClaudeEditMultiturn(imageB64, apiHistory, apiKey) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  // Re-attach the image on EVERY user turn, not just the first.
  // This keeps Claude visually grounded across the whole conversation and prevents
  // the "I can't actually see the image" identity collapse that occurs when the model
  // loses visual context in later turns and falls back to base-model caveats.
  const messages = apiHistory.map(msg => {
    if (msg.role === 'user') {
      return {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } },
          { type: 'text', text: msg.content || 'Please edit this photo.' },
        ],
      }
    }
    return { role: msg.role, content: msg.content }
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: CLAUDE_SYSTEM_PROMPT,
    messages,
  })

  const text = response.content[0].text
  let result
  try {
    result = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      result = JSON.parse(match[0])
    } else {
      // Claude returned prose instead of JSON — detect the identity-collapse phrases
      // and give the user a specific, actionable error message.
      const lower = text.toLowerCase()
      const isIdentityCollapse =
        lower.includes("don't have the ability") ||
        lower.includes("unable to edit") ||
        lower.includes("cannot edit") ||
        lower.includes("can't edit") ||
        lower.includes("can only view") ||
        lower.includes("can only analyze") ||
        lower.includes("no image editing")
      if (isIdentityCollapse) {
        throw new Error(
          'The AI lost track of its role mid-conversation. Please click "Clear history" and start a new session — this is a known issue with long conversations.'
        )
      }
      throw new Error('Claude returned malformed JSON: ' + text.slice(0, 200))
    }
  }

  if (result.params) result.params = clampParams(result.params)
  if (result.tutorial_steps) result.tutorial_steps = clampTutorialSteps(result.tutorial_steps)
  return result
}

export async function askClaudeChat(messages, apiKey) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: 'You are a helpful photography assistant. Answer questions about photography, camera settings, composition, and photo editing techniques in a friendly, concise way.',
    messages,
  })

  return response.content[0].text
}

// ─── Backend persona endpoints ────────────────────────────────────────────────

/**
 * GET /personas — returns all 20 personas with public fields.
 * pillow_signature and system_prompt_fragment are server-side only.
 */
export async function fetchPersonas() {
  const res = await fetch(`${BACKEND}/personas`)
  if (!res.ok) throw new Error(`Failed to fetch personas: ${res.status}`)
  return res.json()  // list of public persona objects
}

/**
 * POST /personas/match — weighted Python keyword matching, no LLM.
 * Returns { matched_ids: string[] } — top 8 persona IDs by relevance.
 */
export async function matchPersonasBackend(imageAnalysis) {
  const res = await fetch(`${BACKEND}/personas/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject:         imageAnalysis?.subject || '',
      lighting:        imageAnalysis?.lighting || '',
      mood:            imageAnalysis?.mood || '',
      color_profile:   imageAnalysis?.color_profile || '',
      technical_notes: imageAnalysis?.technical_notes || '',
      keywords:        imageAnalysis?.keywords || [],
    }),
  })
  if (!res.ok) throw new Error(`Persona match failed: ${res.status}`)
  return res.json()  // { matched_ids: string[] }
}

/**
 * POST /edit/style — calls Claude on the backend with persona style directive,
 * applies Pillow transforms with pillow_signature constraints.
 *
 * Returns:
 *   result_b64      — base64 PNG of the styled image
 *   applied_params  — the clipped Pillow factors actually used
 *   tutorial_steps  — [{param, value, explanation, reasoning}]
 *   summary         — 1-2 sentence style description
 *   suggested_crop  — null or crop object
 */
export async function editWithPersonaStyle(personaId, imageB64, filename, imageAnalysis, apiKey) {
  const res = await fetch(`${BACKEND}/edit/style`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persona_id:     personaId,
      image_b64:      imageB64,
      filename,
      image_analysis: imageAnalysis || {},
      api_key:        apiKey,
    }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail?.detail || `Style edit failed: ${res.status}`)
  }
  return res.json()
}

// ─── analyzeImage — single Claude vision call for structured photo analysis ───
// Returns: { subject, lighting, mood, color_profile, technical_notes, keywords }
export async function analyzeImage(imageB64, apiKey) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `Analyze this photo and respond ONLY with valid JSON (no markdown, no code fences):
{
  "subject": "brief description of main subject(s)",
  "lighting": "lighting quality and direction",
  "mood": "emotional tone and atmosphere",
  "color_profile": "dominant colors and color relationships",
  "technical_notes": "any notable technical characteristics",
  "keywords": ["keyword1", "keyword2", ...]
}
Keywords should describe: scene type, mood, lighting conditions, subject matter, photographic qualities. Include 10–15 words total.`,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } },
          { type: 'text', text: 'Analyze this photo.' },
        ],
      },
    ],
  })

  const text = response.content[0].text
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Malformed analysis JSON from Claude')
  }
}

// ─── scorePersonas — client-side keyword matching to rank the 20 personas ────
// Returns the top 8 personas sorted by keyword overlap with imageAnalysis.
export function scorePersonas(imageAnalysis, photographers) {
  const fields = [
    imageAnalysis?.subject || '',
    imageAnalysis?.lighting || '',
    imageAnalysis?.mood || '',
    imageAnalysis?.color_profile || '',
    imageAnalysis?.technical_notes || '',
    ...(imageAnalysis?.keywords || []),
  ]
  const analysisText = fields.join(' ').toLowerCase()

  return photographers
    .map(p => ({
      ...p,
      score: p.keywords.reduce(
        (acc, kw) => acc + (analysisText.includes(kw.toLowerCase()) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

// ─── applyPersonaStyle — Claude call through a specific photographer's lens ──
// Returns same format as askClaude: { params, suggested_crop, tutorial_steps, summary }
export async function applyPersonaStyle(imageB64, userMessage, persona, imageAnalysis, apiKey) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const systemPrompt = `You are interpreting a photo through the visual style of ${persona.name}.

${persona.system_prompt_fragment}

Photo analysis context: ${JSON.stringify(imageAnalysis || {})}

Respond ONLY with valid JSON (no markdown, no code fences) in this exact format:
{
  "params": { ...param: value... },
  "suggested_crop": { "crop_x": number, "crop_y": number, "crop_w": number, "crop_h": number, "crop_rotation": number, "explanation": "...", "reasoning": "..." },
  "tutorial_steps": [ { "param": "paramName", "value": number, "explanation": "...", "reasoning": "..." } ],
  "summary": "1–2 sentences describing how this edit evokes ${persona.name}'s distinctive style."
}

"suggested_crop" uses percentage coordinates (0–100). Set to null if no crop meaningfully improves the photo.

${PARAM_RULES}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } },
          { type: 'text', text: userMessage || `Edit this photo in the style of ${persona.name}.` },
        ],
      },
    ],
  })

  const text = response.content[0].text
  let result
  try {
    result = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) result = JSON.parse(match[0])
    else throw new Error(`Malformed JSON from persona style call (${persona.name})`)
  }

  if (result.params) result.params = clampParams(result.params)
  if (result.tutorial_steps) result.tutorial_steps = clampTutorialSteps(result.tutorial_steps)
  return result
}

// ─── analyzeCustomStyle — synthesise a persona from 5–15 reference images ───
// Returns a plain-text style description string (not JSON).
export async function analyzeCustomStyle(referenceImagesB64, apiKey) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const imageContents = referenceImagesB64.slice(0, 15).map(b64 => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
  }))

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: 'You are a photography style analyst. Study these reference photos and describe the consistent visual style across them in 2–3 sentences for use as a photo editing style guide. Focus on: tonal qualities, color grading, contrast characteristics, mood, and any distinctive recurring visual treatment.',
    messages: [
      {
        role: 'user',
        content: [
          ...imageContents,
          { type: 'text', text: 'Describe the consistent visual style across these reference photos.' },
        ],
      },
    ],
  })

  return response.content[0].text
}
