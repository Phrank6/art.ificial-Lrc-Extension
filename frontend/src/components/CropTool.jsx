import { useState, useRef, useCallback, useEffect } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

const RATIOS = [
  { label: 'Free',  value: null },
  { label: '1:1',   value: 1 },
  { label: '4:3',   value: 4 / 3 },
  { label: '16:9',  value: 16 / 9 },
  { label: '3:2',   value: 3 / 2 },
  { label: '4:5',   value: 4 / 5 },
]

function makeCenteredCrop(aspect, imgWidth, imgHeight) {
  if (!aspect) return { unit: '%', x: 10, y: 10, width: 80, height: 80 }
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 85 }, aspect, imgWidth, imgHeight),
    imgWidth,
    imgHeight,
  )
}

// Render the source image rotated by `angle` degrees (clockwise) onto an
// offscreen canvas and return a JPEG data-URL.  Matches Pillow's
// img.rotate(-angle, expand=True) which also rotates clockwise.
function renderRotatedCanvas(img, angle) {
  if (angle === 0) return null     // caller uses original imageSrc
  const θ = (angle * Math.PI) / 180
  const cos = Math.abs(Math.cos(θ))
  const sin = Math.abs(Math.sin(θ))
  const W = img.naturalWidth
  const H = img.naturalHeight
  const rW = Math.round(W * cos + H * sin)
  const rH = Math.round(W * sin + H * cos)
  const canvas = document.createElement('canvas')
  canvas.width  = rW
  canvas.height = rH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, rW, rH)
  ctx.save()
  ctx.translate(rW / 2, rH / 2)
  ctx.rotate(θ)
  ctx.drawImage(img, -W / 2, -H / 2, W, H)
  ctx.restore()
  return canvas.toDataURL('image/jpeg', 0.88)
}

