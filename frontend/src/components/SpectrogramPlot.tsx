/* ============================================================
   components/SpectrogramPlot.tsx
   Canvas-rendered STFT heat map with viridis colormap
   ============================================================ */
import React, { useEffect, useRef } from 'react';
import type { SpectrogramData } from '../types';

interface SpectrogramPlotProps {
  title: string;
  data: SpectrogramData | null;
  label?: string;
  isLoading?: boolean;
  colormap?: 'viridis' | 'inferno' | 'plasma';
}

// Viridis colormap (simplified 32-stop version)
const VIRIDIS: [number, number, number][] = [
  [68,1,84],[71,13,96],[72,26,108],[70,38,119],[67,50,129],[63,62,137],
  [58,73,144],[53,83,149],[48,92,154],[44,101,158],[40,110,161],[37,118,163],
  [34,127,164],[31,136,163],[30,144,161],[31,152,158],[35,160,152],[41,167,145],
  [51,174,137],[63,181,128],[79,187,117],[97,192,105],[116,197,93],[138,201,79],
  [161,205,63],[183,208,47],[207,210,29],[230,211,15],[247,215,15],[252,225,37],
  [253,237,79],[253,248,128],
];

function interpolateViridis(t: number): [number, number, number] {
  const idx = t * (VIRIDIS.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, VIRIDIS.length - 1);
  const frac = idx - lo;
  const [r0, g0, b0] = VIRIDIS[lo];
  const [r1, g1, b1] = VIRIDIS[hi];
  return [
    Math.round(r0 + (r1 - r0) * frac),
    Math.round(g0 + (g1 - g0) * frac),
    Math.round(b0 + (b1 - b0) * frac),
  ];
}

function renderSpectrogram(
  canvas: HTMLCanvasElement,
  data: SpectrogramData,
) {
  const { data: matrix, n_frames, n_freqs } = data;
  if (!n_frames || !n_freqs) return;

  canvas.width = n_frames;
  canvas.height = n_freqs;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(n_frames, n_freqs);

  for (let frame = 0; frame < n_frames; frame++) {
    for (let freq = 0; freq < n_freqs; freq++) {
      const val = (matrix[frame]?.[freq] ?? 0);
      const t = Math.max(0, Math.min(1, val));
      const [r, g, b] = interpolateViridis(t);
      // Flip freq axis (low freq at bottom)
      const row = n_freqs - 1 - freq;
      const idx = (row * n_frames + frame) * 4;
      imgData.data[idx]     = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export const SpectrogramPlot: React.FC<SpectrogramPlotProps> = ({
  title, data, label, isLoading,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data || !data.n_frames) return;
    renderSpectrogram(canvasRef.current, data);
  }, [data]);

  const hasData = !!data && data.n_frames > 0;

  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        <div className="flex items-center gap-2">
          {label && (
            <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-sm font-mono border
              ${label === 'NOISY' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {label}
            </span>
          )}
        </div>
      </div>

      <div className="px-2 py-2">
        {isLoading && (
          <div className="flex items-center justify-center h-24 bg-slate-900 rounded-sm">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border-2 border-defence-400 border-t-transparent rounded-full animate-spin" />
              <span className="font-mono">Computing STFT…</span>
            </div>
          </div>
        )}

        {!isLoading && !hasData && (
          <div className="flex items-center justify-center h-24 bg-slate-900 rounded-sm">
            <span className="text-2xs text-slate-500 font-mono">No spectrogram data</span>
          </div>
        )}

        {!isLoading && hasData && (
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="w-full h-24 spectrogram-canvas rounded-sm"
              style={{ imageRendering: 'pixelated' }}
            />
            {/* Axis labels */}
            <div className="flex justify-between mt-0.5">
              <span className="text-2xs text-slate-400 font-mono">0 Hz</span>
              <span className="text-2xs text-slate-400 font-mono">Frequency →</span>
              <span className="text-2xs text-slate-400 font-mono">24 kHz</span>
            </div>
            {/* Color scale */}
            <div className="flex items-center gap-1 mt-1">
              <span className="text-2xs text-slate-400 font-mono">
                {data.db_min?.toFixed(0)} dB
              </span>
              <div className="flex-1 h-1.5 rounded-full" style={{
                background: 'linear-gradient(to right, #440154, #31688e, #35b779, #fde725)',
              }} />
              <span className="text-2xs text-slate-400 font-mono">
                {data.db_max?.toFixed(0)} dB
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
