import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { consumeLandingAction } from '../landingAction'
import StylePickerPage from './StylePickerPage'
import {
  fileToBase64,
  createPreviewB64,
  ACCEPTED_TYPES,
  askClaudeEditMultiturn,
  askClaudeChat,
  processImage,
  fetchPersonas,
  matchPersonasBackend,
  editWithPersonaStyle,
} from '../api'

const STORAGE_KEY = 'lumina_ai_chat_v1'

const GREETING = {
  role: 'assistant',
  content: "Hi! I'm your AI photo editing assistant. Upload a photo and I'll analyse it and suggest edits — or just ask me anything about photography!",
}

function serializeMessages(msgs) {
  return msgs
    .filter(m => m.content && m.content !== '___thinking___')
    .map(({ image, editedB64, originalB64, sessionData, ...rest }) => rest)
    .filter(m => m.content)
}

export default function RightPanel({
  apiKey,
  session,
  onEditResult,        // (sessionData) → void
  onApiKeyClick,
  registerAppendChat,  // (fn) → void — so EditorPage can append messages
}) {
  const navigate = useNavigate()
  // ── Chat state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch { /* ignore */ }
    return [GREETING]
  })
  const [editSession, setEditSession] = useState(null)
  const [input, setInput]             = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)

  // ── Style state ───────────────────────────────────────────────────────────
  const [personas,     setPersonas]     = useState([])
  const [matchedIds,   setMatchedIds]   = useState([])
  const [styleLoading, setStyleLoading] = useState(false)
  const [cardStates,   setCardStates]   = useState({})
  const [activePersonaIdx, setActivePersonaIdx] = useState(0)
  const [showStylePicker,  setShowStylePicker]  = useState(false)

  const fileInputRef  = useRef(null)
  const bottomRef     = useRef(null)
  const textareaRef   = useRef(null)
  // Set to true on mount when autoSend+autoAttachFile; cleared after first send
  const pendingAutoSendRef = useRef(false)
  // Guard against concurrent handleSend calls (race between auto-send setTimeout and button click)
  const isSendingRef = useRef(false)

  // ── Register append-chat so EditorPage / TutorialPage can inject messages ─
  useEffect(() => {
    registerAppendChat?.((msg) => setMessages(prev => [...prev, msg]))
  }, [registerAppendChat])

  // ── Consume landing-page initial action (runs once on first mount) ─────────
  useEffect(() => {
    const data = consumeLandingAction()
    if (!data) return
    if (data.text) setInput(data.text)
    if (data.file) {
      if (data.autoSend) pendingAutoSendRef.current = true
      loadFile(data.file)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — only run once per mount

  // ── Auto-send after the landing-page file finishes loading ────────────────
  useEffect(() => {
    if (pendingFile && pendingAutoSendRef.current) {
      pendingAutoSendRef.current = false
      setTimeout(() => handleSend(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile])

  // ── Persist messages ──────────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeMessages(messages))) }
    catch { /* storage full */ }
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Load personas on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetchPersonas().then(data => setPersonas(data)).catch(() => {})
  }, [])

  // ── Match personas when session changes ───────────────────────────────────
  useEffect(() => {
    if (!session?.claudeResult?.imageAnalysis && personas.length === 0) return
    const analysis = session?.claudeResult?.imageAnalysis || {}
    if (Object.keys(analysis).length === 0 && personas.length > 0) {
      setMatchedIds(personas.slice(0, 3).map(p => p.id))
      return
    }
    matchPersonasBackend(analysis)
      .then(res => setMatchedIds(res.matched_ids?.slice(0, 3) || []))
      .catch(() => {
        if (personas.length > 0) setMatchedIds(personas.slice(0, 3).map(p => p.id))
      })
  }, [session, personas])

  function clearHistory() {
    setMessages([GREETING])
    setEditSession(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  // ── File loading ──────────────────────────────────────────────────────────
  async function loadFile(file) {
    const previewUrl = URL.createObjectURL(file)
    const b64        = await fileToBase64(file)
    const previewB64 = await createPreviewB64(b64)
    setPendingFile({ file, b64, previewB64, previewUrl })
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    loadFile(file)
    e.target.value = ''
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) { loadFile(item.getAsFile()); break }
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function handleSend() {
    // Prevent concurrent sends — e.g. auto-send setTimeout firing while
    // a button click is already in-flight within the same render cycle.
    if (isSendingRef.current) return
    const text = input.trim()
    if (!text && !pendingFile) return
    if (!apiKey) { onApiKeyClick?.(); return }

    isSendingRef.current = true

    const photo = pendingFile
    setPendingFile(null)
    setInput('')
    setError(null)

    const userMsg = { role: 'user', content: text, image: photo?.previewUrl ?? null }
    setMessages(prev => [...prev, userMsg])

    const activeSession = photo
      ? { previewB64: photo.previewB64, b64: photo.b64, filename: photo.file.name, previewUrl: photo.previewUrl, claudeApiHistory: [] }
      : editSession

    if (photo || editSession) {
      setLoading(true)
      const isFirst  = !!photo
      const newEntry = { role: 'user', content: text || 'Please edit this photo.', attachImage: isFirst }
      const prevHist = photo ? [] : (activeSession?.claudeApiHistory ?? [])
      const updHist  = [...prevHist, newEntry]

      setMessages(prev => [...prev, { role: 'assistant', content: '___thinking___' }])

      try {
        const result    = await askClaudeEditMultiturn(activeSession.previewB64, updHist, apiKey)
        const editedB64 = await processImage(activeSession.previewB64, activeSession.filename, result.params || {})

        const newSess = {
          previewB64: activeSession.previewB64,
          b64:        (photo ?? activeSession).b64,
          filename:   activeSession.filename,
          previewUrl: (photo ?? activeSession).previewUrl,
          claudeApiHistory: [...updHist, { role: 'assistant', content: JSON.stringify(result) }],
        }
        if (photo) setEditSession(newSess)
        else setEditSession(prev => ({ ...prev, claudeApiHistory: newSess.claudeApiHistory }))

        const sessionData = {
          originalB64: (photo ?? activeSession).b64,
          previewB64:  activeSession.previewB64,
          editedB64,
          filename:    activeSession.filename,
          claudeResult: result,
        }
        onEditResult?.(sessionData)

        setMessages(prev => [
          ...prev.filter(m => m.content !== '___thinking___'),
          {
            role: 'assistant',
            content: result.summary || 'Here are my suggested edits.',
            originalB64: activeSession.previewB64,
            editedB64,
            sessionData,
          },
        ])
      } catch (err) {
        setMessages(prev => prev.filter(m => m.content !== '___thinking___'))
        setError(err.message || 'Something went wrong. Please try again.')
      } finally {
        setLoading(false)
        isSendingRef.current = false
      }
    } else {
      setLoading(true)
      try {
        const chatMsgs = [...messages, userMsg]
          .filter(m => !m.image && m.content !== '___thinking___' && !m.editedB64)
          .map(m => ({ role: m.role, content: m.content }))
        const reply = await askClaudeChat(chatMsgs, apiKey)
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      } catch (err) {
        setError(err.message || 'Something went wrong.')
      } finally {
        setLoading(false)
        isSendingRef.current = false
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Apply style ───────────────────────────────────────────────────────────
  async function handleApplyStyle() {
    const personaIds = matchedIds.length > 0 ? matchedIds : personas.slice(0, 3).map(p => p.id)
    if (!session?.previewB64 || personaIds.length === 0 || !apiKey) return
    const personaId = personaIds[activePersonaIdx] || personaIds[0]
    const existing  = cardStates[personaId]
    if (existing?.editedB64) {
      onEditResult?.({
        ...session,
        editedB64:    existing.editedB64,
        claudeResult: existing.claudeResult,
      })
      return
    }
    setStyleLoading(true)
    try {
      const res = await editWithPersonaStyle(personaId, session.previewB64, session.filename, {}, apiKey)
      const state = {
        loading: false,
        editedB64: res.result_b64,
        claudeResult: {
          params: res.applied_params || {},
          tutorial_steps: res.tutorial_steps || [],
          summary: res.summary || '',
          suggested_crop: res.suggested_crop || null,
        },
        error: null,
      }
      setCardStates(prev => ({ ...prev, [personaId]: state }))
      onEditResult?.({
        ...session,
        editedB64:    res.result_b64,
        claudeResult: state.claudeResult,
      })
    } catch (err) {
      console.error('Style apply failed:', err)
    } finally {
      setStyleLoading(false)
    }
  }

  // ── Start Tutorial ────────────────────────────────────────────────────────
  function handleStartTutorial(sessionData, persona) {
    const src = sessionData || session
    if (!src?.claudeResult?.tutorial_steps?.length) return
    navigate('/tutorial', {
      state: {
        tutorialSteps:   src.claudeResult.tutorial_steps,
        initialParams:   src.claudeResult.params || {},
        suggestedCrop:   src.claudeResult.suggested_crop || null,
        selectedPersona: persona || null,
        originalB64:     src.previewB64,
        filename:        src.filename,
      },
    })
  }

  // ── Pick a style manually from the Style Picker page ─────────────────────
  function handlePickStyle(persona) {
    // Prepend the chosen persona ID to the front; deduplicate; cap at 3
    setMatchedIds(prev => {
      const without = prev.filter(id => id !== persona.id)
      return [persona.id, ...without].slice(0, 3)
    })
    setActivePersonaIdx(0)
    setShowStylePicker(false)
  }

  // ── Matched persona objects ───────────────────────────────────────────────
  const matchedPersonas = matchedIds
    .map(id => personas.find(p => p.id === id))
    .filter(Boolean)
    .slice(0, 3)

  const activePersona = matchedPersonas[activePersonaIdx] || matchedPersonas[0] || null

  return (
    <aside
      className="relative w-[375px] flex-shrink-0 flex flex-col h-screen bg-[#050608] border-l border-[rgba(46,48,51,0.25)] overflow-hidden"
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >

      {/* AI Assistant header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[#8B5CF6] text-base">✦</span>
          <span className="font-poppins font-light text-white text-[18px]">AI Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onApiKeyClick}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-inter ${
              apiKey
                ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40'
                : 'border-amber-700/40 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40'
            }`}
          >
            {apiKey ? 'Key ✓' : 'Add Key'}
          </button>
          <button className="text-[#8D93A1] hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 min-h-0">
        {messages.length > 1 && (
          <div className="flex justify-end pt-1">
            <button onClick={clearHistory} className="text-[10px] text-[#263040] hover:text-[#8D93A1] transition-colors flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              Clear
            </button>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            msg={msg}
            onEditResult={onEditResult}
            onStartTutorial={handleStartTutorial}
          />
        ))}

        {loading && (
          <div className="flex gap-2 items-start">
            <ThumbBox />
            <div className="bg-[#263040] rounded-[10px] rounded-tl-sm px-3 py-2">
              <div className="flex gap-1 items-center h-4">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1.5 h-1.5 bg-[#8D93A1] rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }}/>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-3 py-2.5 text-red-300 text-[11px] flex items-start justify-between gap-2">
            <span className="leading-snug">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 flex-shrink-0">✕</button>
          </div>
        )}

        {editSession && !loading && (
          <div className="flex justify-center">
            <div className="bg-[#121822] border border-[#263040] rounded-full px-3 py-1 text-[10px] text-[#8D93A1] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]"/>
              Editing <span className="text-white font-medium">{editSession.filename}</span>
              <button onClick={() => setEditSession(null)} className="text-[#263040] hover:text-[#8D93A1] transition-colors">✕</button>
            </div>
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* Pending file preview */}
      {pendingFile && (
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="relative inline-block">
            <img src={pendingFile.previewUrl} className="h-14 rounded-lg object-cover border border-[#263040]" alt="pending"/>
            <button
              onClick={() => setPendingFile(null)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#263040] rounded-full text-[10px] text-white flex items-center justify-center hover:bg-[#374151]"
            >×</button>
          </div>
        </div>
      )}

      {/* Chat input */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 bg-[#263040] rounded-[5px] px-3 py-2.5 border border-transparent focus-within:border-[#8B5CF6]/40 transition-colors">
          <button onClick={() => fileInputRef.current?.click()} className="text-[#8D93A1] hover:text-white transition-colors flex-shrink-0" title="Attach photo">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
            </svg>
          </button>
          <input
            ref={textareaRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ask anything..."
            className="flex-1 bg-transparent outline-none text-[13px] text-[#F7F7F2] placeholder-[#8D93A1] font-opensans"
          />
          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && !pendingFile)}
            className="w-[28px] h-[28px] rounded-md bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Style section ───────────────────────────────────────────────── */}
      <div className="border-t border-[rgba(46,48,51,0.25)] flex-shrink-0">
        <div className="px-5 pt-4 pb-2">
          <p className="font-opensans font-semibold text-white text-[18px]">Style</p>
        </div>

        {/* Photographer profile */}
        {activePersona ? (
          <div className="px-5">
            <div className="flex items-start gap-4 mb-3">
              {/* Avatar circle */}
              <div
                className="w-[72px] h-[72px] rounded-full flex-shrink-0 bg-[#263040] flex items-center justify-center overflow-hidden"
                style={{ border: `2px solid ${PERSONA_COLOR(activePersona.id)}40` }}
              >
                <span className="text-xl font-poppins font-semibold text-white">
                  {activePersona.name?.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[15px] font-opensans font-semibold whitespace-nowrap">{activePersona.name}</p>
                <p className="text-[#8D93A1] text-[11px] font-opensans mt-0.5">{activePersona.era}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(activePersona.keywords?.mood || []).slice(0, 2).map(kw => (
                    <span key={kw} className="bg-[#1e242e] text-white text-[10px] font-opensans font-semibold px-2 py-0.5 rounded-[10px]">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Style persona thumbnails + More Styles button */}
            <div className="flex gap-2 mb-3">
              {matchedPersonas.slice(0, 3).map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setActivePersonaIdx(idx)}
                  className={`flex-1 h-[72px] rounded-[10px] bg-[#263040] overflow-hidden relative transition-all ${
                    idx === activePersonaIdx ? 'ring-2 ring-[#8B5CF6]' : 'opacity-60 hover:opacity-80'
                  }`}
                  style={{ minWidth: 0 }}
                >
                  {cardStates[p.id]?.editedB64 ? (
                    <img
                      src={`data:image/png;base64,${cardStates[p.id].editedB64}`}
                      className="w-full h-full object-cover"
                      alt={p.name}
                    />
                  ) : session?.previewB64 ? (
                    <img
                      src={`data:image/jpeg;base64,${session.previewB64}`}
                      className="w-full h-full object-cover opacity-50"
                      alt={p.name}
                    />
                  ) : (
                    <div className="w-full h-full bg-[#121822]"/>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <p className="text-white text-[9px] truncate font-poppins">{p.name.split(' ').pop()}</p>
                  </div>
                </button>
              ))}
              {/* Placeholder slots */}
              {[...Array(Math.max(0, 3 - matchedPersonas.length))].map((_, i) => (
                <div key={i} className="flex-1 h-[72px] rounded-[10px] bg-[#121822]" style={{ minWidth: 0 }}/>
              ))}
              {/* More Styles button */}
              <button
                onClick={() => setShowStylePicker(true)}
                className="w-[52px] flex-shrink-0 h-[72px] rounded-[10px] bg-[#0d1117] border border-[#1e2633] hover:border-[#8B5CF6]/50 hover:bg-[#111827] transition-all flex flex-col items-center justify-center gap-1 group"
                title="More styles"
              >
                <svg className="w-4 h-4 text-[#8D93A1] group-hover:text-[#a78bfa] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                </svg>
                <span className="text-[8px] font-poppins text-[#8D93A1] group-hover:text-[#a78bfa] transition-colors leading-none">More</span>
              </button>
            </div>

            {/* Apply Style button */}
            <button
              onClick={handleApplyStyle}
              disabled={styleLoading || !session?.previewB64 || !apiKey}
              className="w-full h-[33px] rounded-[10px] text-white text-[14px] font-poppins font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(90deg, #5B1EF6 0%, #FC65FF 100%)' }}
            >
              {styleLoading ? (
                <><div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin"/>Applying…</>
              ) : (
                <><span className="text-[#ee76e8]">✦</span> Apply Style</>
              )}
            </button>

            {/* Start Tutorial — appears once a style has been applied */}
            {(() => {
              const personaId = (matchedIds.length > 0 ? matchedIds : personas.slice(0, 3).map(p => p.id))[activePersonaIdx] || null
              const applied   = cardStates[personaId]
              if (!applied?.editedB64 || !applied?.claudeResult?.tutorial_steps?.length) return null
              return (
                <button
                  onClick={() => handleStartTutorial({ ...session, claudeResult: applied.claudeResult }, activePersona)}
                  className="w-full h-[33px] mt-1 rounded-[10px] text-white text-[13px] font-poppins font-medium transition-colors border border-[#8B5CF6]/50 hover:border-[#8B5CF6] hover:bg-[#8B5CF6]/10 flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5 text-[#8B5CF6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                  </svg>
                  Start Tutorial
                </button>
              )
            })()}
          </div>
        ) : (
          <div className="px-5 pb-4">
            <p className="text-[#8D93A1] text-[12px] font-poppins">
              Upload a photo to see matched styles
            </p>
          </div>
        )}

        <div className="h-4"/>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ── Style picker overlay ──────────────────────────────────────────── */}
      {showStylePicker && (
        <StylePickerPage
          personas={personas}
          selectedId={matchedPersonas[activePersonaIdx]?.id ?? null}
          onSelect={handlePickStyle}
          onBack={() => setShowStylePicker(false)}
        />
      )}
    </aside>
  )
}

// ─── Persona accent colors (subset) ──────────────────────────────────────────
const ACCENT_MAP = {
  saul_leiter: '#c084fc', vivian_maier: '#94a3b8', ansel_adams: '#64748b',
  hiroshi_sugimoto: '#6366f1', fan_ho: '#f59e0b', william_eggleston: '#f43f5e',
  diane_arbus: '#78716c', sebastiao_salgado: '#22d3ee', henri_cartier_bresson: '#84cc16',
  nan_goldin: '#fb7185', cindy_sherman: '#a3e635', ernst_haas: '#fb923c',
  joel_sternfeld: '#38bdf8', stephen_shore: '#fbbf24', alex_webb: '#f97316',
  martin_parr: '#e879f9', gursky_andreas: '#67e8f9', rineke_dijkstra: '#a78bfa',
  dorothea_lange: '#d6d3d1', robert_frank: '#9ca3af',
}
function PERSONA_COLOR(id) { return ACCENT_MAP[id] || '#8B5CF6' }

// ─── Chat bubble component ────────────────────────────────────────────────────
function ThumbBox() {
  return (
    <div className="w-10 h-10 rounded-full flex-shrink-0 self-start overflow-hidden">
      <img src="/bot-avator.png" className="w-full h-full object-cover" alt="AI Assistant" />
    </div>
  )
}

function ChatMessage({ msg, onEditResult, onStartTutorial }) {
  if (msg.role === 'user') {
    return (
      <div className="flex gap-2 justify-end items-end">
        <div className="max-w-[85%] space-y-1.5">
          {msg.image && (
            <img src={msg.image} className="rounded-[10px] rounded-br-sm max-h-36 object-cover ml-auto border border-[#263040]" alt="upload"/>
          )}
          {msg.content && (
            <div className="bg-[#263040] rounded-[10px] rounded-br-sm px-3 py-2 text-[12px] text-white font-poppins font-light">
              {msg.content}
            </div>
          )}
        </div>
        <div className="w-7 h-7 rounded-full bg-[#263040] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 self-end">
          F
        </div>
      </div>
    )
  }

  if (msg.content === '___thinking___') {
    return (
      <div className="flex gap-2 items-start">
        <ThumbBox/>
        <div className="bg-[#263040] rounded-[10px] rounded-tl-sm px-3 py-2 text-[12px] text-[#8D93A1] font-poppins italic">
          Analysing your photo…
        </div>
      </div>
    )
  }

  if (msg.editedB64 && msg.originalB64) {
    return <EditResultBubble msg={msg} onEditResult={onEditResult} onStartTutorial={onStartTutorial}/>
  }

  return (
    <div className="flex gap-2 items-start">
      <ThumbBox/>
      <div className="max-w-[85%] space-y-1.5">
        {msg.thumbnailSrc && (
          <div className="flex gap-2">
            <img src={msg.thumbnailSrc} className="w-[72px] h-[48px] rounded-[8px] object-cover border border-[#263040]" alt=""/>
            <div className="bg-[#263040] rounded-[10px] rounded-tl-sm px-3 py-2 text-[10px] text-white font-poppins font-light leading-relaxed flex-1">
              {msg.content}
            </div>
          </div>
        )}
        {!msg.thumbnailSrc && (
          <div className="bg-[#263040] rounded-[10px] rounded-tl-sm px-3 py-2 text-[12px] text-white font-poppins font-light leading-relaxed">
            {msg.content}
          </div>
        )}
      </div>
    </div>
  )
}

function EditResultBubble({ msg, onEditResult, onStartTutorial }) {
  const navigate = useNavigate()
  const hasTutorial = !!msg.sessionData?.claudeResult?.tutorial_steps?.length

  function handleOpenInEditor() {
    if (msg.sessionData) {
      onEditResult?.(msg.sessionData)
      navigate('/editor')
    }
  }

  function handleStartTutorial() {
    onStartTutorial?.(msg.sessionData, null)
  }

  return (
    <div className="flex gap-2 items-start">
      <ThumbBox/>
      <div className="flex-1 min-w-0 space-y-2">
        {/* Thumbnail + summary */}
        <div className="flex gap-2">
          <img
            src={`data:image/png;base64,${msg.editedB64}`}
            className="w-[80px] h-[54px] rounded-[8px] object-cover border border-[#263040] flex-shrink-0"
            alt="edited"
          />
          <div className="bg-[#263040] rounded-[10px] rounded-tl-sm px-3 py-2 text-[10px] text-white font-poppins font-light leading-relaxed flex-1">
            {msg.content}
          </div>
        </div>

        {/* Mini before/after */}
        <div className="flex gap-1.5">
          <div className="flex-1 relative rounded-[8px] overflow-hidden border border-[#263040]">
            <img src={`data:image/jpeg;base64,${msg.originalB64}`} className="w-full h-[52px] object-cover" alt="before" draggable={false}/>
            <div className="absolute top-1 left-1 bg-black/60 text-white text-[8px] font-semibold px-1 rounded">BEFORE</div>
          </div>
          <div className="flex-1 relative rounded-[8px] overflow-hidden border border-[#8B5CF6]/40">
            <img src={`data:image/png;base64,${msg.editedB64}`} className="w-full h-[52px] object-cover" alt="after" draggable={false}/>
            <div className="absolute top-1 left-1 bg-[#8B5CF6]/80 text-white text-[8px] font-semibold px-1 rounded">AFTER</div>
          </div>
        </div>

        {/* Action buttons */}
        {msg.sessionData && (
          <div className="space-y-1">
            <button
              onClick={handleOpenInEditor}
              className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white py-1.5 rounded-[8px] text-[11px] font-semibold transition-colors font-inter"
            >
              Open in Editor
            </button>
            {hasTutorial && (
              <button
                onClick={handleStartTutorial}
                className="w-full border border-[#8B5CF6]/40 hover:border-[#8B5CF6] hover:bg-[#8B5CF6]/10 text-[#a78bfa] py-1.5 rounded-[8px] text-[11px] font-medium transition-colors font-inter flex items-center justify-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
                Start Tutorial
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
