/* ============================================================
   components/MetricsPanel.tsx — Futuristic Defence Metrics Panel
   ============================================================ */
import React from 'react';
import { TrendingUp, Info } from 'lucide-react';
import type { Metrics } from '../types';

interface MetricsPanelProps {
  metrics: Metrics | null;
  isLoading?: boolean;
}

type MetricSource = 'MEASURED' | 'CALCULATED' | 'MODEL OUTPUT' | 'N/A';

interface MetricDef {
  key: keyof Metrics;
  label: string;
  unit?: string;
  tooltip: string;
  source: MetricSource;
  good?: (v: number) => boolean;
  showPlus?: boolean;
}

const SOURCE_STYLE: Record<MetricSource, string> = {
  'MEASURED':     'text-cyan-300 bg-cyan-950/80 border-cyan-500/40',
  'CALCULATED':   'text-indigo-300 bg-indigo-950/80 border-indigo-500/40',
  'MODEL OUTPUT': 'text-emerald-300 bg-emerald-950/80 border-emerald-500/40',
  'N/A':          'text-slate-400 bg-slate-900 border-slate-800',
};

const METRICS: MetricDef[] = [
  { key: 'input_snr',             label: 'Input SNR',        unit: 'dB',  tooltip: 'Signal-to-Noise Ratio of input signal.', source: 'CALCULATED' },
  { key: 'output_snr',            label: 'Output SNR',       unit: 'dB',  tooltip: 'SNR after DeepFilterNet3 enhancement.', source: 'CALCULATED', good: v => v >= 15 },
  { key: 'snr_improvement',       label: 'SNR Gain',         unit: 'dB',  tooltip: 'Δ SNR input→output. DRDO benchmark metric.', source: 'CALCULATED', good: v => v >= 8, showPlus: true },
  { key: 'calibration_offset_db', label: 'SNR Calibration',  unit: 'dB',  tooltip: 'Transducer / noise floor calibration offset.', source: 'MEASURED', showPlus: true },
  { key: 'si_sdr',                label: 'SI-SDR',           unit: 'dB',  tooltip: 'Scale-Invariant Signal-to-Distortion Ratio.', source: 'CALCULATED', good: v => v >= 12 },
  { key: 'si_sdr_improvement',    label: 'SI-SDR Impr.',     unit: 'dB',  tooltip: 'Improvement in SI-SDR.', source: 'CALCULATED', good: v => v >= 5, showPlus: true },
  { key: 'stoi',                  label: 'STOI',             unit: '',    tooltip: 'Short-Time Objective Intelligibility (0–1). Target ≥ 0.85.', source: 'CALCULATED', good: v => v >= 0.85 },
  { key: 'pesq',                  label: 'PESQ',             unit: '',    tooltip: 'Perceptual Speech Quality (1–4.5). Target ≥ 2.50 MOS.', source: 'CALCULATED', good: v => v >= 2.5 },
  { key: 'latency_ms',            label: 'Latency',          unit: 'ms',  tooltip: 'Total frame inference runtime. Target ≤ 30 ms.', source: 'MEASURED', good: v => v <= 30 },
  { key: 'rtf',                   label: 'Real-Time Factor', unit: 'x',   tooltip: 'Processing / audio duration. RTF < 1 = real-time.', source: 'CALCULATED', good: v => v < 1 },
];

function fmtVal(val: number | string | undefined, unit?: string, showPlus?: boolean): { text: string; isNA: boolean } {
  if (val === undefined || val === null || val === 'N/A') return { text: '—', isNA: true };
  const n = typeof val === 'number' ? val : parseFloat(val as string);
  if (isNaN(n)) return { text: 'N/A', isNA: true };
  const prefix = showPlus && n > 0 ? '+' : '';
  const dec = unit === 'ms' ? 1 : unit === 'x' ? 3 : n < 1 && n > -1 ? 3 : 2;
  return { text: `${prefix}${n.toFixed(dec)}${unit ? ' ' + unit : ''}`, isNA: false };
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({ metrics, isLoading }) => {
  return (
    <div className="hud-panel flex flex-col overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-cyan-400" />
          <span className="text-xs font-bold text-white tracking-wide uppercase font-mono">Performance Metrics</span>
        </div>
        <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
          Telemetry
        </span>
      </div>

      <div className="px-4 py-3 space-y-0 font-mono">
        {!metrics && isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <span className="text-[11px] text-cyan-300 font-mono">Computing metrics…</span>
          </div>
        )}

        {!metrics && !isLoading && (
          <div className="py-6 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl flex items-center justify-center bg-slate-900 border border-slate-800">
              <TrendingUp size={18} className="text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-400 font-mono">Metrics update on enhancement</p>
          </div>
        )}

        {metrics && (
          <>
            {metrics.note && (
              <div className="notice-info mb-3">
                <Info size={11} className="flex-shrink-0 mt-0.5 text-cyan-400" />
                <span>{metrics.note}</span>
              </div>
            )}

            {METRICS.map(def => {
              const raw = metrics[def.key];
              const { text, isNA } = fmtVal(raw as number | string, def.unit, def.showPlus);
              const num = typeof raw === 'number' ? raw : null;
              const isGood = num !== null && def.good ? def.good(num) : null;

              return (
                <div key={def.key} className="metric-row group" title={def.tooltip}>
                  <span className="metric-label flex items-center gap-1 group-hover:text-slate-200 transition-colors">
                    {def.label}
                    <Info size={8} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold font-mono transition-colors
                      ${isNA ? 'text-slate-400' :
                        isGood === true ? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]' :
                        isGood === false ? 'text-amber-400' :
                        'text-white'}`}>
                      {text}
                    </span>
                    {!isNA && (
                      <span className={`tag text-[8px] border ${SOURCE_STYLE[def.source]}`}>
                        {def.source}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Signal levels */}
            <div className="mt-3 pt-3 border-t border-slate-800">
              <div className="panel-title mb-2 text-slate-400">Signal Power & Peaks</div>
              {(['rms_input', 'rms_output', 'peak_input', 'peak_output'] as (keyof Metrics)[]).map(key => {
                const { text } = fmtVal(metrics[key] as number);
                const label = key.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <div key={key} className="metric-row">
                    <span className="metric-label">{label}</span>
                    <span className="text-[11px] font-mono text-slate-300 font-bold">{text}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
