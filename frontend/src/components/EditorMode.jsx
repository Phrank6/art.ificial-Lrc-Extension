import { useState, useEffect, useRef, useCallback } from 'react'
import { processImage, DEFAULT_PARAMS, PARAM_RANGES, PARAM_SECTIONS, paramLabel } from '../api'
import CropTool from './CropTool'

export default function EditorMode({ originalB64, filename, initialParams = {}, onBack }) {
  const [params, setParams] = useState({ ...DEFAULT_PARAMS, ...initialParams })
  const [editedSrc, setEditedSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showCrop, setShowCrop] = useState(false)
  const [splitPos, setSplitPos] = useState(50)
  const [dragging, setDragging] = useState(false)
  const [openSections, setOpenSections] = useState({ Light: true, Color: true, Detail: false, Effects: false })
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  const originalSrc = `data:image/png;base64,${originalB64}`

  const scheduleProcess = useCallback((p) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const b64 = await processImage(originalB64, filename, p)
        setEditedSrc(`data:image/png;base64,${b64}`)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [originalB64, filename])

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
    const next = { ...params, crop_ratio: crop.ratio, crop_rotation: crop.rotation }
    setParams(next)
    scheduleProcess(next)
  }

  function handleExport() {
    if (!editedSrc) return
    const a = document.createElement('a')
    a.href = editedSrc
    a.download = `edited_${filename.replace(/\.[^.]+$/, '')}.png`
    a.click()
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

  const cropParams = { ratio: params.crop_ratio || 'free', rotation: params.crop_rotation || 0 }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
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
            disabled={!editedSrc}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export PNG
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
          {/* Edited */}
          {editedSrc && (
            <img
              src={editedSrc}
              className="absolute inset-0 w-full h-full object-contain"
              alt="edited"
              draggable={false}
            />
          )}

          {/* Original clipped */}
          {editedSrc && (
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${splitPos}%` }}
            >
              <img
                src={originalSrc}
                className="absolute inset-0 w-full h-full object-contain bg-zinc-900"
                style={{ width: `${10000 / splitPos}%`, maxWidth: 'none' }}
                alt="original"
                draggable={false}
              />
            </div>
          )}

          {/* Divider */}
          {editedSrc && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white"
              style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-xl flex items-center justify-center">
                <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
                </svg>
              </div>
            </div>
          )}

          {/* Labels */}
          {editedSrc && (
            <>
              <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md font-medium backdrop-blur-sm pointer-events-none">ORIGINAL</div>
              <div className="absolute top-3 right-3 bg-violet-600/80 text-white text-xs px-2 py-1 rounded-md font-medium backdrop-blur-sm pointer-events-none">EDITED</div>
            </>
          )}

          {/* Loading spinner */}
          {loading && (
            <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
              <div className="bg-black/50 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </div>
            </div>
          )}

          {!editedSrc && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
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
              {(cropParams.ratio !== 'free' || cropParams.rotation !== 0) && (
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

      <div className="relative">
        <div className="h-1 bg-zinc-700 rounded-full">
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
          className="absolute inset-x-0 top-0 w-full opacity-0 h-5 cursor-pointer"
          style={{ marginTop: '-8px', zIndex: 10 }}
        />
      </div>
    </div>
  )
}
