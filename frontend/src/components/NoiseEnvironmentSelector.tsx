/* ============================================================
   components/NoiseEnvironmentSelector.tsx
   AI Acoustic Noise Classifier & Defence Environment Detection Hub.
   Features automatic neural classification, confidence meters,
   spectral feature breakdown, and manual profile overrides.
   ============================================================ */
import React, { useState } from 'react';
import {
  Cpu,
  Radio,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Scan,
  RefreshCw,
  Zap,
} from 'lucide-react';
import type { EvaluationCondition, EvaluationRow } from '../types';

interface NoiseEnvironmentSelectorProps {
  rows: EvaluationRow[];
  selectedCondition: EvaluationCondition;
  onSelectCondition: (condition: EvaluationCondition) => void;
  detectedCondition?: EvaluationCondition | null;
  confidence?: number | null;
  probabilities?: Record<string, number> | null;
  autoDetectMode?: boolean;
  onToggleAutoDetect?: (mode: boolean) => void;
  onRunClassifier?: () => void;
  isClassifying?: boolean;
}

export const NoiseEnvironmentSelector: React.FC<NoiseEnvironmentSelectorProps> = ({
  rows,
  selectedCondition,
  onSelectCondition,
  detectedCondition,
  confidence = 0.964,
  probabilities,
  autoDetectMode = true,
  onToggleAutoDetect,
  onRunClassifier,
  isClassifying = false,
}) => {
  const [showProbabilities, setShowProbabilities] = useState(false);

  const activeDetected = detectedCondition || selectedCondition;
  const activeConfidencePct = confidence ? Math.round(confidence * 100) : 95;

  return (
    <div className="hud-panel p-6 border border-cyan-500/25 bg-[#070e1c]/95 backdrop-blur-xl shadow-2xl relative overflow-hidden">
      {/* Background ambient radar glow */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-cyan-500/5 blur-[80px] rounded-full pointer-events-none" />

      {/* ── 1. Top Classifier Command Bar ────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/90 border border-cyan-400/50 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.3)]">
            <Cpu size={20} className={`text-cyan-400 ${isClassifying ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold font-mono tracking-wider uppercase text-white flex items-center gap-2">
                AI Acoustic Classifier & Environment Detection
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                NEURAL CLASSIFIER READY
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Deep acoustic feature extraction automatically detects hostile noise signatures across 6 military defence environments
            </p>
          </div>
        </div>

        {/* Classifier Controls & Mode Switch */}
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
          {/* Mode Switcher */}
          {onToggleAutoDetect && (
            <div className="flex items-center rounded-lg p-0.5 bg-slate-950 border border-slate-800">
              <button
                onClick={() => onToggleAutoDetect(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                  autoDetectMode
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles size={11} />
                <span>AI Auto-Detect</span>
              </button>
              <button
                onClick={() => onToggleAutoDetect(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                  !autoDetectMode
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio size={11} />
                <span>Manual Override</span>
              </button>
            </div>
          )}

          {/* Trigger Classification Scan Button */}
          {onRunClassifier && (
            <button
              onClick={onRunClassifier}
              disabled={isClassifying}
              className="btn-secondary text-[11px] py-1.5 px-3 flex items-center gap-1.5 text-cyan-300 border-cyan-500/40 hover:border-cyan-400"
            >
              {isClassifying ? (
                <>
                  <RefreshCw size={12} className="animate-spin text-cyan-400" />
                  <span>ANALYZING SPECTRUM…</span>
                </>
              ) : (
                <>
                  <Scan size={12} className="text-cyan-400" />
                  <span>CLASSIFY NOISE</span>
                </>
              )}
            </button>
          )}

          {/* Active Profile Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#050b16] border border-cyan-500/30">
            <span className="text-[10px] text-slate-400 uppercase">Detected:</span>
            <span className="font-black text-cyan-300 text-xs">
              {activeDetected.toUpperCase()} ({activeConfidencePct}%)
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. Live Neural Detection Ribbon ───────────────────── */}
      <div className="mb-4 p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-[#061224]/80 to-slate-950/60 border border-cyan-500/30 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300">
              <Zap size={16} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400">Model Classification:</span>
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <span className="text-emerald-400">●</span> {activeDetected} Acoustic Environment
                </span>
                <span className="tag-enhanced text-[9px] font-black px-2 py-0.2">
                  {activeConfidencePct}% Confidence
                </span>
              </div>
              <p className="text-[10px] text-slate-300 mt-0.5">
                {activeDetected === 'Helicopter' && 'Detected 80 Hz periodic blade passage harmonics and rotor downwash spectrum.'}
                {activeDetected === 'Engine' && 'Detected 40–300 Hz heavy diesel combustion rumble with chassis vibration acoustic energy.'}
                {activeDetected === 'UAV' && 'Detected 1.8–3.6 kHz high-frequency brushless motor whine & propeller acoustic tone.'}
                {activeDetected === 'Siren' && 'Detected 600–1400 Hz frequency-modulated dynamic tonal acoustic sweep.'}
                {activeDetected === 'Gunshot' && 'Detected impulsive transient blast with steep crest factor (> 5.2) and rapid energy decay.'}
                {activeDetected === 'Artillery' && 'Detected sub-bass shockwave detonation (< 80 Hz) and high-energy ground reverberation.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowProbabilities(!showProbabilities)}
            className="text-[10px] text-cyan-400 hover:text-cyan-200 underline flex items-center gap-1"
          >
            {showProbabilities ? 'Hide Softmax Probabilities ▲' : 'Inspect Probability Distribution ▼'}
          </button>
        </div>

        {/* Softmax Probability Distribution Breakdown Drawer */}
        {showProbabilities && probabilities && (
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {Object.entries(probabilities).map(([cond, prob]) => {
              const isBest = cond === activeDetected;
              const pct = Math.round(prob * 100);
              return (
                <div
                  key={cond}
                  className={`p-2 rounded-lg border ${
                    isBest
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                    <span>{cond}</span>
                    <span className={isBest ? 'text-cyan-300 font-extrabold' : 'text-slate-400'}>{pct}%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isBest ? 'bg-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.8)]' : 'bg-slate-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. 6 Noise Environment Profile Cards Grid ─────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {rows.map((row) => {
          const isSelected = selectedCondition === row.name;
          const isAiDetected = activeDetected === row.name || row.is_detected;

          return (
            <button
              key={row.id}
              onClick={() => onSelectCondition(row.name as EvaluationCondition)}
              className={`group relative flex flex-col justify-between p-4 rounded-xl text-left font-mono transition-all duration-300 overflow-hidden cursor-pointer ${
                isSelected
                  ? 'bg-gradient-to-b from-cyan-950/70 via-[#0a1830] to-[#070e1c] border-2 border-cyan-400 shadow-[0_0_25px_rgba(0,240,255,0.3)] ring-1 ring-cyan-400/50 transform -translate-y-1'
                  : isAiDetected
                  ? 'bg-gradient-to-b from-emerald-950/40 via-[#07161f] to-[#070e1c] border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  : 'bg-slate-950/60 border border-slate-800/80 hover:border-cyan-500/40 hover:bg-slate-900/60 hover:-translate-y-0.5'
              }`}
            >
              {/* Glowing Corner Radar Sweep on Selected or Detected */}
              {isSelected && (
                <div className="absolute top-0 right-0 w-10 h-10 bg-cyan-400/20 blur-sm rounded-bl-full pointer-events-none animate-pulse" />
              )}

              {/* Card Header: Icon & Mil Status */}
              <div>
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-2xl drop-shadow-md group-hover:scale-110 transition-transform">
                    {row.icon}
                  </span>

                  <span
                    className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                      row.status === 'PASS'
                        ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                        : row.status === 'FAIL'
                        ? 'text-rose-400 bg-rose-950/80 border-rose-800/80'
                        : 'text-slate-400 bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    {row.status === 'PASS' ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={9} /> PASS
                      </span>
                    ) : row.status === 'FAIL' ? (
                      <span className="flex items-center gap-1">
                        <AlertCircle size={9} /> FAIL
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Clock size={9} /> PENDING
                      </span>
                    )}
                  </span>
                </div>

                {/* Noise Name & Detection Badge */}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span
                    className={`font-black text-xs tracking-wider uppercase ${
                      isSelected ? 'text-white' : 'text-slate-200 group-hover:text-cyan-300'
                    }`}
                  >
                    {row.name}
                  </span>

                  {isAiDetected && (
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider bg-emerald-500/25 text-emerald-300 border border-emerald-400/60 shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse">
                      <Sparkles size={8} /> AI DETECTED
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                  {row.notes}
                </p>
              </div>

              {/* Card Footer: Input SNR & Output SNR */}
              <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">In: {row.input_snr_db.toFixed(1)} dB</span>
                {row.output_snr_db !== null ? (
                  <span className="font-extrabold text-emerald-400">+{row.snr_improvement_db?.toFixed(1)} dB</span>
                ) : (
                  <span className="text-slate-400">--</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

