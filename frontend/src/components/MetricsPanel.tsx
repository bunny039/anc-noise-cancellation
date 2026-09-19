/* ============================================================
   components/MetricsPanel.tsx
   Enhancement performance metrics panel
   ============================================================ */
import React from 'react';
import { BarChart2, Info } from 'lucide-react';
import type { Metrics } from '../types';

interface MetricsPanelProps {
  metrics: Metrics | null;
  isLoading?: boolean;
}

type MetricSource = 'MEASURED' | 'CALCULATED' | 'MODEL OUTPUT' | 'CONFIG' | 'N/A';

interface MetricDef {
  key: keyof Metrics;
  label: string;
  unit?: string;
  tooltip: string;
  source: MetricSource;
  good?: (v: number) => boolean;
}

const SOURCE_COLORS: Record<MetricSource, string> = {
  'MEASURED':     'text-blue-600 bg-blue-50 border-blue-200',
  'CALCULATED':   'text-purple-600 bg-purple-50 border-purple-200',
  'MODEL OUTPUT': 'text-emerald-600 bg-emerald-50 border-emerald-200',
  'CONFIG':       'text-slate-600 bg-slate-50 border-slate-200',
  'N/A':          'text-slate-400 bg-slate-50 border-slate-200',
};

const METRICS: MetricDef[] = [
  {
    key: 'input_snr', label: 'Input SNR', unit: 'dB',
    tooltip: 'Signal-to-Noise Ratio of the input audio. Requires a clean reference.',
    source: 'CALCULATED',
  },
  {
    key: 'output_snr', label: 'Output SNR', unit: 'dB',
    tooltip: 'Signal-to-Noise Ratio of the enhanced output. Requires a clean reference.',
    source: 'CALCULATED',
    good: v => v >= 15,
  },
  {
    key: 'snr_improvement', label: 'SNR Improvement', unit: 'dB',
    tooltip: 'Improvement in SNR from input to output. Target: ≥ +15 dB (DRDO PS-26052).',
    source: 'CALCULATED',
    good: v => v >= 8,
  },
  {
    key: 'si_sdr', label: 'SI-SDR', unit: 'dB',
    tooltip: 'Scale-Invariant Signal-to-Distortion Ratio. Higher is better.',
    source: 'CALCULATED',
    good: v => v >= 12,
  },
  {
    key: 'si_sdr_improvement', label: 'SI-SDR Impr.', unit: 'dB',
    tooltip: 'Improvement in SI-SDR from input to output.',
    source: 'CALCULATED',
    good: v => v >= 5,
  },
  {
    key: 'stoi', label: 'STOI', unit: '',
    tooltip: 'Short-Time Objective Intelligibility (0–1). Target: ≥ 0.85.',
    source: 'CALCULATED',
    good: v => v >= 0.85,
  },
  {
    key: 'pesq', label: 'PESQ', unit: '',
    tooltip: 'Perceptual Evaluation of Speech Quality (1–4.5). Target: ≥ 2.5.',
    source: 'CALCULATED',
    good: v => v >= 2.5,
  },
  {
    key: 'latency_ms', label: 'Processing Latency', unit: 'ms',
    tooltip: 'Total wall-clock time for ONNX inference. Target: ≤ 30 ms/frame.',
    source: 'MEASURED',
    good: v => v <= 30,
  },
  {
    key: 'rtf', label: 'Real-Time Factor', unit: '',
    tooltip: 'Processing time / audio duration. RTF < 1 = faster than real-time.',
    source: 'CALCULATED',
    good: v => v < 1,
  },
];

const EXTRA_METRICS: MetricDef[] = [
  { key: 'rms_input',  label: 'RMS (Input)',  unit: '', tooltip: 'Root-mean-square amplitude of input',  source: 'MEASURED' },
  { key: 'rms_output', label: 'RMS (Output)', unit: '', tooltip: 'Root-mean-square amplitude of output', source: 'MEASURED' },
  { key: 'peak_input', label: 'Peak (Input)', unit: '', tooltip: 'Peak amplitude of input',  source: 'MEASURED' },
  { key: 'peak_output', label: 'Peak (Output)', unit: '', tooltip: 'Peak amplitude of output', source: 'MEASURED' },
];

function formatValue(val: number | string | undefined, unit?: string): { text: string; isNA: boolean } {
  if (val === undefined || val === null) return { text: '—', isNA: true };
  if (val === 'N/A') return { text: 'N/A', isNA: true };
  const num = typeof val === 'number' ? val : parseFloat(val as string);
  if (isNaN(num)) return { text: 'N/A', isNA: true };
  const prefix = num > 0 && (unit === 'dB') ? '+' : '';
  return { text: `${prefix}${num.toFixed(unit === 'ms' ? 1 : num < 1 && num > -1 ? 3 : 2)}${unit ? ` ${unit}` : ''}`, isNA: false };
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({ metrics, isLoading }) => {
  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <BarChart2 size={10} />
          Enhancement Performance
        </span>
      </div>

      <div className="px-2.5 py-2 space-y-0.5">
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border-2 border-defence-500 border-t-transparent rounded-full animate-spin" />
              Computing metrics…
            </div>
          </div>
        )}

        {!isLoading && !metrics && (
          <div className="py-4 text-center text-2xs text-slate-400 font-mono">
            Metrics appear after processing
          </div>
        )}

        {!isLoading && metrics && (
          <>
            {/* Note about clean reference */}
            {metrics.note && (
              <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-sm mb-2">
                <Info size={9} className="text-amber-600 mt-0.5 shrink-0" />
                <span className="text-2xs text-amber-700">{metrics.note}</span>
              </div>
            )}

            {METRICS.map(def => {
              const raw = metrics[def.key];
              const { text, isNA } = formatValue(raw as number | string, def.unit);
              const num = typeof raw === 'number' ? raw : null;
              const isGood = num !== null && def.good ? def.good(num) : null;

              return (
                <div key={def.key} className="metric-row" title={def.tooltip}>
                  <span className="metric-label flex items-center gap-1">
                    {def.label}
                    <Info size={8} className="text-slate-300" />
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`metric-value ${
                      isNA ? 'text-slate-400' :
                      isGood === true ? 'text-emerald-700' :
                      isGood === false ? 'text-amber-600' :
                      'text-slate-800'
                    }`}>
                      {text}
                    </span>
                    {!isNA && (
                      <span className={`text-2xs px-1 py-0.5 rounded-sm border font-mono ${SOURCE_COLORS[def.source]}`}>
                        {def.source}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Extra signal-level metrics */}
            <div className="pt-1 mt-1 border-t border-slate-100">
              <div className="panel-title mb-1">Signal Levels</div>
              {EXTRA_METRICS.map(def => {
                const { text } = formatValue(metrics[def.key] as number, def.unit);
                return (
                  <div key={def.key} className="metric-row" title={def.tooltip}>
                    <span className="metric-label">{def.label}</span>
                    <span className="metric-value text-slate-600">{text}</span>
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
