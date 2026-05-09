import { useState } from 'react'
import ChatInterface from './components/ChatInterface'
import BeforeAfterComparison from './components/BeforeAfterComparison'
import TutorialMode from './components/TutorialMode'
import EditorMode from './components/EditorMode'

// Modes: 'chat' | 'compare' | 'tutorial' | 'editor'

export default function App() {
  const [mode, setMode] = useState('chat')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic_api_key') || '')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [editingSession, setEditingSession] = useState(null)
  // { originalB64, editedB64, filename, claudeResult }

  function saveApiKey(key) {
    setApiKey(key)
    localStorage.setItem('anthropic_api_key', key)
    setShowApiKeyInput(false)
  }

  function handleEditingStart(session) {
    setEditingSession(session)
    setMode('compare')
  }

  function handleStartTutorial() {
    setMode('tutorial')
  }

  function handleOpenEditor(presetParams) {
    // presetParams may come from tutorial completion or direct "Open Editor"
    if (presetParams) {
      setEditingSession(s => ({ ...s, initialParams: presetParams }))
    }
    setMode('editor')
  }

  function handleTutorialComplete(finalParams) {
    setEditingSession(s => ({ ...s, initialParams: finalParams }))
    setMode('editor')
  }

  function handleBackToChat() {
    setMode('chat')
  }

  function handleBackToCompare() {
    setMode('compare')
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      {/* Global top bar (only in chat mode) */}
      {mode === 'chat' && (
        <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-semibold text-zinc-100 text-sm">AI Photo Editor</span>
          </div>
          <button
            onClick={() => setShowApiKeyInput(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors border ${
              apiKey
                ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40'
                : 'border-amber-700/50 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40'
            }`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            {apiKey ? 'API Key ✓' : 'Add API Key'}
          </button>
        </header>
      )}

      {/* API key modal */}
      {showApiKeyInput && (
        <ApiKeyModal
          current={apiKey}
          onSave={saveApiKey}
          onClose={() => setShowApiKeyInput(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 min-h-0">
        {mode === 'chat' && (
          <ChatInterface
            apiKey={apiKey}
            onEditingStart={handleEditingStart}
          />
        )}
        {mode === 'compare' && editingSession && (
          <BeforeAfterComparison
            originalB64={editingSession.originalB64}
            editedB64={editingSession.editedB64}
            summary={editingSession.claudeResult?.summary}
            onStartTutorial={handleStartTutorial}
            onOpenEditor={() => handleOpenEditor(editingSession.claudeResult?.params)}
            onBack={handleBackToChat}
          />
        )}
        {mode === 'tutorial' && editingSession && (
          <TutorialMode
            originalB64={editingSession.originalB64}
            filename={editingSession.filename}
            tutorialSteps={editingSession.claudeResult?.tutorial_steps || []}
            initialParams={editingSession.claudeResult?.params || {}}
            onComplete={handleTutorialComplete}
            onBack={handleBackToCompare}
          />
        )}
        {mode === 'editor' && editingSession && (
          <EditorMode
            originalB64={editingSession.originalB64}
            filename={editingSession.filename}
            initialParams={editingSession.initialParams || editingSession.claudeResult?.params || {}}
            onBack={handleBackToCompare}
          />
        )}
      </main>
    </div>
  )
}

function ApiKeyModal({ current, onSave, onClose }) {
  const [value, setValue] = useState(current)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-zinc-100 font-semibold text-lg mb-1">Anthropic API Key</h2>
        <p className="text-zinc-400 text-sm mb-5">
          Your key is stored locally in your browser and never sent to any server. Required for Claude photo analysis.
        </p>
        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition-colors mb-4"
          onKeyDown={e => e.key === 'Enter' && onSave(value)}
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(value)}
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Save Key
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-3 text-center">
          Get yours at <span className="text-violet-400">console.anthropic.com</span>
        </p>
      </div>
    </div>
  )
}
