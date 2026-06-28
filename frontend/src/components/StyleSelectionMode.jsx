/**
 * StyleSelectionMode — orchestrates the style-selection flow.
 *
 * Flow
 * ----
 * 1. On mount: call GET /personas + POST /personas/match in parallel
 *    → build the 8-persona list for the grid (no image processing yet)
 * 2. User clicks a card → POST /edit/style for THAT persona only
 *    → show loading state on the card, then open preview modal
 * 3. User confirms ("Start Tutorial") → onSelectStyle(session)
 *
 * The custom "Learn from my photos" slot is wired for file upload;
 * full custom-style generation is a follow-on feature.
 */

import { useState, useEffect } from 'react'
import {
  fetchPersonas,
  matchPersonasBackend,
  editWithPersonaStyle,
  analyzeCustomStyle,
  createPreviewB64,
  fileToBase64,
} from '../api'
import { PHOTOGRAPHERS } from '../data/photographers'
import PersonaGrid from './PersonaGrid'

// Fallback accent colours for the preview modal header border
const ACCENT = Object.fromEntries(PHOTOGRAPHERS.map(p => [p.id, p.accentColor]))

// Synthetic persona object for the AI-suggested edit slot (slot 9)
const AI_PERSONA_ID = '__ai_edit__'

export default function StyleSelectionMode({
  imageB64,       // full-res, for export
  previewB64,     // downscaled 1200px, used for all API/backend calls
  filename,
  imageAnalysis,  // { subject, lighting, mood, color_profile, technical_notes, keywords }
  apiKey,
  mode,           // 'tutorial' (default) | 'apply' — controls CTA label
  aiEditedB64,    // base64 PNG of the AI edit from the chat session (9th slot)
  aiClaudeResult, // { params, tutorial_steps, summary, suggested_crop } from chat session
  onSelectStyle,  // (session) → void
  onBack,
}) {
  const isApplyMode = mode === 'apply'

  // Synthetic "persona" for the AI edit slot
  const aiPersona = aiEditedB64 ? {
    id:             AI_PERSONA_ID,
    name:           'Learn from AI',
    era:            'Your Photo',
    mood_descriptor: aiClaudeResult?.summary || 'Personalised edit tuned specifically for your photo.',
    accentColor:    '#8b5cf6',
    keywords:       { mood: ['ai', 'personalised'] },
  } : null

  // ── State ─────────────────────────────────────────────────────────────────
  const [allPersonas,    setAllPersonas]    = useState([])      // from GET /personas
  const [matchedIds,     setMatchedIds]     = useState([])      // top-8 IDs from POST /personas/match
  const [loadingMatch,   setLoadingMatch]   = useState(true)    // initial fetch+match
  const [matchError,     setMatchError]     = useState(null)
  // Pre-populate cardStates with the AI edit so its slot never needs an API call
  const [cardStates,     setCardStates]     = useState(() => {
    if (aiEditedB64 && aiClaudeResult) {
      return {
        [AI_PERSONA_ID]: {
          loading:     false,
          editedB64:   aiEditedB64,
          claudeResult: {
            params:         aiClaudeResult.params || {},
            tutorial_steps: aiClaudeResult.tutorial_steps || [],
            summary:        aiClaudeResult.summary || '',
            suggested_crop: aiClaudeResult.suggested_crop || null,
          },
          error: null,
        },
      }
    }
    return {}
  })
  const [previewPersona, setPreviewPersona] = useState(null)    // persona open in preview modal

  // ── Load personas + run match on mount ───────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [personasData, matchResult] = await Promise.all([
          fetchPersonas(),
          matchPersonasBackend(imageAnalysis),
        ])
        if (cancelled) return
        setAllPersonas(personasData)
        setMatchedIds(matchResult.matched_ids || [])
      } catch (err) {
        if (!cancelled) {
          // Fallback: use local data + first-8 ordering
          setAllPersonas(PHOTOGRAPHERS)
          setMatchedIds(PHOTOGRAPHERS.slice(0, 8).map(p => p.id))
          setMatchError(`Matching used local fallback: ${err.message}`)
        }
      } finally {
        if (!cancelled) setLoadingMatch(false)
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolved ordered persona objects for the grid (8 matched + nulls filtered)
  const matchedPersonas = matchedIds
    .map(id => allPersonas.find(p => p.id === id))
    .filter(Boolean)
    .slice(0, 8)

  // ── Card click → POST /edit/style ────────────────────────────────────────
  async function handleCardClick(personaId) {
    const existing = cardStates[personaId]

    // Helper: resolve a persona object by id (handles the synthetic AI slot)
    const resolvePersona = id =>
      id === AI_PERSONA_ID ? aiPersona : allPersonas.find(p => p.id === id)

    // Already processed — open preview immediately
    if (existing?.editedB64) {
      setPreviewPersona(resolvePersona(personaId))
      return
    }

    // Mark loading
    setCardStates(prev => ({
      ...prev,
      [personaId]: { loading: true, editedB64: null, error: null },
    }))

    try {
      const result = await editWithPersonaStyle(
        personaId, previewB64, filename, imageAnalysis, apiKey,
      )
      setCardStates(prev => ({
        ...prev,
        [personaId]: {
          loading:     false,
          editedB64:   result.result_b64,
          claudeResult: {
            params:         result.applied_params || {},
            tutorial_steps: result.tutorial_steps || [],
            summary:        result.summary || '',
            suggested_crop: result.suggested_crop || null,
          },
          error: null,
        },
      }))
      setPreviewPersona(resolvePersona(personaId))
    } catch (err) {
      setCardStates(prev => ({
        ...prev,
        [personaId]: { loading: false, editedB64: null, error: err.message },
      }))
    }
  }

  // ── Custom style (placeholder — full generation is a follow-on) ───────────
  async function handleCustomFiles(files) {
    // Stub: show a toast/log; full analyzeCustomStyle wiring comes later
    console.info('Custom style upload:', files.length, 'files received — generation pending')
  }

  // ── "Use this style" confirmation ────────────────────────────────────────
  function handleUseStyle(persona) {
    const state = cardStates[persona.id]
    if (!state?.editedB64) return
    onSelectStyle({
      originalB64:    imageB64,
      previewB64,
      editedB64:      state.editedB64,
      filename,
      claudeResult:   state.claudeResult,
      selectedPersona: persona,
      mode,           // propagate to App for routing decision
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to chat
        </button>
        <div className="text-center">
          <h1 className="text-zinc-100 font-semibold">Choose a Style</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {loadingMatch
              ? 'Matching styles to your photo…'
              : `${matchedPersonas.length} styles matched — tap a card to preview`}
          </p>
        </div>
        <div className="w-28" />
      </div>

      {/* Image-analysis context bar */}
      {imageAnalysis && !loadingMatch && (
        <div className="px-6 py-2 bg-zinc-900/60 border-b border-zinc-800/60 flex gap-3 overflow-x-auto text-xs text-zinc-500 flex-shrink-0 scrollbar-none">
          {imageAnalysis.subject && (
            <span className="flex-shrink-0">
              <span className="text-zinc-400 font-medium">Subject:</span> {imageAnalysis.subject}
            </span>
          )}
          {imageAnalysis.mood && (
            <span className="flex-shrink-0">
              · <span className="text-zinc-400 font-medium">Mood:</span> {imageAnalysis.mood}
            </span>
          )}
          {imageAnalysis.lighting && (
            <span className="flex-shrink-0">
              · <span className="text-zinc-400 font-medium">Light:</span> {imageAnalysis.lighting}
            </span>
          )}
          {matchError && (
            <span className="flex-shrink-0 text-amber-500/70">· {matchError}</span>
          )}
        </div>
      )}

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto p-4">
        {loadingMatch ? (
          <LoadingSkeleton />
        ) : (
          <PersonaGrid
            personas={matchedPersonas}
            cardStates={cardStates}
            onCardClick={handleCardClick}
            onCustomFiles={handleCustomFiles}
            aiPersona={aiPersona}
            aiEditedB64={aiEditedB64}
          />
        )}
      </div>

      {/* Preview modal */}
      {previewPersona && cardStates[previewPersona.id]?.editedB64 && (
        <PreviewModal
          persona={previewPersona}
          editedB64={cardStates[previewPersona.id].editedB64}
          claudeResult={cardStates[previewPersona.id].claudeResult}
          originalSrc={`data:image/jpeg;base64,${previewB64}`}
          accent={ACCENT[previewPersona.id] || '#7c3aed'}
          isApplyMode={isApplyMode}
          onClose={() => setPreviewPersona(null)}
          onUse={() => { setPreviewPersona(null); handleUseStyle(previewPersona) }}
        />
      )}
    </div>
  )
}

// ─── Loading skeleton shown while match is in progress ────────────────────────
function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-900 animate-pulse"
          style={{ aspectRatio: '1 / 1' }}
        >
          <div className="flex-1 bg-zinc-800 h-3/4" />
          <div className="p-3 space-y-1.5">
            <div className="h-3 bg-zinc-700 rounded w-3/4" />
            <div className="h-2 bg-zinc-800 rounded w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Before/After preview modal ────────────────────────────────────────────────
function PreviewModal({ persona, editedB64, claudeResult, originalSrc, accent, isApplyMode, onClose, onUse }) {
  const ctaLabel    = isApplyMode ? 'Apply This Style' : 'Start Tutorial'
  const ctaIcon     = isApplyMode
    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  const editedSrc = `data:image/png;base64,${editedB64}`

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col backdrop-blur-sm">
      {/* Modal header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full" style={{ background: accent }} />
          <h2 className="text-sm font-semibold text-zinc-100">{persona.name}</h2>
          {persona.era && (
            <span className="text-xs text-zinc-500">{persona.era}</span>
          )}
        </div>

        <button
          onClick={onUse}
          className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {ctaLabel}
        </button>
      </div>

      {/* Before / After */}
      <div className="flex-1 flex gap-3 p-4 min-h-0">
        {/* Before */}
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
          <img src={originalSrc} className="w-full h-full object-contain" alt="original" draggable={false} />
          <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-md font-medium backdrop-blur-sm">
            BEFORE
          </div>
        </div>
        {/* After */}
        <div
          className="flex-1 relative rounded-2xl overflow-hidden border bg-zinc-900"
          style={{ borderColor: `${accent}55` }}
        >
          <img src={editedSrc} className="w-full h-full object-contain" alt={persona.name} draggable={false} />
          <div
            className="absolute top-3 left-3 text-white text-xs px-2.5 py-1 rounded-md font-medium backdrop-blur-sm"
            style={{ background: `${accent}cc` }}
          >
            {persona.name}
          </div>
        </div>
      </div>

      {/* Summary + actions */}
      <div className="flex-shrink-0 bg-zinc-950 border-t border-zinc-800 px-5 py-4 space-y-3">
        {claudeResult?.summary && (
          <p className="text-sm text-zinc-300 leading-relaxed">
            <span className="font-medium" style={{ color: accent }}>
              {persona.name}:{' '}
            </span>
            {claudeResult.summary}
          </p>
        )}
        {persona.mood_descriptor && (
          <p className="text-xs text-zinc-500 italic">{persona.mood_descriptor}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Back to grid
          </button>
          <button
            onClick={onUse}
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {ctaIcon}
            </svg>
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
