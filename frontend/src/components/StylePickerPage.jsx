// ─── StylePickerPage ──────────────────────────────────────────────────────────
// Full-panel overlay listing all available photographer styles.
// onSelect(persona) is called when the user picks one; onBack closes the page.

const ACCENT_MAP = {
  saul_leiter: '#c084fc', vivian_maier: '#94a3b8', ansel_adams: '#64748b',
  hiroshi_sugimoto: '#6366f1', fan_ho: '#f59e0b', william_eggleston: '#f43f5e',
  diane_arbus: '#78716c', sebastiao_salgado: '#22d3ee', henri_cartier_bresson: '#84cc16',
  nan_goldin: '#fb7185', cindy_sherman: '#a3e635', ernst_haas: '#fb923c',
  joel_sternfeld: '#38bdf8', stephen_shore: '#fbbf24', alex_webb: '#f97316',
  martin_parr: '#e879f9', gursky_andreas: '#67e8f9', rineke_dijkstra: '#a78bfa',
  dorothea_lange: '#d6d3d1', robert_frank: '#9ca3af',
}
function accentColor(id) { return ACCENT_MAP[id] || '#8B5CF6' }

export default function StylePickerPage({ personas, selectedId, onSelect, onBack }) {
  // Show all available personas (backend returns however many there are)
  const list = personas.length > 0 ? personas : []

  return (
    <div className="absolute inset-0 bg-[#050608] flex flex-col z-20 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(46,48,51,0.35)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[#8D93A1] hover:text-white transition-colors"
          title="Back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <p className="font-poppins font-semibold text-white text-[16px] leading-tight">Choose a Style</p>
          <p className="font-opensans text-[#8D93A1] text-[11px] mt-0.5">{list.length} photographers</p>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-4">
        <div className="grid grid-cols-3 gap-2.5">
          {list.map(persona => {
            const color    = accentColor(persona.id)
            const isActive = persona.id === selectedId
            const keyword  = persona.keywords?.mood?.[0] ?? persona.keywords?.light?.[0] ?? null

            return (
              <button
                key={persona.id}
                onClick={() => onSelect(persona)}
                className={`relative flex flex-col items-center gap-2 rounded-[12px] px-2 py-3 text-center transition-all ${
                  isActive
                    ? 'bg-[#1a1340] ring-2 ring-[#8B5CF6]'
                    : 'bg-[#0d1117] border border-[#1e2633] hover:border-[#8B5CF6]/40 hover:bg-[#111827]'
                }`}
              >
                {/* Avatar circle */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}22`, border: `1.5px solid ${color}60` }}
                >
                  <span className="font-poppins font-bold text-[15px]" style={{ color }}>
                    {persona.name?.charAt(0)}
                  </span>
                </div>

                {/* Name */}
                <p className={`font-poppins font-semibold text-[11px] leading-tight w-full truncate ${isActive ? 'text-white' : 'text-[#d1d5db]'}`}>
                  {persona.name?.split(' ').pop()}
                </p>

                {/* Era */}
                {persona.era && (
                  <p className="font-opensans text-[#8D93A1] text-[9px] leading-tight -mt-1 truncate w-full">
                    {persona.era}
                  </p>
                )}

                {/* Keyword chip */}
                {keyword && (
                  <span
                    className="text-[9px] font-opensans font-semibold px-1.5 py-0.5 rounded-full truncate max-w-full"
                    style={{ background: `${color}18`, color }}
                  >
                    {keyword}
                  </span>
                )}

                {/* Selected checkmark */}
                {isActive && (
                  <div
                    className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: '#8B5CF6' }}
                  >
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {list.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-[#8D93A1]">
            <p className="font-poppins text-[13px]">Loading styles…</p>
          </div>
        )}
      </div>
    </div>
  )
}
