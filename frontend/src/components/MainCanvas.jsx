import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PARAM_RANGES, paramLabel } from '../api'

// Main canvas: photo viewer + edit summary + filmstrip
export default function MainCanvas({
  session,          // { originalB64, previewB64, editedB64, filename, claudeResult }
  onSessionUpdate,  // (updates) → void — when user tweaks sliders
  activeNav,
  onFileLoaded,     // (file) → void — user dropped/picked a file here
}) {
  const navigate    = useNavigate()
  const [splitPos, setSplitPos]   = useState(50)
  const [dragging, setDragging]   = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const containerRef = useRef(null)
  const fileInputRef = useRef(null)

  const hasPhoto  = !!session?.previewB64
  const hasEdit   = !!session?.editedB64
  const filename  = session?.filename || 'Photoname.jpg'
  const tutSteps  = session?.claudeResult?.tutorial_steps || []
  const summary   = session?.claudeResult?.summary || ''
  const origSrc   = hasPhoto ? `data:image/jpeg;base64,${session.previewB64}` : null
  const editedSrc = hasEdit  ? `data:image/png;base64,${session.editedB64}`   : null

  // ── Split drag ──────────────────────────────────────────────────────────────
  function onMouseDown(e) {
    if (!hasEdit) return
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

  // ── File drop on canvas ─────────────────────────────────────────────────────
  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileLoaded?.(file)
  }

  return (
    <main className="flex-1 flex flex-col bg-[#050608] min-w-0 h-screen overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-2.5 flex-shrink-0">
        <button className="flex items-center gap-1.5 text-[#d9d9d9] text-[13px] font-opensans hover:text-white transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          Back to all projects
        </button>
        <span className="text-white text-[13px] font-opensans truncate max-w-[200px]">
          {hasPhoto ? filename : ''}
        </span>
        <div className="flex items-center gap-3">
          <button className="relative text-[#8D93A1] hover:text-white transition-colors">
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
          </button>
          <div className="w-[38px] h-[38px] rounded-full bg-[#263040] flex items-center justify-center text-white text-sm font-semibold overflow-hidden">
            F
          </div>
        </div>
      </div>

      {/* Photo area */}
      <div className="flex-1 px-4 flex flex-col min-h-0">

        {/* Canvas / drop zone */}
        <div
          ref={containerRef}
          className={`relative flex-1 rounded-[15px] overflow-hidden select-none min-h-0 ${
            hasEdit ? 'cursor-col-resize' : ''
          } ${isDragOver ? 'ring-2 ring-[#8B5CF6]' : ''}`}
          style={{ background: hasPhoto ? '#0A0D12' : '#0A0D12' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
        >
          {hasPhoto ? (
            <>
              {/* Original */}
              <img
                src={origSrc}
                className="absolute inset-0 w-full h-full object-contain"
                alt="original"
                draggable={false}
              />
              {/* Edited overlay with clip */}
              {hasEdit && (
                <img
                  src={editedSrc}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
                  alt="edited"
                  draggable={false}
                />
              )}
              {/* Divider */}
              {hasEdit && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-white/50 pointer-events-none"
                  style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow-xl flex items-center justify-center pointer-events-auto cursor-col-resize">
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
              {hasEdit && (
                <div className="absolute top-3 right-3 bg-[#8B5CF6]/80 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded font-medium">
                  EDITED
                </div>
              )}
              {/* Crop & Rotate → navigate to full editor */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                <button
                  onClick={() => navigate('/editor')}
                  className="bg-[#263040]/80 backdrop-blur-sm text-[#F7F7F2] text-[12px] px-3.5 py-1.5 rounded-xl border border-[#263040] hover:bg-[#263040] transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                  </svg>
                  Crop & Rotate
                </button>
              </div>
            </>
          ) : (
            // Upload drop zone
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div
                className="w-[120px] h-[120px] rounded-2xl border-2 border-dashed border-[#263040] flex items-center justify-center cursor-pointer hover:border-[#8B5CF6]/60 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="w-10 h-10 text-[#263040]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <div className="text-center space-y-1">
                <p className="text-[#8D93A1] text-[13px] font-poppins">Drop a photo or use the AI chat →</p>
                <p className="text-[#263040] text-[11px]">Supports RAW, JPEG, PNG, TIFF</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom panels — Improvement + Edit Summary */}
        {hasPhoto && (
          <div className="flex gap-3 mt-3 h-[220px] flex-shrink-0">

            {/* Improvement panel */}
            <div className="w-[270px] flex-shrink-0 bg-[#121822] rounded-[15px] p-4 flex flex-col">
              <p className="text-white text-[14px] font-opensans font-semibold mb-3">Improvement</p>
              {hasEdit ? (
                <div className="flex-1 flex gap-2 min-h-0">
                  <div className="flex-1 relative rounded-xl overflow-hidden border border-[#263040]">
                    <img src={origSrc} className="w-full h-full object-cover" alt="before" draggable={false}/>
                    <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                      BEFORE
                    </div>
                  </div>
                  <div className="flex-1 relative rounded-xl overflow-hidden border border-[#8B5CF6]/30">
                    <img src={editedSrc} className="w-full h-full object-cover" alt="after" draggable={false}/>
                    <div className="absolute top-1.5 left-1.5 bg-[#8B5CF6]/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                      AFTER
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[#8D93A1] text-[11px] text-center">Photo edits will appear here</p>
                </div>
              )}
            </div>

            {/* Edit Summary panel */}
            <div className="flex-1 bg-[#08151a] rounded-[15px] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
                <p className="text-[#e8edf2] text-[13px] font-inter font-semibold">Edit Summary</p>
                <button
                  onClick={() => navigate('/editor')}
                  className="flex items-center gap-1 text-[#6d88ff] text-[11px] font-inter font-semibold hover:text-[#8fa3ff] transition-colors"
                >
                  <div className="w-3 h-3 bg-[#0a1a2a] border border-[rgba(38,74,133,0.75)] rounded-sm flex items-center justify-center text-[7px] font-bold">Lr</div>
                  Open in Editor
                </button>
              </div>

              {tutSteps.length > 0 ? (
                <div className="flex-1 overflow-y-auto scrollbar-none">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {tutSteps.map((step, i) => (
                        <EditSummaryRow key={i} step={step} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[#8D93A1] text-[11px]">
                    {hasPhoto ? 'Ask the AI to edit your photo to see the edit summary' : 'No edits yet'}
                  </p>
                </div>
              )}

              {summary && (
                <div className="px-4 py-2 border-t border-[#263040] flex-shrink-0">
                  <p className="text-[#8D93A1] text-[10px] italic leading-relaxed line-clamp-2">{summary}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Photo filmstrip */}
        <div className="flex gap-2 mt-3 mb-3 h-[88px] flex-shrink-0 overflow-x-auto scrollbar-none">
          {/* Add more slot */}
          <div
            className="w-[80px] h-[88px] flex-shrink-0 border-2 border-dashed border-[#8D93A1]/40 rounded-[12px] flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-[#8B5CF6]/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="w-5 h-5 text-[#8D93A1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            <span className="text-[#8D93A1] text-[10px] font-poppins">Add More</span>
          </div>

          {/* Loaded photo thumbnails */}
          {hasPhoto && (
            <div className="relative w-[80px] h-[88px] flex-shrink-0 rounded-[12px] overflow-hidden border-2 border-[#8B5CF6] bg-[#121822]">
              <img src={origSrc} className="w-full h-full object-cover" alt={filename} draggable={false}/>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                <p className="text-white text-[9px] truncate font-poppins">{filename}</p>
              </div>
            </div>
          )}

          {/* Placeholder slots */}
          {[...Array(hasPhoto ? 5 : 6)].map((_, i) => (
            <div key={i} className="w-[80px] h-[88px] flex-shrink-0 bg-[#d9d9d9]/10 rounded-[12px]" />
          ))}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.tiff,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2,.raf,.pef"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFileLoaded?.(file)
          e.target.value = ''
        }}
      />
    </main>
  )
}

// ─── Edit Summary row ──────────────────────────────────────────────────────────
function EditSummaryRow({ step }) {
  const range = PARAM_RANGES[step.param]
  if (!range) return null

  const rangeSpan = range.max - range.min
  const zeroOffset = (-range.min / rangeSpan) * 100
  const valueOffset = ((step.value - range.min) / rangeSpan) * 100

  const PARAM_ICONS = {
    exposure: '☼', contrast: '◐', highlights: '☀', shadows: '◔',
    whites: '▣', blacks: '■', vibrance: '◈', saturation: '◉',
    temperature: '✣', tint: '⊕', clarity: '◎', texture: '⊠',
    dehaze: '◌', vignette: '○', grain: '⠿', fade: '◻',
  }
  const icon = PARAM_ICONS[step.param] || '·'

  const sign  = step.value >= 0 ? '+' : ''
  const displayVal = step.param === 'exposure'
    ? `${sign}${Number(step.value).toFixed(2)}`
    : `${sign}${Math.round(step.value)}`

  return (
    <tr className="border-b border-[#263040]/40 last:border-0">
      <td className="py-[5px] pl-4 pr-1 w-5 text-center text-[#e8edf2] text-[12px]">{icon}</td>
      <td className="py-[5px] pr-2 w-[70px]">
        <span className="text-[#e8edf2] text-[11px] font-opensans font-semibold whitespace-nowrap">
          {paramLabel(step.param)}
        </span>
      </td>
      <td className="py-[5px] pr-2 w-[110px]">
        <div className="relative h-[3px] bg-[#29343b] rounded-full">
          <div className="absolute top-0 h-full bg-[#19242b] w-px" style={{ left: `${zeroOffset}%` }} />
          <div
            className="absolute top-0 h-full bg-[#7c3aed] rounded-full"
            style={
              step.value >= 0
                ? { left: `${zeroOffset}%`, width: `${valueOffset - zeroOffset}%` }
                : { left: `${valueOffset}%`, width: `${zeroOffset - valueOffset}%` }
            }
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-[#8B5CF6] rounded-[3px]"
            style={{ left: `${valueOffset}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>
      </td>
      <td className="py-[5px] pr-2 w-[36px] text-right">
        <span className="text-[#a6afba] text-[11px] font-inter font-semibold">{displayVal}</span>
      </td>
      <td className="py-[5px] pr-4">
        <span className="text-[#707a85] text-[11px] font-opensans font-semibold">{step.reasoning || step.explanation}</span>
      </td>
    </tr>
  )
}

// FullEditorOverlay and SliderRow have moved to src/pages/EditorPage.jsx
