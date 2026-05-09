import { useState, useRef, useCallback } from 'react'

export default function BeforeAfterComparison({
  originalB64,
  editedB64,
  summary,
  onStartTutorial,
  onOpenEditor,
  onBack,
}) {
  const [sliderPos, setSliderPos] = useState(50)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef(null)

  const originalSrc = `data:image/png;base64,${originalB64}`
  const editedSrc = `data:image/png;base64,${editedB64}`

  const updateSlider = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    setSliderPos(pct)
  }, [])

  function onMouseDown(e) {
    e.preventDefault()
    setDragging(true)
    updateSlider(e.clientX)
  }

  function onMouseMove(e) {
    if (!dragging) return
    updateSlider(e.clientX)
  }

  function onMouseUp() {
    setDragging(false)
  }

  function onTouchStart(e) {
    setDragging(true)
    updateSlider(e.touches[0].clientX)
  }

  function onTouchMove(e) {
    if (!dragging) return
    updateSlider(e.touches[0].clientX)
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to chat
        </button>
        <h1 className="text-zinc-100 font-semibold">AI Edit Preview</h1>
        <div className="w-24" />
      </div>

      {/* Comparison area */}
      <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden rounded-2xl border border-zinc-800 select-none cursor-col-resize"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onMouseUp}
          style={{ userSelect: 'none' }}
        >
          {/* Edited image (full, behind) */}
          <img
            src={editedSrc}
            className="absolute inset-0 w-full h-full object-contain bg-zinc-900"
            alt="edited"
            draggable={false}
          />

          {/* Original image (clipped on left) */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${sliderPos}%` }}
          >
            <img
              src={originalSrc}
              className="absolute inset-0 w-full h-full object-contain bg-zinc-900"
              style={{ width: `${10000 / sliderPos}%`, maxWidth: 'none' }}
              alt="original"
              draggable={false}
            />
          </div>

          {/* Divider line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
            style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
          >
            {/* Handle circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-xl border-2 border-zinc-300 flex items-center justify-center cursor-col-resize">
              <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
              </svg>
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded-md font-medium backdrop-blur-sm pointer-events-none">
            ORIGINAL
          </div>
          <div className="absolute top-4 right-4 bg-violet-600/80 text-white text-xs px-2 py-1 rounded-md font-medium backdrop-blur-sm pointer-events-none">
            AI EDIT
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl px-5 py-4 text-zinc-300 text-sm leading-relaxed">
            <span className="text-violet-400 font-medium">AI summary: </span>{summary}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onStartTutorial}
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Start Tutorial
          </button>
          <button
            onClick={onOpenEditor}
            className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Open Editor
          </button>
        </div>
      </div>
    </div>
  )
}
