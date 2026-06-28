import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../AppContext'
import TutorialMode from '../components/TutorialMode'

// ─── Tutorial page (/tutorial) ────────────────────────────────────────────────
// Navigate here with location.state:
// {
//   tutorialSteps:  step[] from claudeResult.tutorial_steps
//   initialParams:  {} from claudeResult.params
//   suggestedCrop:  {} | null from claudeResult.suggested_crop
//   selectedPersona: persona | null
//   originalB64:    string  — preview-sized b64
//   filename:       string
// }

export default function TutorialPage() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const { session, setSession, appendChatMessage } = useApp()

  const state = location.state || {}
  const {
    tutorialSteps   = [],
    initialParams   = {},
    suggestedCrop   = null,
    selectedPersona = null,
  } = state

  // Resolve the image source: prefer state-passed values, fall back to session
  const originalB64 = state.originalB64 || session?.previewB64
  const filename    = state.filename    || session?.filename

  // Redirect if there's nothing to show
  useEffect(() => {
    if (!originalB64 || tutorialSteps.length === 0) navigate('/')
  }, [])

  if (!originalB64 || tutorialSteps.length === 0) return null

  // ── Tutorial finished: go to /editor with final params ──────────────────
  function handleComplete(finalParams) {
    if (session) {
      setSession(prev => ({ ...prev, claudeResult: { ...(prev?.claudeResult || {}), params: finalParams } }))
    }
    navigate('/editor')
  }

  // ── Exit: back to / ──────────────────────────────────────────────────────
  function handleExit() {
    navigate('/')
  }

  // ── Skip to Editor: go to /editor (session already has current params) ───
  function handleSkipToEditor(currentParams) {
    if (session) {
      setSession(prev => ({ ...prev, claudeResult: { ...(prev?.claudeResult || {}), params: currentParams } }))
    }
    navigate('/editor')
  }

  return (
    <div className="h-screen overflow-hidden bg-zinc-950">
      <TutorialMode
        originalB64={originalB64}
        filename={filename}
        tutorialSteps={tutorialSteps}
        initialParams={initialParams}
        suggestedCrop={suggestedCrop}
        selectedPersona={selectedPersona}
        onComplete={handleComplete}
        onExit={handleExit}
        onSkipToEditor={handleSkipToEditor}
      />
    </div>
  )
}
