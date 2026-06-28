import { useState, useEffect, useRef, useCallback } from 'react'
import { processImage, DEFAULT_PARAMS, PARAM_RANGES, PARAM_SECTIONS, paramLabel } from '../api'
import CropTool from './CropTool'

// previewB64 — downscaled (≤1200px), used for every live slider call
// exportB64  — full-res original, used only when the user clicks Export
export default function EditorMode({ previewB64, exportB64, filename, initialParams = {}, onDone }) {
  const [params, setParams] = useState({ ...DEFAULT_PARAMS, ...initialParams })
  const [editedSrc, setEditedSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showCrop, setShowCrop] = useState(false)
  const [splitPos, setSplitPos] = useState(50)
  const [dragging, setDragging] = useState(false)
  const [openSections, setOpenSections] = useState({ Light: true, Color: true, Detail: false, Effects: false })
  const debounceRef = useRef(null)
  const abortRef = useRef(null)
  const containerRef = useRef(null)

  const originalSrc = `data:image/jpeg;base64,${previewB64}`

  // Live previews always use the downscaled image — fast.
  // AbortController ensures only the latest slider position resolves;
  // any queued in-flight request is cancelled immediately.
  const scheduleProcess = useCallback((p) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      try {
        const b64 = await processImage(previewB64, filename, p, controller.signal)
        if (!controller.signal.aborted) {
          setEditedSrc(`data:image/jpeg;base64,${b64}`)
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 120)   // 120 ms debounce
  }, [previewB64, filename])

  useEffect(() => {
    scheduleProcess(params)
  }, [])

  function updateParam(key, value) {
    const next = { ...params, [key]: value }
    setParams(next)
    scheduleProcess(next)
  }

  function resetParam(key) {
    updateParam(key, DEFAULT_PARAMS[key] ?? 0)
  }

  function resetAll() {
    const next = { ...DEFAULT_PARAMS }
    setParams(next)
    scheduleProcess(next)
  }

  function handleCropChange(crop) {
    // crop = { crop_x, crop_y, crop_w, crop_h, crop_rotation, crop_ratio }
    const next = { ...params, ...crop }
    setParams(next)
    scheduleProcess(next)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const fullB64 = await processImage(exportB64, filename, params)
      const a = document.createElement('a')
      a.href = `data:image/png;base64,${fullB64}`
      a.download = `edited_${filename.replace(/\.[^.]+$/, '')}.png`
      a.click()
      // Return to chat after export
      onDone()
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  // Split drag
  function onMouseDown(e) {
    e.preventDefault()
    setDragging(true)
    updateSplit(e.clientX)
  }
  function onMouseMove(e) {
    if (!dragging) return
    updateSplit(e.clientX)
  }
  function onMouseUp() { setDragging(false) }
  function updateSplit(clientX) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setSplitPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
  }

  const cropParams = {
    crop_x: params.crop_x, crop_y: params.crop_y,
    crop_w: params.crop_w, crop_h: params.crop_h,
    crop_rotation: params.crop_rotation || 0,
    crop_ratio: params.crop_ratio || null,
  }
  const hasCrop = params.crop_x != null || params.crop_rotation !== 0 || params.crop_ratio

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={onDone}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Back to Chat
        </button>
        <h1 className="text-sm font-semibold text-zinc-300 truncate max-w-xs">{filename}</h1>
        <div className="flex gap-2">
          <button
            onClick={resetAll}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
          >
            Reset All
          </button>
          <button
            onClick={handleExport}
            disabled={!editedSrc || exporting}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            {exporting ? (
              <>
                <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export PNG
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Image area */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden select-none bg-zinc-900 cursor-col-resize"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {/* Original — always visible immediately, no loading gate */}
          <img
            src={originalSrc}
            className="absolute inset-0 w-full h-full object-contain bg-zinc-900"
            alt="original"
            draggable={false}
          />

          {/* Edited result — overlaid once the first backend call resolves.
              clip-path keeps both images at identical element dimensions so
              object-contain renders them at exactly the same scale. */}
          {editedSrc && (
            <img
              src={editedSrc}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
              alt="edited"
              draggable={false}
            />
          )}

          {/* Divider — only once we have something to compare */}
          {editedSrc && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
              style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-xl flex items-center justify-center pointer-events-auto cursor-col-resize">
                <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
                </svg>
              </div>
            </div>
          )}

          {/* Labels */}
          <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md font-medium backdrop-blur-sm pointer-events-none">ORIGINAL</div>
          {editedSrc && (
            <div className="absolute top-3 right-3 bg-violet-600/80 text-white text-xs px-2 py-1 rounded-md font-medium backdrop-blur-sm pointer-events-none">EDITED</div>
          )}

          {/* Loading pill — overlaid on the image while a request is in flight */}
          {loading && (
            <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Processing…
              </div>
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <button
              onClick={() => setShowCrop(true)}
              className="bg-zinc-800/80 backdrop-blur-sm hover:bg-zinc-700 text-zinc-200 text-sm px-4 py-2 rounded-xl flex items-center gap-2 border border-zinc-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              Crop & Rotate
              {hasCrop && (
                <span className="w-2 h-2 rounded-full bg-violet-400" />
              )}
            </button>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-72 bg-zinc-900 border-l border-zinc-800 overflow-y-auto flex-shrink-0">
          {Object.entries(PARAM_SECTIONS).map(([section, keys]) => (
            <div key={section} className="border-b border-zinc-800">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-zinc-300 hover:text-zinc-100 transition-colors"
                onClick={() => setOpenSections(s => ({ ...s, [section]: !s[section] }))}
              >
                <span className="text-xs font-semibold uppercase tracking-widest">{section}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${openSections[section] ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {openSections[section] && (
                <div className="px-4 pb-4 space-y-4">
                  {keys.map(key => (
                    <ParamRow
                      key={key}
                      paramKey={key}
                      value={params[key] ?? 0}
                      onChange={v => updateParam(key, v)}
                      onReset={() => resetParam(key)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showCrop && (
        <CropTool
          imageSrc={originalSrc}
          cropParams={cropParams}
          onChange={handleCropChange}
          onClose={() => setShowCrop(false)}
        />
      )}
    </div>
  )
}

function ParamRow({ paramKey, value, onChange, onReset }) {
  const range = PARAM_RANGES[paramKey] || { min: -100, max: 100, step: 1 }
  const rangeSpan = range.max - range.min
  const pct = ((value - range.min) / rangeSpan) * 100
  const isDirty = value !== 0

  const displayVal = paramKey === 'exposure' ? value.toFixed(1) : Math.round(value)

  return (
    <div className="space-y-1.5 group">
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-400 font-medium">{paramLabel(paramKey)}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={displayVal}
            min={range.min}
            max={range.max}
            step={range.step}
            onChange={e => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) onChange(Math.min(range.max, Math.max(range.min, v)))
            }}
            className="w-14 text-right text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-md px-1.5 py-0.5 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={onReset}
            className={`transition-opacity text-zinc-600 hover:text-zinc-300 ${isDirty ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
            title="Reset"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative py-2">
        <div className="h-2 bg-zinc-700 rounded-full">
          {/* Zero line indicator */}
          {range.min < 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-zinc-600"
              style={{ left: `${(-range.min / rangeSpan) * 100}%` }}
            />
          )}
          {/* Active fill */}
          {range.min < 0 ? (
            <div
              className={`absolute top-0 h-full rounded-full ${isDirty ? 'bg-violet-500' : 'bg-zinc-600'}`}
              style={{
                left: value >= 0 ? `${(-range.min / rangeSpan) * 100}%` : `${pct}%`,
                width: `${Math.abs(value) / rangeSpan * 100}%`,
              }}
            />
          ) : (
            <div
              className={`absolute top-0 left-0 h-full rounded-full ${isDirty ? 'bg-violet-500' : 'bg-zinc-600'}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-x-0 inset-y-0 w-full opacity-0 cursor-pointer"
          style={{ zIndex: 10 }}
        />
      </div>
    </div>
  )
}
