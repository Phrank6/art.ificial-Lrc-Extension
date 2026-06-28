import { useState, useRef, useEffect } from 'react'
import { ACCEPTED_TYPES } from '../api'

// ─── Suggestion chips ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { label: 'Upload a photo',                           action: 'file',  icon: 'upload'  },
  { label: 'How can I improve this picture?',          action: 'text',  icon: 'sparkle' },
  { label: 'Edit in the style of a film photographer', action: 'text',  icon: 'film'    },
  { label: 'Suggest a crop for my shot',               action: 'text',  icon: 'crop'    },
]

function ChipIcon({ type }) {
  const cls = 'w-3.5 h-3.5 flex-shrink-0 opacity-75'
  if (type === 'upload') return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
    </svg>
  )
  if (type === 'sparkle') return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l1.5 4.5L12 9l-5.5 1.5L5 16l-1.5-5.5L-2 9l5.5-1.5L5 3z" transform="translate(7 3) scale(0.65)"/>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2l1.09 3.26L16 6l-2.91.74L12 10l-1.09-3.26L8 6l2.91-.74L12 2zM5 14l.73 2.18L8 17l-2.27.82L5 20l-.73-2.18L2 17l2.27-.82L5 14z"/>
    </svg>
  )
  if (type === 'film') return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="18" rx="2" strokeWidth={2}/>
      <path strokeLinecap="round" strokeWidth={2} d="M7 3v18M17 3v18M2 8h4m-4 4h4m-4 4h4M18 8h4m-4 4h4m-4 4h4"/>
    </svg>
  )
  if (type === 'crop') return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 2v14a2 2 0 002 2h14M18 22V8a2 2 0 00-2-2H2"/>
    </svg>
  )
  return null
}

