import { useState, useEffect, useRef, useCallback } from 'react'
import { processImage, PARAM_RANGES, paramLabel, DEFAULT_PARAMS } from '../api'
import CropTool from './CropTool'

const CLOSE_THRESHOLD = 0.10
const HIT_THRESHOLD   = 0.10

const RATIO_OPTIONS = [
  { label: 'Free',  value: 'free' },
  { label: '1:1',   value: '1:1' },
  { label: '4:3',   value: '4:3' },
  { label: '16:9',  value: '16:9' },
  { label: '3:2',   value: '3:2' },
  { label: '4:5',   value: '4:5' },
]

const EMPTY_CROP = { crop_x: null, crop_y: null, crop_w: null, crop_h: null, crop_rotation: 0, crop_ratio: null }

// Synthetic first step — always prepended before Claude's steps
const CROP_STEP = {
  param: '__crop__',
  value: null,
  explanation: 'Crop and rotate your photo to nail the composition before making any colour or tone adjustments.',
  reasoning: 'Getting the framing right first means every subsequent editing decision reinforces your intended composition.',
}

export default function TutorialMode({
  originalB64,
  filename,
  tutorialSteps,
  initialParams,
  suggestedCrop,
  selectedPersona,   // optional — photographer persona
  onComplete,        // (finalParams) → go to editor after finishing all steps
  onExit,            // () → return to chat
  onSkipToEditor,    // (currentParams) → jump straight to editor
}) {
  const allSteps = [CROP_STEP, ...tutorialSteps]

  const [stepIndex, setStepIndex]         = useState(0)
  const [stepValues, setStepValues]       = useState({})
  const [currentValue, setCurrentValue]   = useState(0)
  const [selectedRatio, setSelectedRatio] = useState(null)
  const [hit, setHit]       = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [editedSrc, setEditedSrc] = useState(null)
  const [loading, setLoading]    = useState(false)

  // Before/after split-view slider
  const [splitPos, setSplitPos]         = useState(50)
  const [splitDragging, setSplitDragging] = useState(false)

  // Crop step state
  const [cropState, setCropState]       = useState(EMPTY_CROP)
  const [showCropTool, setShowCropTool] = useState(false)
  const cropStateRef = useRef(EMPTY_CROP)

  // Image natural dimensions — needed for suggested-crop overlay
  const [imgNaturalSize, setImgNaturalSize] = useState(null)
  const imgContainerRef = useRef(null)

  const debounceRef = useRef(null)
  const abortRef    = useRef(null)

  // When going back, store the value to restore so the useEffect can pick it up.
  // null = going forward (fresh start); any other value = going back (restore).
  const restoreValueRef = useRef(null)

  const step        = allSteps[stepIndex]
  const isCropStep  = step?.param === '__crop__'
  const isCropRatio = step?.param === 'crop_ratio'

  const range     = !isCropStep && !isCropRatio ? (PARAM_RANGES[step?.param] || { min: -100, max: 100, step: 1 }) : null
  const rangeSpan = range ? range.max - range.min : 1
  const suggested = step?.value ?? 0

  function normalizedDist(val, target) { return Math.abs(val - target) / rangeSpan }
  const isClose = !isCropStep && !isCropRatio && normalizedDist(currentValue, suggested) < CLOSE_THRESHOLD
  const isHit   = !isCropStep && !isCropRatio && normalizedDist(currentValue, suggested) < HIT_THRESHOLD

  // ── build cumulative params ───────────────────────────────────────────────
  function buildParams(overrides = {}) {
    const p = { ...DEFAULT_PARAMS, ...initialParams, ...cropStateRef.current }
    allSteps.slice(1, stepIndex).forEach(s => {
      if (stepValues[s.param] !== undefined) p[s.param] = stepValues[s.param]
    })
    if (!isCropStep && step?.param) {
      p[step.param] = overrides[step.param] ?? (isCropRatio ? selectedRatio : currentValue)
    }
    return p
  }

  // ── fire backend request ──────────────────────────────────────────────────
  function scheduleProcess(override = {}) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const params = buildParams(override)
        const b64 = await processImage(originalB64, filename, params, controller.signal)
        if (!controller.signal.aborted) setEditedSrc(`data:image/jpeg;base64,${b64}`)
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 120)
  }

  // ── reset / restore on step change ───────────────────────────────────────
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const restore = restoreValueRef.current
    restoreValueRef.current = null   // consume

    setHit(false)
    setUnlocked(false)

    if (restore !== null && restore !== undefined) {
      // ── Going back: restore the committed value for this step ──
      if (isCropRatio) {
        setSelectedRatio(restore)
        scheduleProcess({ crop_ratio: restore })
      } else if (!isCropStep) {
        setCurrentValue(typeof restore === 'number' ? restore : 0)
        scheduleProcess({ [step?.param]: restore })
      } else {
        scheduleProcess()  // crop step — no value to restore
      }
    } else {
      // ── Going forward: start fresh at zero ──
      setCurrentValue(0)
      setSelectedRatio(null)
      scheduleProcess(
        isCropStep  ? {} :
        isCropRatio ? { crop_ratio: null } :
                      { [step?.param]: 0 }
      )
    }
  }, [stepIndex])

  // ── numeric slider ────────────────────────────────────────────────────────
  function handleSliderChange(e) {
    const val = parseFloat(e.target.value)
    setCurrentValue(val)
    scheduleProcess({ [step.param]: val })
    if (!unlocked && normalizedDist(val, suggested) < HIT_THRESHOLD) {
      setHit(true); setUnlocked(true)
    }
  }

  // ── crop ratio ────────────────────────────────────────────────────────────
  function handleRatioSelect(ratio) {
    setSelectedRatio(ratio)
    scheduleProcess({ crop_ratio: ratio })
    const isMatch = ratio === suggested || (ratio === 'free' && !suggested)
    if (isMatch) { setHit(true); setUnlocked(true) }
  }

  // ── crop tool handlers ────────────────────────────────────────────────────
  function handleCropToolChange(crop) {
    cropStateRef.current = crop
  }

  function handleCropToolClose() {
    const committed = cropStateRef.current
    setCropState(committed)
    setShowCropTool(false)
    scheduleProcess()
  }

  function handleAcceptSuggested() {
    if (!suggestedCrop) return
    const crop = {
      crop_x: suggestedCrop.crop_x, crop_y: suggestedCrop.crop_y,
      crop_w: suggestedCrop.crop_w, crop_h: suggestedCrop.crop_h,
      crop_rotation: suggestedCrop.crop_rotation ?? 0,
      crop_ratio: null,
    }
    cropStateRef.current = crop
    setCropState(crop)
    scheduleProcess()
  }

  function handleOpenCropTool() {
    if (cropStateRef.current.crop_x == null) {
      if (suggestedCrop) {
        // Pre-fill from Claude's suggested crop
        const pre = {
          crop_x: suggestedCrop.crop_x, crop_y: suggestedCrop.crop_y,
          crop_w: suggestedCrop.crop_w, crop_h: suggestedCrop.crop_h,
          crop_rotation: suggestedCrop.crop_rotation ?? 0,
          crop_ratio: null,
        }
        cropStateRef.current = pre
        setCropState(pre)
      } else if (selectedPersona?.suggestedRotation) {
        // No Claude crop but persona has a characteristic rotation — pre-fill it
        const pre = {
          ...EMPTY_CROP,
          crop_rotation: selectedPersona.suggestedRotation,
        }
        cropStateRef.current = pre
        setCropState(pre)
      }
    }
    setShowCropTool(true)
  }

  // ── split-view drag ───────────────────────────────────────────────────────
  function updateSplit(clientX) {
    const rect = imgContainerRef.current?.getBoundingClientRect()
    if (!rect) return
    setSplitPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
  }

  // ── commit step & advance (Next) ──────────────────────────────────────────
  function commitAndAdvance(skipToSuggested = false) {
    let newStepValues = stepValues
    if (!isCropStep) {
      let value
      if (isCropRatio) {
        value = skipToSuggested ? (suggested || 'free') : (selectedRatio ?? suggested ?? 'free')
      } else {
        value = skipToSuggested ? suggested : currentValue
      }
      newStepValues = { ...stepValues, [step.param]: value }
      setStepValues(newStepValues)
    }

    if (stepIndex < allSteps.length - 1) {
      setStepIndex(i => i + 1)
    } else {
      const finalParams = { ...DEFAULT_PARAMS, ...initialParams, ...cropStateRef.current }
      tutorialSteps.forEach(s => {
        finalParams[s.param] = newStepValues[s.param] ?? s.value
      })
      onComplete(finalParams)
    }
  }

  // ── go back one step, restoring the committed value ───────────────────────
  function handlePrevious() {
    if (stepIndex === 0) return
    const prevStep = allSteps[stepIndex - 1]
    const prevIsCropStep = prevStep.param === '__crop__'

    if (!prevIsCropStep) {
      const prevIsCropRatio = prevStep.param === 'crop_ratio'
      // Default: 0 for numerics, null for crop ratio
      const defaultVal = prevIsCropRatio ? null : 0
      restoreValueRef.current = stepValues[prevStep.param] ?? defaultVal
    } else {
      restoreValueRef.current = null   // crop step needs no value restore
    }

    setStepIndex(i => i - 1)
  }

  function handleNext() { commitAndAdvance(false) }
  function handleSkip() { commitAndAdvance(true)  }

  /** Snapshot current state as editor params — used by Skip to Editor */
  function getCurrentParams() {
    const p = { ...DEFAULT_PARAMS, ...initialParams, ...cropStateRef.current }
    allSteps.slice(1, stepIndex + 1).forEach(s => {
      if (stepValues[s.param] !== undefined) p[s.param] = stepValues[s.param]
      else if (!isCropStep && s.param === step?.param) {
        // Include the currently-being-edited value
        p[s.param] = isCropRatio ? (selectedRatio ?? s.value) : currentValue
      }
    })
    return p
  }

  if (!step) return null

  const pct          = range ? ((currentValue - range.min) / rangeSpan) * 100 : 0
  const suggestedPct = range ? ((suggested     - range.min) / rangeSpan) * 100 : 0

  const originalSrc = `data:image/jpeg;base64,${originalB64}`
  const hasCrop = cropState.crop_x != null || cropState.crop_rotation !== 0 || cropState.crop_ratio

  const cropExplanation = suggestedCrop?.explanation || CROP_STEP.explanation
  const cropReasoning   = suggestedCrop?.reasoning   || CROP_STEP.reasoning

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex flex-col border-b border-zinc-800">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Exit → back to chat */}
          <button
            onClick={onExit}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm flex items-center gap-1.5 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Exit
          </button>

          {/* Progress dots */}
          <div className="flex gap-2 items-center">
            {allSteps.map((_, i) => (
              <div key={i} className={`rounded-full transition-all duration-300 ${
                i < stepIndex     ? 'w-2 h-2 bg-violet-400'
                : i === stepIndex ? 'w-3 h-3 bg-violet-500 ring-2 ring-violet-400/40'
                : 'w-2 h-2 bg-zinc-700'
              }`} />
            ))}
            <span className="text-xs text-zinc-500 ml-1">{stepIndex + 1}/{allSteps.length}</span>
          </div>

          {/* Skip to Editor */}
          <button
            onClick={() => onSkipToEditor(getCurrentParams())}
            className="text-zinc-400 hover:text-violet-300 transition-colors text-xs flex items-center gap-1.5 flex-shrink-0 border border-zinc-700 hover:border-violet-600/60 rounded-lg px-2.5 py-1.5"
          >
            Skip to Editor
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Persona context bar */}
        {selectedPersona && (
          <div
            className="mx-6 mb-3 px-3 py-2 rounded-xl border flex items-center gap-2.5"
            style={{
              background: `${selectedPersona.accentColor}18`,
              borderColor: `${selectedPersona.accentColor}40`,
            }}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selectedPersona.accentColor }} />
            <div className="min-w-0">
              <span className="text-xs font-semibold" style={{ color: selectedPersona.accentColor }}>
                {selectedPersona.name}
              </span>
              {selectedPersona.era && selectedPersona.era !== 'Custom' && (
                <span className="text-xs text-zinc-500 ml-1.5">{selectedPersona.era}</span>
              )}
              {selectedPersona.description && (
                <p className="text-[11px] text-zinc-400 truncate leading-tight mt-0.5">
                  {selectedPersona.description}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Image area — split before/after view ── */}
        <div
          ref={imgContainerRef}
          className={`flex-1 relative bg-zinc-900 overflow-hidden select-none ${editedSrc ? 'cursor-col-resize' : ''}`}
          onMouseDown={e => { if (!editedSrc) return; e.preventDefault(); setSplitDragging(true); updateSplit(e.clientX) }}
          onMouseMove={e => { if (!splitDragging) return; updateSplit(e.clientX) }}
          onMouseUp={() => setSplitDragging(false)}
          onMouseLeave={() => setSplitDragging(false)}
        >
          {/* Original — always visible; clipped to the left of the split */}
          <img
            src={originalSrc}
            className="absolute inset-0 w-full h-full object-contain bg-zinc-900"
            alt="original"
            draggable={false}
            onLoad={e => setImgNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />

          {/* Edited — clipped to the right of the split */}
          {editedSrc && (
            <img
              src={editedSrc}
              className="absolute inset-0 w-full h-full object-contain bg-zinc-900"
              style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
              alt="current edit"
              draggable={false}
            />
          )}

          {/* Split divider + handle */}
          {editedSrc && (
            <div
              className="absolute top-0 bottom-0 w-px bg-white/50 pointer-events-none"
              style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow-xl flex items-center justify-center pointer-events-auto cursor-col-resize">
                <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3M16 9l3 3-3 3"/>
                </svg>
              </div>
            </div>
          )}

          {/* Before / After labels */}
          {editedSrc && (
            <>
              <div className="absolute top-3 left-3 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded pointer-events-none">
                BEFORE
              </div>
              <div className="absolute top-3 right-3 bg-violet-600/80 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded pointer-events-none">
                AFTER
              </div>
            </>
          )}

          {/* Suggested-crop frame overlay — from Claude or from persona default ratio */}
          {isCropStep && !hasCrop && imgNaturalSize && (
            suggestedCrop ? (
              <SuggestedCropOverlay
                containerRef={imgContainerRef}
                imgNaturalSize={imgNaturalSize}
                suggestedCrop={suggestedCrop}
              />
            ) : selectedPersona?.suggestedCropRatio ? (
              <PersonaCropOverlay
                containerRef={imgContainerRef}
                imgNaturalSize={imgNaturalSize}
                cropRatio={selectedPersona.suggestedCropRatio}
                suggestedRotation={selectedPersona.suggestedRotation || 0}
                accent={selectedPersona.accentColor}
              />
            ) : null
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
              <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {isCropStep && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <button
                onClick={handleOpenCropTool}
                className={`backdrop-blur-sm text-sm px-4 py-2 rounded-xl flex items-center gap-2 border transition-colors ${
                  hasCrop
                    ? 'bg-violet-600/80 hover:bg-violet-500 border-violet-500 text-white'
                    : 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-zinc-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                {hasCrop ? 'Adjust Crop' : 'Crop & Rotate'}
                {hasCrop && <span className="w-2 h-2 rounded-full bg-white/70" />}
              </button>
            </div>
          )}
        </div>

        {/* ── Tutorial panel ── */}
        <div className="w-96 flex flex-col bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
          <div className="p-6 space-y-5 flex-1">
            <div>
              <div className="text-xs text-violet-400 uppercase tracking-widest font-medium mb-1">Step {stepIndex + 1}</div>
              <h2 className="text-2xl font-bold text-zinc-100">
                {isCropStep ? 'Crop & Rotate' : paramLabel(step.param)}
              </h2>
            </div>

            <div className="bg-zinc-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">What it does</div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {isCropStep ? cropExplanation : step.explanation}
              </p>
            </div>

            <div className="bg-violet-950/40 border border-violet-800/40 rounded-xl p-4 space-y-1">
              <div className="text-xs text-violet-400 uppercase tracking-wide font-semibold">Your photo</div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {isCropStep ? cropReasoning : step.reasoning}
              </p>
            </div>

            {/* ── Crop step ─────────────────────────────────────────── */}
            {isCropStep ? (
              <div className="space-y-3">
                {suggestedCrop && (
                  <button
                    onClick={handleAcceptSuggested}
                    className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors bg-amber-500 hover:bg-amber-400 text-amber-950 border border-amber-400"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {hasCrop ? 'Reset to Suggested Crop' : 'Accept Suggested Crop'}
                  </button>
                )}
                <button
                  onClick={handleOpenCropTool}
                  className={`w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors border ${
                    hasCrop
                      ? 'bg-violet-600 hover:bg-violet-500 border-violet-500 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  {hasCrop ? 'Adjust Crop & Rotate' : 'Open Crop & Rotate Tool'}
                  {hasCrop && <span className="w-2 h-2 rounded-full bg-white/70" />}
                </button>
                {hasCrop ? (
                  <p className="text-xs text-emerald-400 text-center font-semibold">✓ Crop applied — click Next to continue</p>
                ) : (
                  <p className="text-xs text-zinc-500 text-center">
                    {suggestedCrop
                      ? 'The suggested frame is shown on your photo above'
                      : selectedPersona?.suggestedCropRatio || selectedPersona?.suggestedRotation
                        ? [
                            selectedPersona.suggestedCropRatio && `${selectedPersona.name} typically shoots ${selectedPersona.suggestedCropRatio}`,
                            selectedPersona.suggestedRotation
                              ? `${selectedPersona.suggestedRotation > 0 ? '+' : ''}${selectedPersona.suggestedRotation}° rotation pre-filled`
                              : null,
                          ].filter(Boolean).join(' · ')
                        : 'Optional — click Next to skip cropping'}
                  </p>
                )}
              </div>

            ) : isCropRatio ? (
              <CropRatioStep suggested={suggested} selected={selectedRatio} hit={hit} onSelect={handleRatioSelect} />

            ) : (
              /* ── Numeric slider step ──────────────────────────────── */
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500 font-medium">{paramLabel(step.param)}</span>
                  <span className={`text-sm font-mono font-semibold transition-colors ${
                    isHit ? 'text-emerald-400' : isClose ? 'text-amber-400' : 'text-zinc-300'
                  }`}>
                    {step.param === 'exposure' ? currentValue.toFixed(1) : Math.round(currentValue)}
                  </span>
                </div>

                {!unlocked && (
                  <div
                    className="float-badge flex items-center gap-1.5 bg-amber-400 text-amber-950 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg w-fit"
                    style={{ marginLeft: `${Math.max(0, Math.min(85, suggestedPct - 10))}%` }}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    adjust to {step.param === 'exposure' ? Number(suggested).toFixed(1) : Math.round(suggested)}
                  </div>
                )}

                <div className="relative py-3">
                  <div className="h-3 bg-zinc-700 rounded-full relative">
                    <div className="absolute left-0 top-0 h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-zinc-900 -translate-x-1/2 transition-all ${
                        hit ? 'bg-emerald-400 scale-110' : 'bg-amber-400 suggested-dot'
                      }`}
                      style={{ left: `${suggestedPct}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={range.min} max={range.max} step={range.step}
                    value={currentValue}
                    onChange={handleSliderChange}
                    className="absolute inset-x-0 inset-y-0 w-full opacity-0 cursor-pointer"
                    style={{ zIndex: 10 }}
                  />
                </div>

                <div className="flex justify-between text-xs text-zinc-600">
                  <span>{range.min}</span><span>{range.max}</span>
                </div>

                {!unlocked && isClose && !isHit && (
                  <div className="text-amber-400 text-xs text-center font-medium animate-pulse">Getting close! Keep going...</div>
                )}
                {hit && (
                  <div className="text-emerald-400 text-xs text-center font-semibold">✓ Nice! Feel free to fine-tune it</div>
                )}
              </div>
            )}
          </div>

          {/* ── Bottom buttons ── */}
          <div className="p-6 border-t border-zinc-800 space-y-2">
            {/* Previous + Next row */}
            <div className="flex gap-2">
              {/* BUG 2 FIX: Previous button — hidden on step 1 */}
              {stepIndex > 0 && (
                <button
                  onClick={handlePrevious}
                  className="flex-shrink-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-3 rounded-xl transition-colors flex items-center"
                  title="Previous step"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {stepIndex < allSteps.length - 1 ? (
                  <>Next <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></>
                ) : (
                  <>Finish Tutorial <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></>
                )}
              </button>
            </div>

            {/* Skip — hidden on crop step */}
            {!isCropStep && (
              <button
                onClick={handleSkip}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                Skip (use suggested)
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {showCropTool && (
        <CropTool
          imageSrc={originalSrc}
          cropParams={cropStateRef.current}
          onChange={handleCropToolChange}
          onClose={handleCropToolClose}
          suggestedCrop={suggestedCrop}
        />
      )}
    </div>
  )
}

// ── Persona-default crop ratio overlay ───────────────────────────────────────
// Shows a centred crop guide derived from the persona's suggestedCropRatio.
function PersonaCropOverlay({ containerRef, imgNaturalSize, cropRatio, suggestedRotation, accent }) {
  const [frame, setFrame] = useState(null)

  const recalculate = useCallback(() => {
    const container = containerRef.current
    if (!container || !imgNaturalSize) return
    const { width: cW, height: cH } = container.getBoundingClientRect()
    if (!cW || !cH) return
    const { w: iW, h: iH } = imgNaturalSize
    const scale = Math.min(cW / iW, cH / iH)
    const rW = iW * scale
    const rH = iH * scale
    const oX = (cW - rW) / 2
    const oY = (cH - rH) / 2

    // Parse ratio string e.g. '3:2', '1:1', '16:9'
    const [rNum, rDen] = cropRatio.split(':').map(Number)
    const targetAspect = rNum / rDen
    const imgAspect    = iW / iH

    let cropW, cropH
    if (targetAspect >= imgAspect) {
      // Wider than image — constrain to full width
      cropW = rW
      cropH = rW / targetAspect
    } else {
      // Taller than image — constrain to full height
      cropH = rH
      cropW = rH * targetAspect
    }
    // Clamp so crop never exceeds rendered image bounds
    cropW = Math.min(cropW, rW)
    cropH = Math.min(cropH, rH)

    const left = oX + (rW - cropW) / 2
    const top  = oY + (rH - cropH) / 2
    setFrame({ left, top, width: cropW, height: cropH, cW, cH })
  }, [containerRef, imgNaturalSize, cropRatio])

  useEffect(() => {
    recalculate()
    const observer = new ResizeObserver(recalculate)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [recalculate])

  if (!frame) return null
  const { left, top, width, height } = frame
  const borderCol = accent || '#a78bfa'

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute bg-black/45" style={{ left: 0, top: 0, right: 0, height: top }} />
      <div className="absolute bg-black/45" style={{ left: 0, top: top + height, right: 0, bottom: 0 }} />
      <div className="absolute bg-black/45" style={{ left: 0, top, width: left, height }} />
      <div className="absolute bg-black/45" style={{ left: left + width, top, right: 0, height }} />
      <div className="absolute border-2 border-dashed" style={{ left, top, width, height, borderColor: `${borderCol}cc` }} />
      {[
        { style: { left, top },                              cls: 'border-t-2 border-l-2' },
        { style: { left: left + width - 16, top },           cls: 'border-t-2 border-r-2' },
        { style: { left, top: top + height - 16 },           cls: 'border-b-2 border-l-2' },
        { style: { left: left + width - 16, top: top + height - 16 }, cls: 'border-b-2 border-r-2' },
      ].map((c, i) => (
        <div key={i} className={`absolute w-4 h-4 ${c.cls}`} style={{ ...c.style, borderColor: borderCol }} />
      ))}
      <div
        className="absolute text-white text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1.5"
        style={{ left, top: Math.max(0, top - 28), background: `${borderCol}cc` }}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
        {cropRatio} guide
        {suggestedRotation ? (
          <span className="opacity-80">
            · {suggestedRotation > 0 ? '+' : ''}{suggestedRotation}°
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ── Suggested-crop frame overlay ──────────────────────────────────────────────
function SuggestedCropOverlay({ containerRef, imgNaturalSize, suggestedCrop }) {
  const [frame, setFrame] = useState(null)

  const recalculate = useCallback(() => {
    const container = containerRef.current
    if (!container || !imgNaturalSize) return
    const { width: cW, height: cH } = container.getBoundingClientRect()
    if (!cW || !cH) return
    const { w: iW, h: iH } = imgNaturalSize
    const scale = Math.min(cW / iW, cH / iH)
    const rW = iW * scale
    const rH = iH * scale
    const oX = (cW - rW) / 2
    const oY = (cH - rH) / 2
    const { crop_x, crop_y, crop_w, crop_h } = suggestedCrop
    setFrame({
      left:   oX + (crop_x / 100) * rW,
      top:    oY + (crop_y / 100) * rH,
      width:  (crop_w / 100) * rW,
      height: (crop_h / 100) * rH,
      cW, cH,
    })
  }, [containerRef, imgNaturalSize, suggestedCrop])

  useEffect(() => {
    recalculate()
    const observer = new ResizeObserver(recalculate)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [recalculate])

  if (!frame) return null
  const { left, top, width, height } = frame

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute bg-black/55" style={{ left: 0, top: 0, right: 0, height: top }} />
      <div className="absolute bg-black/55" style={{ left: 0, top: top + height, right: 0, bottom: 0 }} />
      <div className="absolute bg-black/55" style={{ left: 0, top, width: left, height }} />
      <div className="absolute bg-black/55" style={{ left: left + width, top, right: 0, height }} />
      <div className="absolute border-2 border-dashed border-white/90" style={{ left, top, width, height }} />
      {[
        { style: { left, top },                             cls: 'border-t-2 border-l-2' },
        { style: { left: left + width - 16, top },          cls: 'border-t-2 border-r-2' },
        { style: { left, top: top + height - 16 },          cls: 'border-b-2 border-l-2' },
        { style: { left: left + width - 16, top: top + height - 16 }, cls: 'border-b-2 border-r-2' },
      ].map((c, i) => (
        <div key={i} className={`absolute w-4 h-4 border-white ${c.cls}`} style={c.style} />
      ))}
      <div
        className="absolute bg-amber-400 text-amber-950 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1"
        style={{ left, top: Math.max(0, top - 28) }}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        AI Suggested
      </div>
    </div>
  )
}

// ── Crop ratio step sub-component ─────────────────────────────────────────────
function CropRatioStep({ suggested, selected, hit, onSelect }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 font-medium">Aspect Ratio</span>
        {suggested && <span className="text-xs text-amber-400 font-semibold">suggested: {suggested}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {RATIO_OPTIONS.map(r => {
          const isSuggested = r.value === suggested
          const isSelected  = r.value === selected
          return (
            <button
              key={r.value}
              onClick={() => onSelect(r.value)}
              className={`relative py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                isSelected && hit  ? 'bg-emerald-600 border-emerald-500 text-white'
                : isSelected       ? 'bg-violet-600 border-violet-500 text-white'
                : isSuggested      ? 'bg-zinc-800 border-amber-500/60 text-zinc-200'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {r.label}
              {isSuggested && !isSelected && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 suggested-dot" />
              )}
            </button>
          )
        })}
      </div>
      {!selected && <p className="text-xs text-zinc-600 text-center">Select an aspect ratio — the suggested one is highlighted</p>}
      {selected && !hit && <p className="text-xs text-zinc-400 text-center">Try <span className="text-amber-400 font-semibold">{suggested}</span> for the suggested crop</p>}
      {hit && <p className="text-xs text-emerald-400 text-center font-semibold">✓ Nice! That's the suggested ratio</p>}
    </div>
  )
}
