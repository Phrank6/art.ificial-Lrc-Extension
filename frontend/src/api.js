const BACKEND = 'http://localhost:8000'

export async function processImage(imageB64, filename, params) {
  const res = await fetch(`${BACKEND}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64: imageB64, filename, params }),
  })
  if (!res.ok) throw new Error(`Backend error: ${res.status}`)
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
  crop_ratio: null, crop_rotation: 0,
}

export const PARAM_RANGES = {
  exposure:    { min: -5,   max: 5,   step: 0.1 },
  contrast:    { min: -100, max: 100, step: 1 },
  highlights:  { min: -100, max: 100, step: 1 },
  shadows:     { min: -100, max: 100, step: 1 },
  whites:      { min: -100, max: 100, step: 1 },
  blacks:      { min: -100, max: 100, step: 1 },
  brightness:  { min: -100, max: 100, step: 1 },
  temperature: { min: -100, max: 100, step: 1 },
  tint:        { min: -100, max: 100, step: 1 },
  vibrance:    { min: -100, max: 100, step: 1 },
  saturation:  { min: -100, max: 100, step: 1 },
  clarity:     { min: -100, max: 100, step: 1 },
  texture:     { min: -100, max: 100, step: 1 },
  dehaze:      { min: -100, max: 100, step: 1 },
  vignette:    { min: -100, max: 100, step: 1 },
  grain:       { min: 0,    max: 100, step: 1 },
  fade:        { min: 0,    max: 100, step: 1 },
  crop_rotation: { min: -45, max: 45, step: 0.5 },
}

export const PARAM_SECTIONS = {
  Light:   ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'brightness'],
  Color:   ['temperature', 'tint', 'vibrance', 'saturation'],
  Detail:  ['clarity', 'texture', 'dehaze'],
  Effects: ['vignette', 'grain', 'fade'],
}

export function paramLabel(key) {
  const labels = {
    exposure: 'Exposure', contrast: 'Contrast', highlights: 'Highlights',
    shadows: 'Shadows', whites: 'Whites', blacks: 'Blacks', brightness: 'Brightness',
    temperature: 'Temperature', tint: 'Tint', vibrance: 'Vibrance', saturation: 'Saturation',
    clarity: 'Clarity', texture: 'Texture', dehaze: 'Dehaze',
    vignette: 'Vignette', grain: 'Grain', fade: 'Fade',
    crop_ratio: 'Aspect Ratio', crop_rotation: 'Rotation',
  }
  return labels[key] || key
}

// Claude API
const CLAUDE_SYSTEM_PROMPT = `You are a professional photo editor and photography teacher. When given a photo and an editing request, respond ONLY with valid JSON (no markdown, no prose) in this format: { "params": { ...lightroom-style param name: value pairs... }, "tutorial_steps": [ { "param": "paramName", "value": number, "explanation": "what this param does", "reasoning": "why this specific photo needs this adjustment" } ], "summary": "..." }. Use param names exactly as: exposure, contrast, highlights, shadows, whites, blacks, brightness, temperature, tint, vibrance, saturation, clarity, texture, dehaze, vignette, grain, fade, crop_ratio, crop_rotation. All values must be within their valid ranges. Only include params that meaningfully improve the photo.`

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
  try {
    return JSON.parse(text)
  } catch {
    // Try extracting JSON block if wrapped in backticks
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Claude returned malformed JSON: ' + text.slice(0, 200))
  }
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
