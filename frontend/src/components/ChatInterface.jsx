/**
 * ChatInterface — persistent chat hub for the AI Photo Editor.
 *
 * Flow:
 * 1. User sends text (general photography Q&A) or uploads photo
 * 2. If photo: AI immediately analyses + proposes an edit
 *    → inline before/after + "Start Tutorial" / "Go to Editor" CTAs
 * 3. User can keep chatting to refine the edit across multiple turns
 * 4. Returning from Tutorial or Editor drops the user back here
 *
 * Props
 * -----
 * apiKey          — Anthropic API key (string)
 * onStartTutorial(session) — navigate to Tutorial mode
 * onGoToEditor(session)    — navigate to Editor mode (params pre-loaded)
 */

import { useState, useRef, useEffect } from 'react'
import {
  fileToBase64,
  createPreviewB64,
  ACCEPTED_TYPES,
  askClaudeChat,
  askClaudeEditMultiturn,
  processImage,
} from '../api'

const STORAGE_KEY = 'ai_photo_editor_chat_v1'

const GREETING = {
  role: 'assistant',
  content: "Hi! I'm your AI photo editing assistant. Upload a photo and I'll analyse it and suggest edits — or just ask me anything about photography!",
}

/** Strip transient / non-serialisable fields before writing to localStorage */
function serializeMessages(msgs) {
  return msgs
    .filter(m => m.content && m.content !== '___thinking___')
    .map(m => {
      // Drop ObjectURLs, base64 blobs, and session data — they expire or are too large
      const { image, editedB64, originalB64, sessionData, ...rest } = m
      return rest
    })
    .filter(m => m.content)  // remove any that become empty after stripping
}

