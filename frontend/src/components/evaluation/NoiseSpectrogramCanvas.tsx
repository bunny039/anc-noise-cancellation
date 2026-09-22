/* ============================================================
   evaluation/NoiseSpectrogramCanvas.tsx
   High-performance canvas rendering for defence waveforms & spectrograms.
   Renders acoustic signatures for Helicopter, Engine, UAV, Siren,
   Gunshot, and Artillery under noisy vs enhanced conditions.
   ============================================================ */

import React, { useEffect, useRef } from 'react';
import type { EvaluationCondition } from '../../types';

interface NoiseSpectrogramCanvasProps {
  condition: EvaluationCondition;
  variant: 'noisy' | 'enhanced';
  type: 'waveform' | 'spectrogram';
  height?: number;
  theme?: 'white' | 'dark';
}

export const NoiseSpectrogramCanvas: React.FC<NoiseSpectrogramCanvasProps> = ({
  condition,
  variant,
  type,
  height = 140,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 380;
    const h = height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Canvas background
    ctx.fillStyle = '#050914';
    ctx.fillRect(0, 0, w, h);

    if (type === 'waveform') {
      renderWaveform(ctx, w, h, condition, variant);
    } else {
      renderSpectrogram(ctx, w, h, condition, variant);
    }
  }, [condition, variant, type, height]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-[#050914] shadow-inner group">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
      {/* Badge in top-right */}
      <div className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700/80 shadow-md">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            variant === 'enhanced' ? 'bg-cyan-400 shadow-[0_0_6px_#00f0ff]' : 'bg-amber-400 shadow-[0_0_6px_#f59e0b]'
          }`}
        />
        <span className={variant === 'enhanced' ? 'text-cyan-300 font-bold' : 'text-amber-300 font-bold'}>
          {variant === 'enhanced' ? 'DeepFilterNet3 Clear Voice' : 'Noisy Input Capture'}
        </span>
      </div>
    </div>
  );
};

/* ── Waveform Renderer ────────────────────────────────────────── */
function renderWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  condition: EvaluationCondition,
  variant: 'noisy' | 'enhanced'
) {
  const midY = h / 2;

  // Grid lines
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);

  // Horizontal axes
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.moveTo(0, midY - h * 0.35);
  ctx.lineTo(w, midY - h * 0.35);
  ctx.moveTo(0, midY + h * 0.35);
  ctx.lineTo(w, midY + h * 0.35);
  ctx.stroke();

  // Vertical time grid (0.5s, 1.0s, 1.5s, 2.0s, 2.5s)
  for (let x = w * 0.2; x < w; x += w * 0.2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.fillText('0.0s', 6, h - 6);
  ctx.fillText('1.5s', w * 0.5 - 12, h - 6);
  ctx.fillText('3.0s', w - 28, h - 6);
  ctx.fillText('+1.0', 6, 14);
  ctx.fillText('-1.0', 6, h - 16);

  // Generate waveform points based on condition
  const numPoints = Math.floor(w * 1.5);
  ctx.beginPath();
  const isEnhanced = variant === 'enhanced';

  for (let i = 0; i < numPoints; i++) {
    const x = (i / numPoints) * w;
    const t = (i / numPoints) * 3.0; // 3-second window

    // Speech envelope with natural vocal bursts
    const speechEnv = Math.max(0, Math.sin(2 * Math.PI * 1.1 * t)) *
                      (0.5 + 0.5 * Math.cos(2 * Math.PI * 0.4 * t));
    const speech = 0.45 * Math.sin(2 * Math.PI * 220 * t) * speechEnv +
                   0.25 * Math.sin(2 * Math.PI * 440 * t) * speechEnv;

    let noise = 0;
    const rand = (Math.random() - 0.5) * 2;

    switch (condition) {
      case 'Helicopter': {
        const rotor = 0.35 * Math.sin(2 * Math.PI * 24 * t);
        const chop = 0.25 * Math.sin(2 * Math.PI * 6 * t) * rand;
        noise = rotor + chop;
        break;
      }
      case 'Engine': {
        const rumble = 0.4 * Math.sin(2 * Math.PI * 18 * t);
        noise = rumble + rand * 0.25;
        break;
      }
      case 'UAV': {
        const whine = 0.32 * Math.sin(2 * Math.PI * 95 * t);
        noise = whine + rand * 0.2;
        break;
      }
      case 'Siren': {
        const sweep = 0.4 * Math.sin(2 * Math.PI * (35 + 20 * Math.sin(2 * Math.PI * 0.8 * t)) * t);
        noise = sweep + rand * 0.15;
        break;
      }
      case 'Gunshot': {
        const phase = t % 0.75;
        if (phase < 0.1) {
          noise = Math.exp(-phase * 35) * (rand * 0.85 + Math.sin(2 * Math.PI * 60 * phase));
        } else {
          noise = rand * 0.08;
        }
        break;
      }
      case 'Artillery': {
        const blast1 = t - 0.5;
        const blast2 = t - 2.0;
        let blast = 0;
        if (blast1 > 0 && blast1 < 0.5) blast += Math.exp(-blast1 * 9) * (rand * 0.9 + 0.5 * Math.sin(2 * Math.PI * 25 * blast1));
        if (blast2 > 0 && blast2 < 0.5) blast += Math.exp(-blast2 * 9) * (rand * 0.9 + 0.5 * Math.sin(2 * Math.PI * 25 * blast2));
        noise = blast + rand * 0.1;
        break;
      }
    }

    let yVal: number;
    if (isEnhanced) {
      // Enhanced speech: clean voice, noise heavily suppressed
      yVal = speech * 1.05 + noise * 0.04;
    } else {
      // Noisy input: voice partially masked
      yVal = speech * 0.65 + noise * 0.75;
    }

    yVal = Math.max(-0.95, Math.min(0.95, yVal));
    const y = midY - yVal * (h * 0.42);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  // Stroke styling
  if (isEnhanced) {
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = 'rgba(0, 240, 255, 0.5)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.8;
  } else {
    ctx.strokeStyle = '#f59e0b';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
    ctx.shadowBlur = 5;
    ctx.lineWidth = 1.6;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/* ── Spectrogram Renderer ─────────────────────────────────────── */
function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  condition: EvaluationCondition,
  variant: 'noisy' | 'enhanced'
) {
  const isEnhanced = variant === 'enhanced';
  const cols = Math.min(220, Math.floor(w / 2));
  const rows = 40;
  const colW = w / cols;
  const rowH = (h - 20) / rows;

  for (let c = 0; c < cols; c++) {
    const t = (c / cols) * 3.0;

    // Speech formant tracks
    const voiceActivity = Math.max(0, Math.sin(2 * Math.PI * 0.8 * t)) *
                         (0.6 + 0.4 * Math.sin(2 * Math.PI * 1.6 * t));

    for (let r = 0; r < rows; r++) {
      let speechEnergy = 0;
      if (voiceActivity > 0.15) {
        if (r >= 5 && r <= 8) speechEnergy += 0.85 * voiceActivity;   // F1 formant ~600 Hz
        if (r >= 12 && r <= 15) speechEnergy += 0.8 * voiceActivity;  // F2 formant ~1.5 kHz
        if (r >= 20 && r <= 23) speechEnergy += 0.7 * voiceActivity;  // F3 formant ~2.5 kHz
        if (r < 5) speechEnergy += 0.75 * voiceActivity;              // F0 pitch fundamental
      }

      // Environmental noise energy
      let noiseEnergy = 0;
      switch (condition) {
        case 'Helicopter': {
          if (r < 7) noiseEnergy += 0.9;
          if (r === 11 || r === 16) noiseEnergy += 0.65;
          noiseEnergy += Math.random() * 0.15;
          break;
        }
        case 'Engine': {
          if (r < 12) noiseEnergy += (1 - r / 12) * 0.95;
          noiseEnergy += Math.random() * 0.14;
          break;
        }
        case 'UAV': {
          if (r >= 20 && r <= 23) noiseEnergy += 0.95;
          if (r >= 30 && r <= 33) noiseEnergy += 0.8;
          noiseEnergy += Math.random() * 0.12;
          break;
        }
        case 'Siren': {
          const sweepRow = Math.floor(12 + 12 * Math.sin(2 * Math.PI * 0.75 * t));
          if (Math.abs(r - sweepRow) <= 1) noiseEnergy += 0.95;
          break;
        }
        case 'Gunshot': {
          const phase = t % 0.75;
          if (phase < 0.08) {
            noiseEnergy += Math.exp(-phase * 40) * 0.98;
          }
          break;
        }
        case 'Artillery': {
          const d1 = Math.abs(t - 0.5);
          const d2 = Math.abs(t - 2.0);
          if (d1 < 0.25) noiseEnergy += (1 - d1 / 0.25) * 0.95;
          if (d2 < 0.25) noiseEnergy += (1 - d2 / 0.25) * 0.95;
          break;
        }
      }

      // Total energy calculation
      let intensity: number;
      if (isEnhanced) {
        intensity = Math.min(1.0, speechEnergy + noiseEnergy * 0.06);
      } else {
        intensity = Math.min(1.0, speechEnergy * 0.65 + noiseEnergy * 0.88);
      }

      ctx.fillStyle = getSpectrogramColor(intensity);
      const y = h - 20 - (r + 1) * rowH;
      ctx.fillRect(c * colW, y, colW + 0.5, rowH + 0.5);
    }
  }

  // Axis lines & labels
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - 20);
  ctx.lineTo(w, h - 20);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.fillText('0 Hz', 6, h - 24);
  ctx.fillText('4 kHz', 6, (h - 20) * 0.5);
  ctx.fillText('8 kHz', 6, 14);
  ctx.fillText('0.0s', 40, h - 6);
  ctx.fillText('1.5s', w * 0.5 - 12, h - 6);
  ctx.fillText('3.0s', w - 30, h - 6);
}

function getSpectrogramColor(val: number): string {
  if (val < 0.08) return '#050914';
  if (val < 0.25) return '#071d3a'; // Deep Navy
  if (val < 0.45) return '#0284c7'; // Blue
  if (val < 0.70) return '#00f0ff'; // Electric Cyan
  if (val < 0.85) return '#f59e0b'; // Amber Yellow
  return '#f43f5e';                 // Peak Intensity Rose
}
