/* ============================================================
   components/MetricCards.tsx
   Futuristic Defence HUD Metric Cards for SNR Improvement,
   STOI Intelligibility, PESQ MOS, and Real-Time Latency.
   ============================================================ */
import React from 'react';
import { Gauge, Layers, Activity, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import type { EvaluationSummary } from '../types';

interface MetricCardsProps {
  summary: EvaluationSummary;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ summary }) => {
  const snrPass = summary.avg_snr_improvement !== null && summary.avg_snr_improvement >= 15.0;
  const stoiPass = summary.avg_stoi !== null && summary.avg_stoi >= 0.85;
  const pesqPass = summary.avg_pesq !== null && summary.avg_pesq >= 2.5;
  const latencyPass = summary.avg_latency !== null && summary.avg_latency <= 30.0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
      {/* ── CARD 1: SNR IMPROVEMENT ─────────────────────────── */}
      <div className="hud-panel p-5 relative overflow-hidden group hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/20 transition-all" />

        {/* Title */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 group-hover:text-cyan-300 transition-colors">
            SNR Improvement
          </span>
          <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <Gauge size={16} />
          </div>
        </div>

        {/* Big Number */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-4xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            {summary.avg_snr_improvement !== null ? `+${summary.avg_snr_improvement.toFixed(1)}` : '--'}
          </span>
          <span className="text-sm font-bold text-cyan-400">dB</span>
        </div>

        {/* Target Standard */}
        <p className="mt-2 text-[10px] text-slate-400 uppercase tracking-wide">
          Target: &ge; 15.0 dB · Mil-Standard
        </p>

        {/* Progress Gauge Bar */}
        <div className="mt-3.5 h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(0,240,255,0.5)]"
            style={{
              width: summary.avg_snr_improvement !== null
                ? `${Math.min(100, (summary.avg_snr_improvement / 25) * 100)}%`
                : '0%',
            }}
          />
        </div>

        {/* Footer Status */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
          <span className="text-slate-400 uppercase">Verification:</span>
          {summary.avg_snr_improvement !== null ? (
            snrPass ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 shadow-[0_0_10px_rgba(16,185,129,0.25)]">
                <CheckCircle2 size={11} /> PASS (TARGET MET)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-rose-400 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800/80">
                <AlertCircle size={11} /> FAIL
              </span>
            )
          ) : (
            <span className="text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
              Not evaluated
            </span>
          )}
        </div>
      </div>

      {/* ── CARD 2: STOI INTELLIGIBILITY ────────────────────── */}
      <div className="hud-panel p-5 relative overflow-hidden group hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/20 transition-all" />

        {/* Title */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 group-hover:text-cyan-300 transition-colors">
            STOI Intelligibility
          </span>
          <div className="p-2 rounded-lg bg-indigo-950/80 border border-indigo-500/30 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
            <Layers size={16} />
          </div>
        </div>

        {/* Big Number */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-4xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            {summary.avg_stoi !== null ? summary.avg_stoi.toFixed(3) : '--'}
          </span>
          <span className="text-sm font-bold text-indigo-400">Score</span>
        </div>

        {/* Target Standard */}
        <p className="mt-2 text-[10px] text-slate-400 uppercase tracking-wide">
          Target: &ge; 0.850 · High Intelligibility
        </p>

        {/* Progress Gauge Bar */}
        <div className="mt-3.5 h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
            style={{
              width: summary.avg_stoi !== null ? `${Math.min(100, summary.avg_stoi * 100)}%` : '0%',
            }}
          />
        </div>

        {/* Footer Status */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
          <span className="text-slate-400 uppercase">Verification:</span>
          {summary.avg_stoi !== null ? (
            stoiPass ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 shadow-[0_0_10px_rgba(16,185,129,0.25)]">
                <CheckCircle2 size={11} /> PASS (TARGET MET)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-rose-400 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800/80">
                <AlertCircle size={11} /> FAIL
              </span>
            )
          ) : (
            <span className="text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
              Not evaluated
            </span>
          )}
        </div>
      </div>

      {/* ── CARD 3: PESQ QUALITY ────────────────────────────── */}
      <div className="hud-panel p-5 relative overflow-hidden group hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/20 transition-all" />

        {/* Title */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 group-hover:text-cyan-300 transition-colors">
            PESQ Speech Quality
          </span>
          <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
            <Activity size={16} />
          </div>
        </div>

        {/* Big Number */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-4xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            {summary.avg_pesq !== null ? summary.avg_pesq.toFixed(2) : '--'}
          </span>
          <span className="text-sm font-bold text-emerald-400">MOS</span>
        </div>

        {/* Target Standard */}
        <p className="mt-2 text-[10px] text-slate-400 uppercase tracking-wide">
          Target: &ge; 2.50 MOS · Perceptual Standard
        </p>

        {/* Progress Gauge Bar */}
        <div className="mt-3.5 h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
            style={{
              width: summary.avg_pesq !== null ? `${Math.min(100, (summary.avg_pesq / 4.5) * 100)}%` : '0%',
            }}
          />
        </div>

        {/* Footer Status */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
          <span className="text-slate-400 uppercase">Verification:</span>
          {summary.avg_pesq !== null ? (
            pesqPass ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 shadow-[0_0_10px_rgba(16,185,129,0.25)]">
                <CheckCircle2 size={11} /> PASS (TARGET MET)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-rose-400 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800/80">
                <AlertCircle size={11} /> FAIL
              </span>
            )
          ) : (
            <span className="text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
              Not evaluated
            </span>
          )}
        </div>
      </div>

      {/* ── CARD 4: PROCESSING LATENCY ──────────────────────── */}
      <div className="hud-panel p-5 relative overflow-hidden group hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/20 transition-all" />

        {/* Title */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 group-hover:text-cyan-300 transition-colors">
            Processing Latency
          </span>
          <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <Clock size={16} />
          </div>
        </div>

        {/* Big Number */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-4xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            {summary.avg_latency !== null ? summary.avg_latency.toFixed(1) : '--'}
          </span>
          <span className="text-sm font-bold text-cyan-400">ms</span>
        </div>

        {/* Target Standard */}
        <p className="mt-2 text-[10px] text-slate-400 uppercase tracking-wide">
          Target: &le; 30.0 ms · Edge Real-Time Budget
        </p>

        {/* Progress Gauge Bar */}
        <div className="mt-3.5 h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(0,240,255,0.5)]"
            style={{
              width: summary.avg_latency !== null
                ? `${Math.min(100, Math.max(15, (summary.avg_latency / 30) * 100))}%`
                : '0%',
            }}
          />
        </div>

        {/* Footer Status */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
          <span className="text-slate-400 uppercase">Verification:</span>
          {summary.avg_latency !== null ? (
            latencyPass ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 shadow-[0_0_10px_rgba(16,185,129,0.25)]">
                <CheckCircle2 size={11} /> PASS (REAL-TIME)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-rose-400 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800/80">
                <AlertCircle size={11} /> FAIL
              </span>
            )
          ) : (
            <span className="text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
              Not evaluated
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
