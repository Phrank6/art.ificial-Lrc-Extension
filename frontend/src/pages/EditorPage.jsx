import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../AppContext'
import { processImage, DEFAULT_PARAMS, PARAM_RANGES, PARAM_SECTIONS, paramLabel } from '../api'
import CropTool from '../components/CropTool'

// ─── Full-screen editor page (/editor) ───────────────────────────────────────
// Extracted from FullEditorOverlay in MainCanvas.
// On close or export → navigate('/') and append a before/after chat message.

export default function EditorPage() {
  const navigate   = useNavigate()
  const { session, setSession, appendChatMessage } = useApp()

  const [params, setParams]       = useState(() => ({
    ...DEFAULT_PARAMS,
    ...(session?.claudeResult?.params || {}),
  }))
  const [editedSrc, setEditedSrc] = useState(
    session?.editedB64 ? `data:image/png;base64,${session.editedB64}` : null
  )
  const [loading, setLoading]     = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showCrop, setShowCrop]   = useState(false)
  const [splitPos, setSplitPos]   = useState(50)
  const [dragging, setDragging]   = useState(false)
  const [openSections, setOpenSections] = useState({ Light: true, Color: true, Detail: false, Effects: false })

  const containerRef = useRef(null)
  const debounceRef  = useRef(null)
  const abortRef     = useRef(null)

  // If no session, redirect home
  useEffect(() => {
    if (!session?.previewB64) navigate('/')
  }, [])

  const origSrc = session?.previewB64 ? `data:image/jpeg;base64,${session.previewB64}` : null

  const scheduleProcess = useCallback((p) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setLoading(true)
      try {
        const b64 = await processImage(session.previewB64, session.filename, p, ctrl.signal)
        if (!ctrl.signal.aborted) setEditedSrc(`data:image/jpeg;base64,${b64}`)
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 120)
  }, [session?.previewB64, session?.filename])

  useEffect(() => { if (session?.previewB64) scheduleProcess(params) }, [])

  function updateParam(key, value) {
    const next = { ...params, [key]: value }
    setParams(next)
    scheduleProcess(next)
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true)
    try {
      const fullB64 = await processImage(
        session.originalB64 || session.previewB64,
        session.filename,
        params,
      )
      const a = document.createElement('a')
      a.href     = `data:image/png;base64,${fullB64}`
      a.download = `edited_${session.filename.replace(/\.[^.]+$/, '')}.png`
      a.click()

      // Update session with exported result
      const updatedSession = { ...session, editedB64: fullB64 }
      setSession(updatedSession)

      // Append before/after message to chat
      appendChatMessage({
        role: 'assistant',
        content: `Exported edited version of ${session.filename}.`,
        originalB64: session.previewB64,
        editedB64:   fullB64,
        sessionData: updatedSession,
      })

      navigate('/')
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  // ── Close without export ──────────────────────────────────────────────────
  function handleClose() {
    navigate('/')
  }

  // ── Split drag ─────────────────────────────────────────────────────────────
  function onMouseDown(e) { e.preventDefault(); setDragging(true); updateSplit(e.clientX) }
  function onMouseMove(e) { if (!dragging) return; updateSplit(e.clientX) }
  function onMouseUp()    { setDragging(false) }
  function updateSplit(x) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setSplitPos(Math.min(100, Math.max(0, ((x - rect.left) / rect.width) * 100)))
  }

  const cropParams = {
    crop_x: params.crop_x, crop_y: params.crop_y,
    crop_w: params.crop_w, crop_h: params.crop_h,
    crop_rotation: params.crop_rotation || 0,
    crop_ratio: params.crop_ratio || null,
  }

  if (!session?.previewB64) return null

  return (
    <div className="flex flex-col h-screen bg-[#050608]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#263040] flex-shrink-0">
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 text-[#8D93A1] hover:text-white transition-colors text-sm font-opensans"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
          Close Editor
        </button>
        <span className="text-[#8D93A1] text-sm font-inter truncate max-w-[200px]">
          {session.filename}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => { setParams({ ...DEFAULT_PARAMS }); scheduleProcess({ ...DEFAULT_PARAMS }) }}
            className="px-3 py-1.5 bg-[#121822] hover:bg-[#263040] text-[#8D93A1] hover:text-white rounded-lg text-xs font-inter transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleExport}
            disabled={!editedSrc || exporting}
            className="px-3 py-1.5 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-40 text-white rounded-lg text-xs font-inter font-semibold transition-colors flex items-center gap-1.5"
          >
            {exporting ? (
              <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>Exporting…</>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Export PNG
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body: image + sliders */}
      <div className="flex flex-1 min-h-0">

        {/* Image canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden select-none bg-[#0A0D12] cursor-col-resize"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <img
            src={origSrc}
            className="absolute inset-0 w-full h-full object-contain"
            alt="original"
            draggable={false}
          />
          {editedSrc && (
            <img
              src={editedSrc}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
              alt="edited"
              draggable={false}
            />
          )}
          {editedSrc && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/40"
              style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow-xl flex items-center justify-center cursor-col-resize">
                <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3M16 9l3 3-3 3"/>
                </svg>
              </div>
            </div>
          )}

          {/* Labels */}
          <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded font-medium">
            ORIGINAL
          </div>
          {editedSrc && (
            <div className="absolute top-3 right-3 bg-[#8B5CF6]/80 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded font-medium">
              EDITED
            </div>
          )}

          {/* Processing spinner */}
          {loading && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>
              Processing…
            </div>
          )}

          {/* Crop & Rotate button */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <button
              onClick={() => setShowCrop(true)}
              className="bg-[#263040]/80 backdrop-blur-sm text-[#F7F7F2] text-xs px-3.5 py-2 rounded-xl border border-[#263040] hover:bg-[#263040] transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
              Crop & Rotate
            </button>
          </div>
        </div>

        {/* Sliders sidebar */}
        <div className="w-64 bg-[#0A0D12] border-l border-[#263040] overflow-y-auto flex-shrink-0">
          {Object.entries(PARAM_SECTIONS).map(([section, keys]) => (
            <div key={section} className="border-b border-[#263040]">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-[#8D93A1] hover:text-white transition-colors"
                onClick={() => setOpenSections(s => ({ ...s, [section]: !s[section] }))}
              >
                <span className="text-[11px] font-inter font-semibold uppercase tracking-widest">{section}</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${openSections[section] ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              {openSections[section] && (
                <div className="px-4 pb-4 space-y-4">
                  {keys.map(key => (
                    <SliderRow
                      key={key}
                      paramKey={key}
                      value={params[key] ?? 0}
                      onChange={v => updateParam(key, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Crop tool overlay */}
      {showCrop && (
        <CropTool
          imageSrc={origSrc}
          cropParams={cropParams}
          onChange={crop => setParams(p => ({ ...p, ...crop }))}
          onClose={() => setShowCrop(false)}
        />
      )}
    </div>
  )
}

// ─── Slider row ───────────────────────────────────────────────────────────────
function SliderRow({ paramKey, value, onChange }) {
  const range    = PARAM_RANGES[paramKey] || { min: -100, max: 100, step: 1 }
  const rangeSpan = range.max - range.min
  const pct       = ((value - range.min) / rangeSpan) * 100
  const isDirty   = value !== 0
  const displayVal = paramKey === 'exposure' ? value.toFixed(1) : Math.round(value)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-[#8D93A1] font-inter font-medium">{paramLabel(paramKey)}</label>
        <span className={`text-[11px] font-inter font-semibold ${isDirty ? 'text-[#a78bfa]' : 'text-[#8D93A1]'}`}>
          {(value >= 0 && paramKey !== 'exposure') ? `+${displayVal}` : displayVal}
        </span>
      </div>
      <div className="relative py-1.5">
        <div className="h-[3px] bg-[#29343b] rounded-full relative">
          {range.min < 0 && (
            <div
              className="absolute top-0 h-full bg-[#19242b] w-px"
              style={{ left: `${(-range.min / rangeSpan) * 100}%` }}
            />
          )}
          {range.min < 0 ? (
            <div
              className={`absolute top-0 h-full rounded-full ${isDirty ? 'bg-[#7c3aed]' : 'bg-[#263040]'}`}
              style={
                value >= 0
                  ? { left: `${(-range.min / rangeSpan) * 100}%`, width: `${(value / rangeSpan) * 100}%` }
                  : { left: `${pct}%`, width: `${((-value) / rangeSpan) * 100}%` }
              }
            />
          ) : (
            <div
              className={`absolute top-0 left-0 h-full rounded-full ${isDirty ? 'bg-[#7c3aed]' : 'bg-[#263040]'}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <input
          type="range"
          min={range.min} max={range.max} step={range.step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-x-0 inset-y-0 w-full opacity-0 cursor-pointer"
          style={{ zIndex: 10 }}
        />
      </div>
    </div>
  )
}
