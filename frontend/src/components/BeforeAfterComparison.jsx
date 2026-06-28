export default function BeforeAfterComparison({
  originalB64,
  editedB64,
  summary,
  onStartTutorial,
  onOpenEditor,
  onBack,
}) {
  const originalSrc = `data:image/png;base64,${originalB64}`
  const editedSrc   = `data:image/png;base64,${editedB64}`

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
        {/* Two-frame side-by-side layout */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Before frame */}
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
            <img
              src={originalSrc}
              className="w-full h-full object-contain"
              alt="original"
              draggable={false}
            />
            <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md font-medium backdrop-blur-sm pointer-events-none">
              BEFORE
            </div>
          </div>

          {/* After frame */}
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
            <img
              src={editedSrc}
              className="w-full h-full object-contain"
              alt="edited"
              draggable={false}
            />
            <div className="absolute top-3 left-3 bg-violet-600/80 text-white text-xs px-2 py-1 rounded-md font-medium backdrop-blur-sm pointer-events-none">
              AFTER
            </div>
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