export default function CropTool({ imageSrc, cropParams, onChange, onClose, suggestedCrop }) {
  const initCrop = (cropParams.crop_x != null)
    ? { unit: '%', x: cropParams.crop_x, y: cropParams.crop_y,
        width: cropParams.crop_w, height: cropParams.crop_h }
    : null

  const [crop, setCrop]         = useState(initCrop)
  const [rotation, setRotation] = useState(cropParams.crop_rotation ?? 0)
  const [imgSize, setImgSize]   = useState({ w: 1, h: 1 })

  // The URL shown inside ReactCrop — starts as the original, updated to a
  // canvas-rendered rotated version whenever the rotation slider changes.
  const [displaySrc, setDisplaySrc] = useState(imageSrc)

  // Aspect ratio state (Bug 5 orientation toggle)
  const [ratioValue, setRatioValue]   = useState(null)
  const [orientation, setOrientation] = useState('landscape')
  const lockedAspect = ratioValue == null ? null
    : orientation === 'portrait' ? 1 / ratioValue
    : ratioValue
  const canToggleOrientation = ratioValue !== null && ratioValue !== 1

  // Hidden source <img> used only for canvas drawing — never shown in the UI.
  const sourceImgRef   = useRef(null)
  const rotationTimer  = useRef(null)

  // ── Rotate the canvas whenever the source image loads or rotation changes ──
  const applyCanvasRotation = useCallback((angle) => {
    const img = sourceImgRef.current
    if (!img || !img.complete || img.naturalWidth === 0) return
    if (angle === 0) {
      setDisplaySrc(imageSrc)
      return
    }
    const dataUrl = renderRotatedCanvas(img, angle)
    if (dataUrl) setDisplaySrc(dataUrl)
  }, [imageSrc])

  // Apply initial rotation once the hidden source image loads
  function onSourceLoad() {
    if (rotation !== 0) applyCanvasRotation(rotation)
  }

  // Debounce canvas re-render to ~60 ms so slider movement feels instant
  // but we don't thrash the canvas on every pixel.
  function handleRotationChange(e) {
    const val = parseFloat(e.target.value)
    setRotation(val)
    if (rotationTimer.current) clearTimeout(rotationTimer.current)
    rotationTimer.current = setTimeout(() => applyCanvasRotation(val), 60)
  }

  // ── ReactCrop image onLoad — capture natural dimensions ──────────────────
  function onImageLoad(e) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    setImgSize({ w, h })
    // Only auto-initialise crop on the very first load (when no crop is set)
    if (!crop) setCrop(makeCenteredCrop(lockedAspect, w, h))
  }

  // ── Aspect ratio / orientation ────────────────────────────────────────────
  function handleAspectChange(value) {
    setRatioValue(value)
    setOrientation('landscape')
    setCrop(makeCenteredCrop(value, imgSize.w, imgSize.h))
  }

  function handleToggleOrientation() {
    if (!canToggleOrientation) return
    const newOri    = orientation === 'landscape' ? 'portrait' : 'landscape'
    const newAspect = newOri === 'portrait' ? 1 / ratioValue : ratioValue
    setOrientation(newOri)
    setCrop(makeCenteredCrop(newAspect, imgSize.w, imgSize.h))
  }

  // ── Apply / Reset ─────────────────────────────────────────────────────────
  function handleApply() {
    if (!crop) { onClose(); return }
    onChange({
      crop_x: crop.x, crop_y: crop.y,
      crop_w: crop.width, crop_h: crop.height,
      crop_rotation: rotation,
      crop_ratio: null,
    })
    onClose()
  }

  function handleReset() {
    onChange({ crop_x: null, crop_y: null, crop_w: null, crop_h: null,
               crop_rotation: 0, crop_ratio: null })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col backdrop-blur-sm">
      {/* Hidden source image for canvas drawing */}
      <img
        ref={sourceImgRef}
        src={imageSrc}
        onLoad={onSourceLoad}
        style={{ display: 'none' }}
        alt=""
        crossOrigin="anonymous"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
        <button onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>
        <h2 className="text-sm font-semibold text-zinc-100">Crop & Rotate</h2>
        <button onClick={handleApply}
          className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors">
          Apply
        </button>
      </div>

      {/*
        The image fed to ReactCrop is already a pre-rotated canvas render —
        no CSS transform is applied to the element.  This means ReactCrop's
        axis-aligned handles are correct with respect to the displayed image,
        and the crop percentages refer to the rotated image's own dimensions,
        which is exactly what the backend expects (it rotates first, then crops).
      */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-6 overflow-hidden">
        <div style={{ maxWidth: '100%', maxHeight: '100%', position: 'relative', display: 'inline-block' }}>
          <ReactCrop
            crop={crop}
            onChange={(_, pct) => setCrop(pct)}
            aspect={lockedAspect ?? undefined}
            className="max-h-full"
          >
            <img
              src={displaySrc}
              onLoad={onImageLoad}
              style={{ maxHeight: 'calc(100vh - 260px)', maxWidth: '100%', display: 'block' }}
              alt="crop preview"
              draggable={false}
            />
          </ReactCrop>
          {/* Dashed amber overlay showing AI-suggested crop position */}
          {suggestedCrop && imgSize.w > 1 && rotation === 0 && (
            <div
              className="absolute pointer-events-none"
              style={{
                left:   `${suggestedCrop.crop_x}%`,
                top:    `${suggestedCrop.crop_y}%`,
                width:  `${suggestedCrop.crop_w}%`,
                height: `${suggestedCrop.crop_h}%`,
                border: '2px dashed rgba(251,191,36,0.75)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)',
                zIndex: 20,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '-18px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '10px',
                  color: 'rgba(251,191,36,0.9)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  letterSpacing: '0.05em',
                  pointerEvents: 'none',
                }}
              >
                SUGGESTED
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 bg-zinc-950 border-t border-zinc-800 px-5 py-4 space-y-4">

        {/* Aspect ratio buttons + orientation toggle */}
        <div className="flex gap-2 justify-center flex-wrap items-center">
          {RATIOS.map(r => (
            <button
              key={r.label}
              onClick={() => handleAspectChange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                ratioValue === r.value
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {r.label}
            </button>
          ))}

          {/* Portrait / landscape flip */}
          <button
            onClick={handleToggleOrientation}
            disabled={!canToggleOrientation}
            title={canToggleOrientation
              ? `Switch to ${orientation === 'landscape' ? 'portrait' : 'landscape'}`
              : 'Select a non-square ratio to enable'}
            className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors border flex items-center ${
              canToggleOrientation
                ? 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:bg-zinc-700 cursor-pointer'
                : 'bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed'
            }`}
          >
            {orientation === 'portrait' ? (
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="1" width="6" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="5" width="14" height="6" rx="1" />
              </svg>
            )}
          </button>
        </div>

        {/* Rotation slider */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 w-16 text-right font-medium">Rotate</span>
          <div className="flex-1 relative">
            <div className="h-1 bg-zinc-700 rounded-full">
              <div
                className="absolute top-0 h-full bg-violet-500 rounded-full"
                style={{
                  left:  `${rotation < 0 ? 50 + (rotation / 45) * 50 : 50}%`,
                  width: `${Math.abs(rotation) / 45 * 50}%`,
                }}
              />
            </div>
            <input
              type="range"
              min={-45} max={45} step={0.5}
              value={rotation}
              onChange={handleRotationChange}
              className="absolute inset-x-0 top-0 w-full opacity-0 h-5 cursor-pointer"
              style={{ marginTop: '-8px', zIndex: 10 }}
            />
          </div>
          <input
            type="number"
            min={-45} max={45} step={0.5}
            value={rotation.toFixed(1)}
            onChange={e => {
              const val = Math.max(-45, Math.min(45, parseFloat(e.target.value) || 0))
              handleRotationChange({ target: { value: val } })
            }}
            className="text-xs font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 w-14 text-center focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        {/* Reset / Apply */}
        <div className="flex gap-3">
          <button onClick={handleReset}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl text-sm font-medium transition-colors">
            Reset Crop
          </button>
          <button onClick={handleApply}
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
