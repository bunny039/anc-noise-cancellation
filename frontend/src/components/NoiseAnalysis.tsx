/* ============================================================
   components/NoiseAnalysis.tsx — Futuristic Defence Noise Analysis HUD
   ============================================================ */
import React from 'react';
import { Activity, Zap } from 'lucide-react';
import type { NoiseProfile, SpectrumPoint } from '../types';

interface NoiseAnalysisProps {
  noiseProfile: NoiseProfile;
  dominantFreqHz: number | null;
  spectrumData: SpectrumPoint[] | null;
  estimatedSnrDb: number | null;
}

const NOISE_INFO: Record<NoiseProfile, {
  label: string;
  emoji: string;
  freqRange: string;
  description: string;
  bands: number[];
  accent: string;
  bg: string;
  border: string;
}> = {
  helicopter: {
    label: 'Helicopter / Rotor',
    emoji: '🚁',
    freqRange: '20 – 800 Hz',
    description: 'Broadband tonal noise from rotor blade passage. Dominant harmonics below 500 Hz.',
    bands: [80, 160, 320, 640],
    accent: '#f97316',
    bg: 'rgba(249,115,22,0.12)',
    border: 'rgba(249,115,22,0.4)',
  },
  engine: {
    label: 'Engine / Vehicle',
    emoji: '🚜',
    freqRange: '50 – 2000 Hz',
    description: 'Combustion engine harmonics and mechanical vibration. Strong low-to-mid content.',
    bands: [50, 100, 200, 400, 800],
    accent: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.4)',
  },
  gunfire: {
    label: 'Gunfire / Blast',
    emoji: '💥',
    freqRange: 'Broadband impulse',
    description: 'High-energy impulse across full spectrum. Transient blast with rapid decay.',
    bands: [200, 500, 1000, 2000, 4000],
    accent: '#dc2626',
    bg: 'rgba(220,38,38,0.12)',
    border: 'rgba(220,38,38,0.4)',
  },
  wind: {
    label: 'Wind / Gust',
    emoji: '🌬️',
    freqRange: '20 – 400 Hz',
    description: 'Turbulent airflow. Low-frequency rumble saturating microphone diaphragm.',
    bands: [40, 80, 150, 300],
    accent: '#38bdf8',
    bg: 'rgba(56,189,248,0.12)',
    border: 'rgba(56,189,248,0.4)',
  },
  environmental: {
    label: 'Environmental',
    emoji: '🌿',
    freqRange: 'Broadband',
    description: 'Mixed ambient acoustics: crowd, generator machinery, and urban traffic wash.',
    bands: [100, 300, 600, 1200, 2400],
    accent: '#94a3b8',
    bg: 'rgba(148,163,184,0.1)',
    border: 'rgba(148,163,184,0.3)',
  },
  custom: {
    label: 'Custom Profile',
    emoji: '⚙️',
    freqRange: 'User-defined',
    description: 'Custom acoustic signature computed live from uploaded audio FFT.',
    bands: [],
    accent: '#00f0ff',
    bg: 'rgba(0,240,255,0.1)',
    border: 'rgba(0,240,255,0.35)',
  },
};

export const NoiseAnalysis: React.FC<NoiseAnalysisProps> = ({
  noiseProfile, dominantFreqHz, spectrumData: _sd, estimatedSnrDb,
}) => {
  const info = NOISE_INFO[noiseProfile];

  return (
    <div className="hud-panel overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95 font-mono">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          <span className="text-xs font-bold text-white tracking-wide uppercase">Acoustic Signature</span>
        </div>
        <span className="text-[9px] text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
          PROFILE
        </span>
      </div>

      <div className="px-4 py-3">
        {/* Profile badge */}
        <div className="flex items-center gap-3 p-3 rounded-xl mb-3"
          style={{ background: info.bg, border: `1px solid ${info.border}` }}>
          <span className="text-2xl">{info.emoji}</span>
          <div>
            <div className="text-xs font-black" style={{ color: info.accent }}>{info.label}</div>
            <div className="text-[10px] text-slate-300 font-bold">{info.freqRange}</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-center">
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
            <div className="text-[9px] text-slate-400 mb-1 uppercase tracking-wider">DOMINANT FREQ</div>
            <div className="text-xs font-bold text-white">
              {dominantFreqHz !== null
                ? dominantFreqHz >= 1000 ? `${(dominantFreqHz / 1000).toFixed(2)} kHz` : `${dominantFreqHz.toFixed(0)} Hz`
                : '—'}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
            <div className="text-[9px] text-slate-400 mb-1 uppercase tracking-wider">EST. INPUT SNR</div>
            <div className={`text-xs font-black ${estimatedSnrDb !== null && estimatedSnrDb < 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {estimatedSnrDb !== null ? `${estimatedSnrDb.toFixed(1)} dB` : '—'}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-[11px] text-slate-300 leading-relaxed mb-3">{info.description}</p>

        {/* Noise bands */}
        {info.bands.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Zap size={11} style={{ color: info.accent }} />
              <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: info.accent }}>Resonance Bands</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {info.bands.map(f => (
                <span key={f} className="text-[9px] px-2 py-1 rounded-md font-bold"
                  style={{ background: info.bg, border: `1px solid ${info.border}`, color: info.accent }}>
                  {f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${f} Hz`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
