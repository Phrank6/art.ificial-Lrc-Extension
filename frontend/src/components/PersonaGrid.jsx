/**
 * PersonaGrid — display-only 3×3 grid of photographer persona cards.
 *
 * This component is responsible solely for rendering.  All data-fetching,
 * Claude calls, and state management live in StyleSelectionMode.jsx.
 *
 * Props
 * -----
 * personas        — array of public persona objects (from GET /personas)
 * cardStates      — object keyed by persona.id: { loading, editedB64, error }
 * onCardClick(id) — called when a card is clicked
 * onCustomFiles(FileList) — called when files are dropped / selected in the custom slot
 */

import { useRef, useState } from 'react'
import { ACCEPTED_TYPES } from '../api'

// Accent colours are defined here so this component is self-contained for UI.
// They must stay in sync with photographers.js ACCENT_COLORS.
const ACCENT = {
  saul_leiter:          '#c084fc',
  vivian_maier:         '#94a3b8',
  fan_ho:               '#1e3a5f',
  william_eggleston:    '#ef4444',
  stephen_shore:        '#fbbf24',
  martin_parr:          '#f97316',
  daido_moriyama:       '#374151',
  hiroshi_sugimoto:     '#e2e8f0',
  gregory_crewdson:     '#3b82f6',
  sally_mann:           '#d97706',
  sebastiao_salgado:    '#71717a',
  steve_mccurry:        '#10b981',
  henri_cartier_bresson:'#6366f1',
  diane_arbus:          '#a1a1aa',
  nan_goldin:           '#f43f5e',
  wolfgang_tillmans:    '#84cc16',
  joel_meyerowitz:      '#fb923c',
  ernst_haas:           '#8b5cf6',
  rinko_kawauchi:       '#fbcfe8',
  alex_webb:            '#dc2626',
  custom:               '#a78bfa',
}

export default function PersonaGrid({ personas, cardStates, onCardClick, onCustomFiles, aiPersona, aiEditedB64 }) {
  const fileInputRef = useRef(null)

  // Build 9-slot array: 8 matched personas + 1 special slot
  const slots = [...personas.slice(0, 8), null]

  return (
    <div className="grid grid-cols-3 gap-3">
      {slots.map((persona, i) => {
        if (persona === null) {
          // Slot 9: AI edit (if available) or custom upload zone
          if (aiPersona && aiEditedB64) {
            return (
              <AiEditSlot
                key="ai-edit"
                aiPersona={aiPersona}
                aiEditedB64={aiEditedB64}
                state={cardStates[aiPersona.id] || {}}
                onClick={() => onCardClick(aiPersona.id)}
              />
            )
          }
          return (
            <CustomSlot
              key="custom"
              onFiles={onCustomFiles}
              inputRef={fileInputRef}
            />
          )
        }

        const state  = cardStates[persona.id] || {}
        const accent = ACCENT[persona.id] || '#7c3aed'
        // Show up to 3 mood keyword tags
        const moodTags = (persona.keywords?.mood || []).slice(0, 3)

        return (
          <PersonaCard
            key={persona.id}
            persona={persona}
            state={state}
            accent={accent}
            moodTags={moodTags}
            onCardClick={onCardClick}
          />
        )
      })}
    </div>
  )
}

