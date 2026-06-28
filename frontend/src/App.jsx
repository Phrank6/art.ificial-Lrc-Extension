import { useState, useCallback, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppContext } from './AppContext'
import LeftSidebar  from './components/LeftSidebar'
import MainCanvas   from './components/MainCanvas'
import RightPanel   from './components/RightPanel'
import EditorPage   from './pages/EditorPage'
import TutorialPage from './pages/TutorialPage'
import LandingPage  from './pages/LandingPage'
import { fileToBase64, createPreviewB64 } from './api'
import { setLandingAction } from './landingAction'

// ─── Transition phases ────────────────────────────────────────────────────────
// 'landing'  → show LandingPage at full opacity
// 'fading'   → show LandingPage fading out (CSS transition)
// 'app'      → show main 3-column layout
const FADE_MS = 260

export default function App() {
  const [apiKey, setApiKeyState]  = useState(() => localStorage.getItem('lumina_api_key') || '')
  const [showApiModal, setShowApiModal] = useState(false)
  const [activeNav, setActiveNav] = useState('home')
  const [session, setSession]     = useState(null)
  const [projects, setProjects]   = useState([])

  // ── Landing → App transition ──────────────────────────────────────────────
  // 'landing' | 'fading' | 'app'
  const [appPhase, setAppPhase] = useState('landing')

  function handleLandingStart({ text, file }) {
    // Store in module-level singleton — consumed once by RightPanel on first mount.
    // Lives outside React so it is never re-read on editor/tutorial remounts.
    setLandingAction({ text: text || null, file: file || null, autoSend: !!file })
    setAppPhase('fading')
    setTimeout(() => setAppPhase('app'), FADE_MS)
  }

  // ── App context ───────────────────────────────────────────────────────────
  const appendChatRef     = useRef(null)
  const appendChatMessage = useCallback((msg) => appendChatRef.current?.(msg), [])

  function saveApiKey(key) {
    setApiKeyState(key)
    localStorage.setItem('lumina_api_key', key)
    setShowApiModal(false)
  }

  const handleEditResult = useCallback((sessionData) => {
    setSession(sessionData)
    setProjects(prev => {
      const idx = prev.findIndex(p => p.filename === sessionData.filename)
      if (idx >= 0) {
        const updated = [...prev]; updated[idx] = sessionData; return updated
      }
      return [sessionData, ...prev].slice(0, 8)
    })
  }, [])

  const handleFileLoaded = useCallback(async (file) => {
    try {
      const b64        = await fileToBase64(file)
      const previewB64 = await createPreviewB64(b64)
      const bare = { originalB64: b64, previewB64, filename: file.name, editedB64: null, claudeResult: null }
      setSession(bare)
      setProjects(prev => {
        const idx = prev.findIndex(p => p.filename === file.name)
        if (idx >= 0) return prev
        return [bare, ...prev].slice(0, 8)
      })
    } catch (e) { console.error('File load failed:', e) }
  }, [])

  const ctxValue = {
    apiKey,
    setApiKey: saveApiKey,
    session,
    setSession,
    projects,
    setProjects,
    appendChatMessage,
    appendChatRef,
    handleEditResult,
  }

  // ── Main layout (3-column) ────────────────────────────────────────────────
  const MainLayout = (
    <div className="flex h-screen overflow-hidden bg-[#050608]">
      <LeftSidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        projects={projects}
        currentFilename={session?.filename}
      />
      <MainCanvas
        session={session}
        onSessionUpdate={updates => setSession(prev => prev ? { ...prev, ...updates } : updates)}
        activeNav={activeNav}
        onFileLoaded={handleFileLoaded}
      />
      <RightPanel
        apiKey={apiKey}
        session={session}
        onEditResult={handleEditResult}
        onApiKeyClick={() => setShowApiModal(true)}
        registerAppendChat={fn => { appendChatRef.current = fn }}
      />
      {showApiModal && (
        <ApiKeyModal
          current={apiKey}
          onSave={saveApiKey}
          onClose={() => setShowApiModal(false)}
        />
      )}
    </div>
  )

  return (
    <AppContext.Provider value={ctxValue}>
      <Routes>

        {/* ── Home: landing → app transition ── */}
        <Route path="/" element={
          appPhase === 'app' ? (
            // Main layout fades in after landing exits
            <div
              style={{
                opacity: 1,
                animation: `lumina-fadein ${FADE_MS}ms ease forwards`,
              }}
            >
              {MainLayout}
            </div>
          ) : (
            // Landing page: full opacity normally, fading during transition
            <div
              style={{
                opacity:    appPhase === 'fading' ? 0 : 1,
                transform:  appPhase === 'fading' ? 'scale(0.985)' : 'scale(1)',
                transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
              }}
            >
              <LandingPage onStart={handleLandingStart} />
            </div>
          )
        } />

        {/* ── Editor page ── */}
        <Route path="/editor" element={<EditorPage />} />

        {/* ── Tutorial page ── */}
        <Route path="/tutorial" element={<TutorialPage />} />

      </Routes>
    </AppContext.Provider>
  )
}

// ─── API Key modal ─────────────────────────────────────────────────────────────
function ApiKeyModal({ current, onSave, onClose }) {
  const [value, setValue] = useState(current)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#121822] border border-[#263040] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-[#F7F7F2] font-inter font-semibold text-lg mb-1">Anthropic API Key</h2>
        <p className="text-[#8D93A1] text-sm mb-5 font-inter leading-relaxed">
          Your key is stored locally in your browser and never sent to any server other than Anthropic's API.
        </p>
        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full bg-[#263040] border border-[#263040] text-[#F7F7F2] placeholder-[#8D93A1] rounded-xl px-4 py-3 text-sm font-inter focus:outline-none focus:border-[#8B5CF6]/60 transition-colors mb-4"
          onKeyDown={e => e.key === 'Enter' && onSave(value)}
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-[#263040] hover:bg-[#374151] text-[#8D93A1] hover:text-white py-2.5 rounded-xl text-sm font-inter font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(value)}
            className="flex-1 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white py-2.5 rounded-xl text-sm font-inter font-semibold transition-colors"
          >
            Save Key
          </button>
        </div>
        <p className="text-[11px] text-[#263040] mt-3 text-center font-inter">
          Get yours at <span className="text-[#8B5CF6]">console.anthropic.com</span>
        </p>
      </div>
    </div>
  )
}