// ─── LandingPage ──────────────────────────────────────────────────────────────
// Props:
//   onStart({ text?, file? }) — called when the user explicitly submits.
//     Dropping/selecting a photo stages it as a preview; the user must press
//     Enter or Send to actually transition.
export default function LandingPage({ onStart }) {
  const [inputValue,      setInputValue]      = useState('')
  const [pendingFile,     setPendingFile]      = useState(null)   // File object
  const [pendingPreview,  setPendingPreview]   = useState(null)   // object URL
  const [isDragOver,      setIsDragOver]       = useState(false)

  const inputRef     = useRef(null)
  const fileInputRef = useRef(null)

  // Auto-focus the text input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Revoke object URL on unmount or when preview changes
  useEffect(() => {
    return () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview) }
  }, [pendingPreview])

  // ── Submit (Enter / Send button) ──────────────────────────────────────────
  function handleSubmit() {
    const text = inputValue.trim()
    if (!text && !pendingFile) return
    onStart({ text: text || undefined, file: pendingFile || undefined })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  // ── Stage a file as a pending attachment (no auto-start) ─────────────────
  function stageFile(file) {
    if (!file) return
    // Revoke any previous preview URL
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(file)
    setPendingPreview(URL.createObjectURL(file))
    inputRef.current?.focus()
  }

  function clearPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
  }

  function handleFileChange(e) {
    stageFile(e.target.files?.[0])
    e.target.value = ''
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    stageFile(e.dataTransfer.files?.[0])
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragOver(true)
  }

  // ── Chip click ────────────────────────────────────────────────────────────
  function handleChip(chip) {
    if (chip.action === 'file') {
      fileInputRef.current?.click()
    } else {
      setInputValue(chip.label)
      inputRef.current?.focus()
    }
  }

  const canSubmit = !!inputValue.trim() || !!pendingFile

  return (
    <div
      className="relative isolate flex flex-col items-center justify-center h-screen bg-[#050716] overflow-hidden select-none"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
    >
      {/* ── Floating glass-panel background ── */}
      <div className="landing-bg" aria-hidden="true">
        <div className="floating-panel panel-left" />
        <div className="floating-panel panel-right-top" />
        <div className="floating-panel panel-right-bottom" />
        <div className="floating-panel panel-center" />
        <div className="landing-veil" />
      </div>

      {/* Drag-over page overlay */}
      {isDragOver && (
        <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-[#8B5CF6]/50 bg-[#8B5CF6]/5 pointer-events-none z-10" />
      )}

      {/* ── Logo — pinned top-left, same size as sidebar ── */}
      <div
        className="absolute top-0 left-0"
        style={{
          width: '264px',
          height: '176px',
          aspectRatio: '3/2',
          background: 'url(/lumina-logo.png) transparent 50% / cover no-repeat',
        }}
        role="img"
        aria-label="Lumina AI"
      />

      {/* ── Headline ── */}
      <h1
        className="font-poppins font-bold text-center mb-4 px-4"
        style={{ fontSize: '56px', lineHeight: 1.08, color: '#f7f4ff', letterSpacing: '-0.02em' }}
      >
        What would you like to{' '}
        <span className="text-gradient-purple-pink">edit</span>
        {' '}today?
      </h1>
      <p className="font-opensans text-[15px] text-center mb-9 px-4" style={{ color: '#b8b2d6' }}>
        Drop a photo, ask a question, or choose a suggestion below
      </p>

      {/* ── Main input ── */}
      <div
        className={`w-full max-w-[580px] mx-4 rounded-[16px] border transition-all duration-200 shadow-2xl ${
          isDragOver
            ? 'border-[#8B5CF6]/70 bg-[rgba(20,15,45,0.85)]'
            : 'border-[rgba(255,255,255,0.10)] bg-[rgba(10,8,28,0.72)] focus-within:border-[rgba(168,85,247,0.50)]'
        }`}
        style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        {/* Staged photo preview — shown above the text row */}
        {pendingPreview && (
          <div className="px-4 pt-3 pb-1 flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <img
                src={pendingPreview}
                alt="pending"
                className="h-14 w-20 rounded-[8px] object-cover border border-[#263040]"
              />
              <button
                onClick={clearPendingFile}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#374151] hover:bg-[#4B5563] rounded-full flex items-center justify-center text-white text-[10px] leading-none transition-colors"
                title="Remove photo"
              >
                ×
              </button>
            </div>
            <span className="text-[#8D93A1] text-[11px] font-opensans truncate">{pendingFile?.name}</span>
          </div>
        )}

        {/* Text row */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          {/* Attachment icon */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[#8D93A1] hover:text-[#a78bfa] transition-colors flex-shrink-0"
            title="Attach a photo"
            tabIndex={-1}
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
            </svg>
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingFile ? 'Add a message or press Enter to send…' : 'Ask anything or drop a photo…'}
            className="flex-1 bg-transparent outline-none text-[14px] text-[#f0ecff] placeholder-[#a79fc5] font-opensans min-w-0"
          />

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-[32px] h-[32px] rounded-[8px] bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-25 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0"
            title="Send"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Suggestion chips ── */}
      <div className="flex flex-wrap gap-2.5 mt-5 justify-center max-w-[600px] px-4">
        {SUGGESTIONS.map(chip => (
          <button
            key={chip.label}
            onClick={() => handleChip(chip)}
            className="flex items-center gap-2 border hover:text-white text-[12px] font-opensans px-4 py-2 rounded-full transition-all duration-150"
            style={{
              borderColor: 'rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: '#c4bde6',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(168,85,247,0.55)'
              e.currentTarget.style.background   = 'rgba(168,85,247,0.08)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
              e.currentTarget.style.background   = 'rgba(255,255,255,0.04)'
            }}
          >
            <ChipIcon type={chip.icon} />
            {chip.label}
          </button>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1.5">
        <p className="text-[11px] font-opensans" style={{ color: '#4e4868' }}>
          Supports RAW · JPEG · PNG · TIFF &nbsp;·&nbsp; Powered by Claude
        </p>
        <a
          href="https://www.artifical.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-opensans text-[#8D93A1] hover:text-white transition-colors"
        >
          by{' '}
          <span className="text-[#8B5CF6] hover:text-[#a78bfa] transition-colors font-medium">
            @art.ificial
          </span>
        </a>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
