import { useState, useRef, useEffect } from 'react'
import { fileToBase64, ACCEPTED_TYPES, askClaude, askClaudeChat, processImage } from '../api'

const PLACEHOLDER_MESSAGES = [
  { role: 'assistant', content: "Hi! I'm your AI photo editing assistant. Upload a photo and describe what you'd like to achieve — I'll analyze it and create a custom edit for you. Or just ask me anything about photography!" }
]

export default function ChatInterface({ apiKey, onEditingStart }) {
  const [messages, setMessages] = useState(PLACEHOLDER_MESSAGES)
  const [input, setInput] = useState('')
  const [pendingFile, setPendingFile] = useState(null)   // { file, b64, previewUrl }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    fileToBase64(file).then(b64 => {
      setPendingFile({ file, b64, previewUrl })
    })
    e.target.value = ''
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        const previewUrl = URL.createObjectURL(file)
        fileToBase64(file).then(b64 => setPendingFile({ file, b64, previewUrl }))
        break
      }
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    fileToBase64(file).then(b64 => setPendingFile({ file, b64, previewUrl }))
  }

  async function handleSend() {
    if (!input.trim() && !pendingFile) return
    if (!apiKey) {
      setError('Please enter your Anthropic API key in the settings.')
      return
    }

    const userMsg = {
      role: 'user',
      content: input.trim(),
      image: pendingFile ? pendingFile.previewUrl : null,
    }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    const capturedFile = pendingFile
    setPendingFile(null)
    setError(null)
    setLoading(true)

    try {
      if (capturedFile) {
        // Photo editing workflow
        const thinkingMsg = { role: 'assistant', content: '___thinking___' }
        setMessages(prev => [...prev, thinkingMsg])

        const result = await askClaude(capturedFile.b64, userMsg.content || 'Please edit this photo to make it look great.', apiKey)

        // Remove thinking message
        setMessages(prev => prev.filter(m => m.content !== '___thinking___'))

        const summaryMsg = {
          role: 'assistant',
          content: result.summary || 'Here\'s my suggested edit for your photo!',
          editResult: result,
          imageB64: capturedFile.b64,
          filename: capturedFile.file.name,
        }
        setMessages(prev => [...prev, summaryMsg])

        // Kick off backend processing
        const editedB64 = await processImage(capturedFile.b64, capturedFile.file.name, result.params || {})

        onEditingStart({
          originalB64: capturedFile.b64,
          editedB64,
          filename: capturedFile.file.name,
          claudeResult: result,
        })
      } else {
        // Plain chat
        const claudeMsgs = newMessages
          .filter(m => !m.image)
          .map(m => ({ role: m.role, content: m.content }))

        const reply = await askClaudeChat(claudeMsgs, apiKey)
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.content !== '___thinking___'))
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="flex flex-col h-full"
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <Message key={i} msg={msg} />
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
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
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
            placeholder={pendingFile ? "Describe how you'd like this photo edited..." : "Ask about photography or attach a photo to edit..."}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-zinc-100 placeholder-zinc-500 max-h-32 py-1"
            rows={1}
            style={{ height: 'auto' }}
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
          Accepts {ACCEPTED_TYPES.split(',').slice(0, 5).join(' ')} and more • Paste or drag & drop
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

function Message({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[80%] space-y-2">
          {msg.image && (
            <img src={msg.image} className="rounded-2xl rounded-br-sm max-h-48 object-cover ml-auto border border-zinc-700" alt="uploaded" />
          )}
          {msg.content && (
            <div className="bg-violet-600 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-white">
              {msg.content}
            </div>
          )}
        </div>
        <div className="w-8 h-8 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-bold flex-shrink-0">You</div>
      </div>
    )
  }

  if (msg.content === '___thinking___') {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold flex-shrink-0">AI</div>
        <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-400 italic">
          AI is analyzing your photo...
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold flex-shrink-0">AI</div>
      <div className="max-w-[80%] bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
        {msg.content}
      </div>
    </div>
  )
}
