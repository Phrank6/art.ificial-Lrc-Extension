import { useState, useEffect, useRef, useCallback } from 'react'
import { processImage, PARAM_RANGES, paramLabel, DEFAULT_PARAMS } from '../api'

const CLOSE_THRESHOLD = 0.10  // ±10% of range to count as "close"
const HIT_THRESHOLD = 0.10    // ±10% tolerance to register a "hit"

export default function TutorialMode({
  originalB64,
  filename,
  tutorialSteps,
  initialParams,
  onComplete,
  onBack,
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [stepValues, setStepValues] = useState({})   // { paramName: userValue }
  const [currentValue, setCurrentValue] = useState(0)
  const [hit, setHit] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [editedSrc, setEditedSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  const step = tutorialSteps[stepIndex]
  const range = PARAM_RANGES[step?.param] || { min: -100, max: 100, step: 1 }
  const rangeSpan = range.max - range.min
  const suggested = step?.value ?? 0

  // Normalize to [0,1] for comparison
  function normalizedDist(val, target) {
    return Math.abs(val - target) / rangeSpan
  }

  const isClose = normalizedDist(currentValue, suggested) < CLOSE_THRESHOLD
  const isHit = normalizedDist(currentValue, suggested) < HIT_THRESHOLD

  // Build cumulative params up through previous steps + current
  function buildParams(overrides = {}) {
    const p = { ...DEFAULT_PARAMS, ...initialParams }
    // Apply already-completed steps
    tutorialSteps.slice(0, stepIndex).forEach(s => {
      if (stepValues[s.param] !== undefined) {
        p[s.param] = stepValues[s.param]
      }
    })
    // Apply current step override
    if (step?.param) p[step.param] = overrides[step.param] ?? currentValue
    return p
  }

  // Trigger re-render of edited image
  function scheduleProcess(val) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = buildParams({ [step.param]: val })
        const b64 = await processImage(originalB64, filename, params)
        setEditedSrc(`data:image/png;base64,${b64}`)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }, 250)
  }

  // Initialise on step change
  useEffect(() => {
    setCurrentValue(0)
    setHit(false)
    setUnlocked(false)
    setShowNext(false)
    scheduleProcess(0)
  }, [stepIndex])

  function handleSliderChange(e) {
    const val = parseFloat(e.target.value)
    setCurrentValue(val)
    scheduleProcess(val)

    if (!unlocked && normalizedDist(val, suggested) < HIT_THRESHOLD) {
      setHit(true)
      setUnlocked(true)
      setShowNext(true)
    }
    if (unlocked) {
      setShowNext(true)
    }
  }

  function handleNext() {
    const committed = { ...stepValues, [step.param]: currentValue }
    setStepValues(committed)

    if (stepIndex < tutorialSteps.length - 1) {
      setStepIndex(i => i + 1)
    } else {
      // Build final params and call onComplete
      const finalParams = { ...DEFAULT_PARAMS, ...initialParams }
      tutorialSteps.forEach(s => {
        finalParams[s.param] = committed[s.param] ?? s.value
      })
      onComplete(finalParams)
    }
  }

  if (!step) return null

  const pct = ((currentValue - range.min) / rangeSpan) * 100
  const suggestedPct = ((suggested - range.min) / rangeSpan) * 100

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <button
          onClick={onBack}
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Step dots */}
        <div className="flex gap-2 items-center">
          {tutorialSteps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i < stepIndex
                  ? 'w-2 h-2 bg-violet-400'
                  : i === stepIndex
                  ? 'w-3 h-3 bg-violet-500 ring-2 ring-violet-400/40'
                  : 'w-2 h-2 bg-zinc-700'
              }`}
            />
          ))}
        </div>

        <div className="text-xs text-zinc-500">
          {stepIndex + 1} / {tutorialSteps.length}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: image */}
        <div className="flex-1 flex items-center justify-center p-4 relative bg-zinc-900">
          {editedSrc && (
            <img
              src={editedSrc}
              className="max-h-full max-w-full object-contain rounded-xl"
              alt="current edit"
            />
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
              <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Right: tutorial panel */}
        <div className="w-96 flex flex-col bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
          <div className="p-6 space-y-5 flex-1">
            {/* Param name */}
            <div>
              <div className="text-xs text-violet-400 uppercase tracking-widest font-medium mb-1">
                Step {stepIndex + 1}
              </div>
              <h2 className="text-2xl font-bold text-zinc-100">{paramLabel(step.param)}</h2>
            </div>

            {/* Explanation */}
            <div className="bg-zinc-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">What it does</div>
              <p className="text-sm text-zinc-300 leading-relaxed">{step.explanation}</p>
            </div>

            {/* Reasoning */}
            <div className="bg-violet-950/40 border border-violet-800/40 rounded-xl p-4 space-y-1">
              <div className="text-xs text-violet-400 uppercase tracking-wide font-semibold">Your photo</div>
              <p className="text-sm text-zinc-300 leading-relaxed">{step.reasoning}</p>
            </div>

            {/* Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500 font-medium">{paramLabel(step.param)}</span>
                <span className={`text-sm font-mono font-semibold transition-colors ${
                  isHit ? 'text-emerald-400' : isClose ? 'text-amber-400' : 'text-zinc-300'
                }`}>
                  {step.param === 'exposure' ? currentValue.toFixed(1) : Math.round(currentValue)}
                </span>
              </div>

              {/* Floating badge */}
              {!unlocked && (
                <div
                  className="float-badge flex items-center gap-1.5 bg-amber-400 text-amber-950 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg w-fit"
                  style={{ marginLeft: `${Math.max(0, Math.min(85, suggestedPct - 10))}%` }}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  adjust to {step.param === 'exposure' ? suggested.toFixed(1) : Math.round(suggested)}
                </div>
              )}

              {/* Slider track */}
              <div className="relative pt-3">
                {/* Track background */}
                <div className="h-1 bg-zinc-700 rounded-full relative">
                  {/* Active fill */}
                  <div
                    className="absolute left-0 top-0 h-full bg-violet-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                  {/* Suggested marker dot */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-zinc-900 -translate-x-1/2 transition-all ${
                      hit
                        ? 'bg-emerald-400 scale-110'
                        : 'bg-amber-400 suggested-dot'
                    }`}
                    style={{ left: `${suggestedPct}%` }}
                  />
                </div>

                {/* Actual range input */}
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={currentValue}
                  onChange={handleSliderChange}
                  className="absolute inset-x-0 top-0 w-full opacity-0 h-8 cursor-pointer"
                  style={{ zIndex: 10 }}
                />
              </div>

              <div className="flex justify-between text-xs text-zinc-600">
                <span>{range.min}</span>
                <span>{range.max}</span>
              </div>

              {/* Close/hit feedback */}
              {!unlocked && isClose && !isHit && (
                <div className="text-amber-400 text-xs text-center font-medium animate-pulse">
                  Getting close! Keep going...
                </div>
              )}
              {hit && (
                <div className="text-emerald-400 text-xs text-center font-semibold animate-success-pop">
                  ✓ Nice! Feel free to fine-tune it
                </div>
              )}
            </div>
          </div>

          {/* Next button */}
          <div className="p-6 border-t border-zinc-800">
            {showNext ? (
              <button
                onClick={handleNext}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {stepIndex < tutorialSteps.length - 1 ? (
                  <>
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </>
                ) : (
                  <>
                    Finish Tutorial
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            ) : (
              <div className="text-center text-xs text-zinc-600">
                Move the slider to the suggested value to continue
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