// ─── Individual persona card ──────────────────────────────────────────────────
function PersonaCard({ persona, state, accent, moodTags, onCardClick }) {
  const [imgError, setImgError] = useState(false)

  return (
    <button
      onClick={() => onCardClick(persona.id)}
      disabled={state.loading}
      className={`group relative rounded-2xl overflow-hidden border text-left transition-all flex flex-col ${
        state.error
          ? 'border-red-800/50 bg-zinc-900 cursor-default'
          : state.loading
            ? 'border-zinc-700 bg-zinc-900 cursor-wait'
            : 'border-zinc-700 hover:border-zinc-500 hover:scale-[1.02] cursor-pointer bg-zinc-900'
      }`}
      style={{ aspectRatio: '1 / 1' }}
    >
      {/* ── Image area ── */}
      <div className="flex-1 relative overflow-hidden bg-zinc-800/60">
        {state.loading ? (
          /* Processing spinner */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-800">
            <div
              className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `${accent}55`, borderTopColor: accent }}
            />
            <span className="text-[10px] font-medium" style={{ color: accent }}>Styling…</span>
          </div>
        ) : state.editedB64 ? (
          /* Processed result */
          <>
            <img
              src={`data:image/png;base64,${state.editedB64}`}
              className="absolute inset-0 w-full h-full object-cover"
              alt={persona.name}
              draggable={false}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                Preview
              </div>
            </div>
          </>
        ) : state.error ? (
          /* Error state */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 gap-1.5">
            <svg className="w-5 h-5 text-red-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] text-red-400/80 text-center leading-tight">Failed — tap to retry</span>
          </div>
        ) : persona.exampleImageUrl && !imgError ? (
          /* Representative example photo */
          <>
            <img
              src={persona.exampleImageUrl}
              className="absolute inset-0 w-full h-full object-cover"
              alt={`${persona.name} style example`}
              draggable={false}
              onError={() => setImgError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <div
                className="rounded px-1.5 py-0.5 inline-block"
                style={{ background: `${accent}cc` }}
              >
                <p className="text-[8px] font-semibold text-white leading-tight">tap to style</p>
              </div>
            </div>
          </>
        ) : (
          /* Fallback: hint text */
          <div className="absolute inset-0 flex flex-col items-end justify-end p-2.5">
            <div
              className="w-full rounded-lg px-2.5 py-2 backdrop-blur-sm"
              style={{ background: `${accent}20`, border: `1px solid ${accent}30` }}
            >
              <p className="text-[9px] leading-tight" style={{ color: accent }}>
                {persona.example_image_hint}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Nameplate ── */}
      <div className="flex-shrink-0 px-3 pt-2 pb-2.5 bg-zinc-950 space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />
          <span className="text-xs font-semibold text-zinc-100 truncate leading-tight">{persona.name}</span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">{persona.mood_descriptor}</p>
        {moodTags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {moodTags.map(tag => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium leading-none"
                style={{ background: `${accent}22`, color: accent }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── AI edit slot (position 9 when an AI-edited image is available) ──────────
const AI_ACCENT = '#8b5cf6'

function AiEditSlot({ aiPersona, aiEditedB64, state, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-2xl overflow-hidden border text-left transition-all flex flex-col cursor-pointer bg-zinc-900"
      style={{ aspectRatio: '1 / 1', borderColor: `${AI_ACCENT}55` }}
    >
      {/* Image area — always shows the pre-rendered AI edit */}
      <div className="flex-1 relative overflow-hidden bg-zinc-800/60">
        <img
          src={`data:image/png;base64,${aiEditedB64}`}
          className="absolute inset-0 w-full h-full object-cover"
          alt="AI edit"
          draggable={false}
        />
        {/* Subtle gradient + hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
            Preview
          </div>
        </div>
        {/* "AI" badge in top-right */}
        <div
          className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: `${AI_ACCENT}dd`, color: '#fff' }}
        >
          AI
        </div>
      </div>

      {/* Nameplate */}
      <div className="flex-shrink-0 px-3 pt-2 pb-2.5 bg-zinc-950 space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: AI_ACCENT }} />
          <span className="text-xs font-semibold text-zinc-100 truncate leading-tight">Learn from AI</span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">
          {aiPersona.mood_descriptor || 'Personalised edit tuned for your photo.'}
        </p>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {['ai', 'personalised'].map(tag => (
            <span
              key={tag}
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium leading-none"
              style={{ background: `${AI_ACCENT}22`, color: AI_ACCENT }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

// ─── Custom upload slot (position 9) ─────────────────────────────────────────
function CustomSlot({ onFiles, inputRef }) {
  function handleDrop(e) {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files?.length) onFiles(files)
  }

  function handleChange(e) {
    if (e.target.files?.length) {
      onFiles(e.target.files)
      e.target.value = ''
    }
  }

  return (
    <label
      className="rounded-2xl border-2 border-dashed border-zinc-700 hover:border-violet-600 bg-zinc-900/40 hover:bg-zinc-900/80 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group p-4"
      style={{ aspectRatio: '1 / 1' }}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-violet-900/40 flex items-center justify-center transition-colors flex-shrink-0">
        <svg
          className="w-5 h-5 text-zinc-500 group-hover:text-violet-400 transition-colors"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <div className="text-center space-y-0.5">
        <p className="text-xs font-semibold text-zinc-300 group-hover:text-violet-300 transition-colors leading-tight">
          Learn from my photos
        </p>
        <p className="text-[10px] text-zinc-600 group-hover:text-zinc-500 transition-colors leading-tight">
          Drop 5–15 reference images
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </label>
  )
}
