/* ============================================================
   components/PipelineVisualization.tsx
   Central AI Processing Pipeline Visualization with Signal
   Transformation, Neural Engine Core, and Flowing Particles.
   ============================================================ */
import React from 'react';
import { Cpu, Radio, Sparkles, Activity } from 'lucide-react';
import type { EvaluationCondition } from '../types';

interface PipelineVisualizationProps {
  activeCondition: EvaluationCondition;
  inputSnrDb: number;
  outputSnrDb?: number | null;
  isProcessing?: boolean;
}

export const PipelineVisualization: React.FC<PipelineVisualizationProps> = ({
  activeCondition,
  inputSnrDb,
  outputSnrDb,
  isProcessing = false,
}) => {
  return (
    <div className="hud-panel p-6 relative overflow-hidden border border-cyan-500/20 bg-[#060c1a]/90 backdrop-blur-xl">
      {/* Background glow illumination */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/5 blur-[90px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.2)]">
            <Radio size={16} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold font-mono tracking-wider uppercase text-white">
              AI Speech Processing Pipeline
            </h2>
            <p className="text-[11px] text-slate-400 font-mono">
              DeepFilterNet3 Two-Stage Spectral & Complex Deep Filtering
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Acoustic Condition:</span>
          <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-slate-900 border border-slate-700 text-cyan-300">
            {activeCondition} ({inputSnrDb.toFixed(1)} dB)
          </span>
        </div>
      </div>

      {/* ── 3-Stage Transformation Conduit ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center relative">
        {/* Stage 1: NOISY SPEECH */}
        <div className="flex flex-col p-4 rounded-xl bg-slate-950/70 border border-amber-500/30 relative group hover:border-amber-500/60 transition-all duration-300 shadow-md">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-mono font-bold tracking-wider text-amber-400 uppercase flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              01 NOISY SPEECH
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-800/60 text-amber-300">
              Corrupted Input
            </span>
          </div>

          <p className="text-[11px] font-mono text-slate-300 mb-3 leading-relaxed">
            Raw microphone input masked by {activeCondition} environment acoustic noise.
          </p>

          {/* SVG Noisy Waveform Representation */}
          <div className="h-16 w-full rounded-lg bg-slate-900/90 border border-amber-950/80 p-2 flex items-center justify-center overflow-hidden">
            <svg viewBox="0 0 200 40" className="w-full h-full stroke-amber-400 fill-none" preserveAspectRatio="none">
              <path
                d="M 0 20 Q 10 5, 20 28 T 40 12 T 60 32 T 80 4 T 100 36 T 120 10 T 140 30 T 160 8 T 180 34 T 200 20"
                strokeWidth="2"
                strokeLinecap="round"
                className="opacity-90"
              />
              <path
                d="M 0 20 Q 15 35, 30 10 T 60 28 T 90 8 T 120 32 T 150 12 T 180 28 T 200 20"
                strokeWidth="1"
                strokeDasharray="2,2"
                className="opacity-40 stroke-amber-200"
              />
            </svg>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-400">Input SNR:</span>
            <span className="font-bold text-amber-300">{inputSnrDb.toFixed(1)} dB</span>
          </div>
        </div>

        {/* Stage 2: DEEPFILTERNET3 NEURAL CORE */}
        <div className="flex flex-col p-5 rounded-xl bg-cyan-950/40 border-2 border-cyan-400/60 relative group hover:border-cyan-400 transition-all duration-300 shadow-[0_0_25px_rgba(0,240,255,0.2)]">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-500 text-slate-950 font-mono text-[9px] font-black tracking-widest uppercase shadow-md">
            NEURAL ENGINE
          </div>

          <div className="flex items-center justify-between mb-2.5 mt-1">
            <span className="text-[11px] font-mono font-black tracking-wider text-cyan-200 uppercase flex items-center gap-1.5">
              <Cpu size={14} className={`text-cyan-400 ${isProcessing ? 'animate-spin' : ''}`} />
              02 DEEPFILTERNET3
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-900/60 border border-cyan-700/60 text-cyan-200">
              ONNX Core
            </span>
          </div>

          <p className="text-[11px] font-mono text-cyan-100/90 mb-3 leading-relaxed">
            Stage 1: ERB spectral envelope attenuation.<br />
            Stage 2: Deep complex filtering on periodic harmonics.
          </p>

          {/* Central Neural Pulse Graphic */}
          <div className="h-16 w-full rounded-lg bg-[#04101e] border border-cyan-500/30 p-2 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-cyan-400/20 to-cyan-500/10 animate-shimmer" />
            <div className="flex items-center gap-3 z-10 font-mono text-[10px] font-bold text-cyan-300">
              <div className="h-8 w-8 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center animate-pulse">
                <Activity size={14} className="text-cyan-300" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-white font-extrabold tracking-wider">32 ERB Bands</span>
                <span className="text-[9px] text-cyan-400">Low-Latency &lt; 25 ms</span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-cyan-800/60 flex items-center justify-between text-[10px] font-mono">
            <span className="text-cyan-300/80">Filter Architecture:</span>
            <span className="font-bold text-white">Conv-GRU + DFN</span>
          </div>
        </div>

        {/* Stage 3: CLEAN SPEECH */}
        <div className="flex flex-col p-4 rounded-xl bg-slate-950/70 border border-emerald-500/30 relative group hover:border-emerald-500/60 transition-all duration-300 shadow-md">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400 uppercase flex items-center gap-1.5">
              <Sparkles size={12} className="text-emerald-400" />
              03 CLEAN SPEECH
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300">
              Enhanced Output
            </span>
          </div>

          <p className="text-[11px] font-mono text-slate-300 mb-3 leading-relaxed">
            Clear, intelligible tactical speech with noise floor attenuated by &gt; 20 dB.
          </p>

          {/* SVG Clean Harmonic Waveform Representation */}
          <div className="h-16 w-full rounded-lg bg-slate-900/90 border border-emerald-950/80 p-2 flex items-center justify-center overflow-hidden">
            <svg viewBox="0 0 200 40" className="w-full h-full stroke-emerald-400 fill-none" preserveAspectRatio="none">
              <path
                d="M 0 20 Q 20 5, 40 20 T 80 20 T 120 20 T 160 20 T 200 20"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="opacity-95 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              />
              <path
                d="M 0 20 Q 10 12, 20 20 T 40 20 T 60 20 T 80 20 T 100 20 T 120 20 T 140 20 T 160 20 T 180 20 T 200 20"
                strokeWidth="1"
                className="opacity-50 stroke-emerald-200"
              />
            </svg>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-400">Target Enhanced SNR:</span>
            <span className="font-bold text-emerald-300">
              {outputSnrDb !== null && outputSnrDb !== undefined ? `+${outputSnrDb.toFixed(1)} dB` : '+16.4 dB'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
