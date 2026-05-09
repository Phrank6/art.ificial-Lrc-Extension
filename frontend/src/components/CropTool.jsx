import { useState } from 'react'

const RATIOS = [
  { label: 'Free', value: 'free' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '16:9', value: '16:9' },
  { label: '3:2', value: '3:2' },
  { label: '4:5', value: '4:5' },
]

export default function CropTool({ cropParams, onChange, onClose }) {
  const { ratio = 'free', rotation = 0 } = cropParams

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 backdrop-blur-sm">
      <div className="bg-zinc-900 border-t border-zinc-700 w-full max-w-2xl rounded-t-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-100">Crop & Rotate</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Aspect ratio presets */}
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-3">Aspect Ratio</div>
          <div className="flex gap-2 flex-wrap">
            {RATIOS.map(r => (
              <button
                key={r.value}
                onClick={() => onChange({ ratio: r.value, rotation })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  ratio === r.value
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rotation */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Rotation</div>
            <span className="text-sm font-mono text-zinc-300">{rotation.toFixed(1)}°</span>
          </div>
          <div className="relative">
            <div className="h-1 bg-zinc-700 rounded-full">
              <div
                className="absolute top-0 h-full bg-violet-500 rounded-full"
                style={{
                  left: `${rotation < 0 ? 50 + (rotation / 45) * 50 : 50}%`,
                  width: `${Math.abs(rotation) / 45 * 50}%`,
                }}
              />
            </div>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.5}
              value={rotation}
              onChange={e => onChange({ ratio, rotation: parseFloat(e.target.value) })}
              className="w-full mt-2"
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>-45°</span>
            <span>0°</span>
            <span>+45°</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onChange({ ratio: 'free', rotation: 0 })}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