export default function ChatInterface({ apiKey, onStartTutorial, onGoToEditor }) {
  // ── Display messages ──────────────────────────────────────────────────────
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

  // ── Active editing session ────────────────────────────────────────────────
  // claudeApiHistory = [{role, content, attachImage?}] — raw Claude API messages
  const [editSession, setEditSession] = useState(null)  // { previewB64, b64, filename, previewUrl, claudeApiHistory }

  // ── UI state ──────────────────────────────────────────────────────────────
  const [input, setInput]           = useState('')
  const [pendingFile, setPendingFile] = useState(null)  // { file, b64, previewB64, previewUrl }
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  const fileInputRef = useRef(null)
  const bottomRef    = useRef(null)
  const textareaRef  = useRef(null)

  // ── Persist messages ──────────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeMessages(messages)))
    } catch { /* storage full */ }
  }, [messages])

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function clearHistory() {
    setMessages([GREETING])
    setEditSession(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  // ── File loading ──────────────────────────────────────────────────────────
  async function loadFile(file) {
    const previewUrl = URL.createObjectURL(file)
    const b64 = await fileToBase64(file)
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

  // ── Main send handler ─────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    if (!text && !pendingFile) return
    if (!apiKey) {
      setError('Please enter your Anthropic API key first.')
      return
    }

    const photo = pendingFile
    setPendingFile(null)
    setInput('')
    setError(null)

    // Add user message to display
    const userDisplayMsg = {
      role: 'user',
      content: text,
      image: photo?.previewUrl ?? null,
    }
    setMessages(prev => [...prev, userDisplayMsg])

    const activeSession = photo
      ? { previewB64: photo.previewB64, b64: photo.b64, filename: photo.file.name, previewUrl: photo.previewUrl, claudeApiHistory: [] }
      : editSession

    if (photo || editSession) {
      // ── Photo editing path (new or follow-up) ─────────────────────────
      setLoading(true)

      // Build the API history entry for this turn
      const isFirstMessage = !!photo  // new photo = first message, text = follow-up
      const newEntry = {
        role: 'user',
        content: text || (photo ? 'Please edit this photo.' : 'Refine your previous edit.'),
        attachImage: isFirstMessage,
      }

      const prevHistory = photo ? [] : (activeSession?.claudeApiHistory ?? [])
      const updatedHistory = [...prevHistory, newEntry]

      // Add thinking indicator
      setMessages(prev => [...prev, { role: 'assistant', content: '___thinking___' }])

      try {
        // activeSession is always built with .filename and .previewB64 set correctly;
        // avoid accessing photo.filename (the photo obj has .file.name, not .filename)
        const imageB64 = activeSession.previewB64
        const filename  = activeSession.filename

        const result = await askClaudeEditMultiturn(imageB64, updatedHistory, apiKey)
        const editedB64 = await processImage(imageB64, filename, result.params || {})

        // Update edit session with new history (appending assistant response)
        const newSession = {
          previewB64: imageB64,
          b64: (photo ?? activeSession).b64,
          filename,
          previewUrl: (photo ?? activeSession).previewUrl,
          claudeApiHistory: [
            ...updatedHistory,
            { role: 'assistant', content: JSON.stringify(result) },
          ],
        }
        if (photo) setEditSession(newSession)
        else setEditSession(prev => ({ ...prev, claudeApiHistory: newSession.claudeApiHistory }))

        // Build session data for Tutorial/Editor navigation
        const sessionData = {
          originalB64: (photo ?? activeSession).b64,
          previewB64:  imageB64,
          editedB64,
          filename,
          claudeResult: result,
        }

        setMessages(prev => [
          ...prev.filter(m => m.content !== '___thinking___'),
          {
            role: 'assistant',
            content: result.summary || 'Here are my suggested edits.',
            originalB64: imageB64,
            editedB64,
            sessionData,
          },
        ])
      } catch (err) {
        setMessages(prev => prev.filter(m => m.content !== '___thinking___'))
        setError(err.message || 'Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    } else {
      // ── Plain text Q&A (no active photo session) ──────────────────────
      setLoading(true)
      try {
        const chatMsgs = [...messages, userDisplayMsg]
          .filter(m => !m.image && m.content !== '___thinking___' && !m.editedB64)
          .map(m => ({ role: m.role, content: m.content }))

        const reply = await askClaudeChat(chatMsgs, apiKey)
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      } catch (err) {
        setError(err.message || 'Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full"
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length > 1 && (
          <div className="flex justify-end">
            <button
              onClick={clearHistory}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear history
            </button>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message
            key={i}
            msg={msg}
            onStartTutorial={onStartTutorial}
            onGoToEditor={onGoToEditor}
          />
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold flex-shrink-0">AI</div>
            <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-5">
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="leading-snug">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 flex-shrink-0 mt-0.5">✕</button>
            </div>
            {error.includes('lost track') && (
              <button
                onClick={() => { clearHistory(); setError(null) }}
                className="text-xs font-semibold bg-red-700/50 hover:bg-red-700 text-red-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                Clear history &amp; start fresh
              </button>
            )}
          </div>
        )}

        {/* Context pill — shown when follow-ups are active */}
        {editSession && !loading && (
          <div className="flex justify-center">
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-full px-3 py-1.5 text-[11px] text-zinc-400 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              Editing <span className="text-zinc-200 font-medium">{editSession.filename}</span>
              <button
                onClick={() => setEditSession(null)}
                className="text-zinc-600 hover:text-zinc-300 transition-colors ml-1"
                title="Start fresh with a new photo"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Pending image preview */}
      {pendingFile && (
        <div className="px-4 pb-2">
          <div className="relative inline-block">
            <img src={pendingFile.previewUrl} className="h-20 rounded-lg object-cover border border-zinc-700" alt="pending" />
            <button
              onClick={() => setPendingFile(null)}
              className="absolute -top-2 -right-2 w-5 h-5 bg-zinc-600 rounded-full flex items-center justify-center text-xs hover:bg-zinc-500"
            >×</button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-zinc-800 px-4 py-3">
        <div className="flex gap-2 items-end bg-zinc-800 rounded-2xl px-4 py-2 border border-zinc-700 focus-within:border-zinc-500 transition-colors">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0 pb-1"
            title="Attach photo"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              pendingFile
                ? "Describe how you'd like this photo edited…"
                : editSession
                  ? `Refine the edit for ${editSession.filename}…`
                  : 'Ask about photography or attach a photo to edit…'
            }
            className="flex-1 bg-transparent resize-none outline-none text-sm text-zinc-100 placeholder-zinc-500 max-h-32 py-1"
            rows={1}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && !pendingFile)}
            className="flex-shrink-0 pb-1 text-zinc-400 hover:text-violet-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-1 text-center">
          Accepts {ACCEPTED_TYPES.split(',').slice(0, 5).join(' ')} and more · Paste or drag & drop
        </p>
      </div>

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

// ─── Individual message renderer ──────────────────────────────────────────────
function Message({ msg, onStartTutorial, onGoToEditor }) {
  if (msg.role === 'user') {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[80%] space-y-2">
          {msg.image && (
            <img
              src={msg.image}
              className="rounded-2xl rounded-br-sm max-h-48 object-cover ml-auto border border-zinc-700"
              alt="uploaded"
            />
          )}
          {msg.content && (
            <div className="bg-violet-600 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-white">
              {msg.content}
            </div>
          )}
        </div>
        <div className="w-8 h-8 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-bold flex-shrink-0 self-end">You</div>
      </div>
    )
  }

  if (msg.content === '___thinking___') {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold flex-shrink-0">AI</div>
        <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-400 italic">
          Analysing your photo…
        </div>
      </div>
    )
  }

  // Edit result message — shows before/after + action buttons
  if (msg.editedB64 && msg.originalB64) {
    return <EditResultMessage msg={msg} onStartTutorial={onStartTutorial} onGoToEditor={onGoToEditor} />
  }

  // Plain assistant text
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold flex-shrink-0">AI</div>
      <div className="max-w-[82%] bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
        {msg.content}
      </div>
    </div>
  )
}

// ─── Edit result card — inline before/after with CTAs ────────────────────────
function EditResultMessage({ msg, onStartTutorial, onGoToEditor }) {
  function downloadImage(b64, mimeType, suffix) {
    const base = msg.sessionData?.filename?.replace(/\.[^.]+$/, '') || 'photo'
    const a = document.createElement('a')
    a.href = `data:${mimeType};base64,${b64}`
    a.download = `${base}_${suffix}`
    a.click()
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1">AI</div>
      <div className="flex-1 min-w-0 space-y-3">
        {/* Summary text */}
        <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-200 leading-relaxed">
          {msg.content}
        </div>

        {/* Before / After images */}
        <div className="grid grid-cols-2 gap-2">
          {/* Before */}
          <div className="relative rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900">
            <img
              src={`data:image/jpeg;base64,${msg.originalB64}`}
              className="w-full object-cover"
              alt="before"
              draggable={false}
            />
            <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md backdrop-blur-sm">
              BEFORE
            </div>
            <button
              onClick={() => downloadImage(msg.originalB64, 'image/jpeg', 'original.jpg')}
              className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-[10px] font-semibold px-2 py-1 rounded-md backdrop-blur-sm flex items-center gap-1 transition-colors"
              title="Download original"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Save
            </button>
          </div>

          {/* After */}
          <div className="relative rounded-xl overflow-hidden border border-violet-700/50 bg-zinc-900">
            <img
              src={`data:image/png;base64,${msg.editedB64}`}
              className="w-full object-cover"
              alt="after"
              draggable={false}
            />
            <div className="absolute top-2 left-2 bg-violet-600/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md backdrop-blur-sm">
              AFTER
            </div>
            <button
              onClick={() => downloadImage(msg.editedB64, 'image/png', 'edited.png')}
              className="absolute bottom-2 right-2 bg-violet-600/70 hover:bg-violet-600 text-white text-[10px] font-semibold px-2 py-1 rounded-md backdrop-blur-sm flex items-center gap-1 transition-colors"
              title="Download edited"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Save
            </button>
          </div>
        </div>

        {/* Action buttons */}
        {msg.sessionData && (
          <div className="flex gap-2">
            <button
              onClick={() => onStartTutorial(msg.sessionData)}
              className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-violet-600/60 text-zinc-200 hover:text-violet-300 py-2.5 rounded-xl text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Start Tutorial
            </button>
            <button
              onClick={() => onGoToEditor(msg.sessionData)}
              className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Go to Editor
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
