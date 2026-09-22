/* ============================================================
   components/SpectrogramPlot.tsx — Futuristic Defence Spectrogram HUD
   ============================================================ */
import React, { useEffect, useRef } from 'react';
import type { SpectrogramData } from '../types';

interface SpectrogramPlotProps {
  title: string;
  data: SpectrogramData | null;
  label?: string;
  isLoading?: boolean;
  variant?: 'noisy' | 'enhanced';
}

const VIRIDIS: [number, number, number][] = [
  [68,1,84],[71,13,96],[72,26,108],[70,38,119],[67,50,129],[63,62,137],
  [58,73,144],[53,83,149],[48,92,154],[44,101,158],[40,110,161],[37,118,163],
  [34,127,164],[31,136,163],[30,144,161],[31,152,158],[35,160,152],[41,167,145],
  [51,174,137],[63,181,128],[79,187,117],[97,192,105],[116,197,93],[138,201,79],
  [161,205,63],[183,208,47],[207,210,29],[230,211,15],[247,215,15],[252,225,37],
  [253,237,79],[253,248,128],
];

const CYAN_MAGMA: [number, number, number][] = [
  [5,9,20],[7,29,58],[2,132,199],[0,240,255],[245,158,11],[244,63,94],[255,255,255]
];

function lerpColor(map: [number,number,number][], t: number): [number,number,number] {
  const idx = t * (map.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, map.length - 1);
  const f = idx - lo;
  return [
    Math.round(map[lo][0] + (map[hi][0] - map[lo][0]) * f),
    Math.round(map[lo][1] + (map[hi][1] - map[lo][1]) * f),
    Math.round(map[lo][2] + (map[hi][2] - map[lo][2]) * f),
  ];
}

function renderSpectrogram(canvas: HTMLCanvasElement, data: SpectrogramData, colormap: [number,number,number][]) {
  const { data: matrix, n_frames, n_freqs } = data;
  if (!n_frames || !n_freqs) return;
  canvas.width = n_frames;
  canvas.height = n_freqs;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n_frames, n_freqs);
  for (let f = 0; f < n_frames; f++) {
    for (let q = 0; q < n_freqs; q++) {
      const t = Math.max(0, Math.min(1, matrix[f]?.[q] ?? 0));
      const [r, g, b] = lerpColor(colormap, t);
      const row = n_freqs - 1 - q;
      const idx = (row * n_frames + f) * 4;
      img.data[idx] = r; img.data[idx+1] = g; img.data[idx+2] = b; img.data[idx+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const SpectrogramPlot: React.FC<SpectrogramPlotProps> = ({
  title, data, label, isLoading, variant = 'noisy',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isNoisy = variant === 'noisy';
  const colormap = isNoisy ? VIRIDIS : CYAN_MAGMA;

  useEffect(() => {
    if (!canvasRef.current || !data?.n_frames) return;
    renderSpectrogram(canvasRef.current, data, colormap);
  }, [data, colormap]);

  const hasData = !!data?.n_frames;

  return (
    <div className="hud-panel flex flex-col overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-950/70">
        <span className="text-xs font-bold text-white tracking-wide font-mono uppercase">{title}</span>
        {label && <span className={isNoisy ? 'tag tag-noisy' : 'tag tag-enhanced'}>{label}</span>}
      </div>

      <div className="px-3 py-2.5 font-mono">
        {isLoading && (
          <div className="h-20 rounded-lg overflow-hidden relative bg-slate-950/80 border border-slate-800">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent animate-signal-flow" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] text-cyan-300 font-mono">Computing STFT Spectrogram…</span>
            </div>
          </div>
        )}
        {!isLoading && !hasData && (
          <div className="h-20 rounded-lg flex items-center justify-center bg-slate-950/40 border border-dashed border-slate-800">
            <span className="text-[11px] text-slate-400 font-mono">No spectrogram data</span>
          </div>
        )}
        {!isLoading && hasData && (
          <>
            <canvas ref={canvasRef} className="w-full rounded-lg border border-slate-800 h-20" style={{ height: 80, imageRendering: 'pixelated' }} />
            <div className="flex justify-between mt-1 text-[9px] text-slate-400 font-mono">
              <span>0 Hz</span>
              <span>STFT Energy Flow →</span>
              <span>24 kHz</span>
            </div>
            {/* Color scale */}
            <div className="flex items-center gap-2 mt-1.5 font-mono text-[9px]">
              <span className="text-slate-400">{data.db_min?.toFixed(0)} dB</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{
                background: isNoisy
                  ? 'linear-gradient(to right, #440154, #31688e, #35b779, #fde725)'
                  : 'linear-gradient(to right, #050914, #0284c7, #00f0ff, #f59e0b, #f43f5e)',
              }} />
              <span className="text-slate-400">{data.db_max?.toFixed(0)} dB</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
