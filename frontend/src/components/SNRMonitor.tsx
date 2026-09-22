/* ============================================================
   components/SNRMonitor.tsx — High-Visibility SNR Analyzer & Calibration Suite
   ============================================================ */
import React, { useState } from 'react';
import { Gauge, Sliders, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Metrics } from '../types';

interface SNRMonitorProps {
  metrics: Metrics | null;
  isLoading?: boolean;
  calibrationOffset?: number;
  onCalibrationChange?: (offsetDb: number) => void;
  onAutoCalibrate?: () => void;
  isCalibrating?: boolean;
}

const PRESET_ENVIRONMENTS = [
  { label: 'Helicopter / Rotor', offset: -4.0, desc: '-4.0 dB (Rotor Downwash)' },
  { label: 'Standard Field Mic', offset: 0.0, desc: '0.0 dB (Uncalibrated Baseline)' },
  { label: 'Armored Cockpit', offset: +2.5, desc: '+2.5 dB (Engine Cavity Filter)' },
  { label: 'Active Directional Mic', offset: +5.0, desc: '+5.0 dB (Noise Gate Shield)' },
];

export const SNRMonitor: React.FC<SNRMonitorProps> = ({
  metrics,
  calibrationOffset = 0.0,
  onCalibrationChange,
  onAutoCalibrate,
  isCalibrating = false,
}) => {
  const [showCalibSuite, setShowCalibSuite] = useState(true);

  const inSNR = typeof metrics?.input_snr === 'number' ? metrics.input_snr : null;
  const outSNR = typeof metrics?.output_snr === 'number' ? metrics.output_snr : null;
  const gainSNR = typeof metrics?.snr_improvement === 'number' ? metrics.snr_improvement : null;
  const rawInSNR = typeof metrics?.raw_input_snr === 'number' ? metrics.raw_input_snr : null;
  const isCalibrated = metrics?.is_calibrated || calibrationOffset !== 0.0;

  // Clarity rating & Plain-English explanation helper
  const getQualityInfo = (snr: number | null) => {
    if (snr === null) return {
      label: 'AWAITING SIGNAL',
      color: 'text-slate-400 border-slate-700 bg-slate-900',
      desc: 'Load or record audio to analyze Signal-to-Noise Ratio (SNR).',
      ratioText: '—',
    };
    if (snr >= 18) return {
      label: 'HIGH FIDELITY (STUDIO CLEAR)',
      color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15',
      desc: `Speech power is ~${Math.round(Math.pow(10, snr / 10))}x higher than noise. Pristine crystal-clear voice.`,
      ratioText: `~${Math.round(Math.pow(10, snr / 10))}x Speech vs Noise`,
    };
    if (snr >= 12) return {
      label: 'MIL-STD OPERATIONAL TARGET MET',
      color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/15',
      desc: `Speech power is ~${Math.round(Math.pow(10, snr / 10))}x higher than noise. Exceeds DRDO / Military tactical speech targets.`,
      ratioText: `~${Math.round(Math.pow(10, snr / 10))}x Speech vs Noise`,
    };
    if (snr >= 3) return {
      label: 'INTELLIGIBLE / MODERATE NOISE',
      color: 'text-amber-400 border-amber-500/40 bg-amber-500/15',
      desc: `Speech power is ~${Math.round(Math.pow(10, snr / 10))}x higher than noise. Intelligible but residual background noise present.`,
      ratioText: `~${Math.round(Math.pow(10, snr / 10))}x Speech vs Noise`,
    };
    return {
      label: 'CRITICAL / HEAVILY DEGRADED',
      color: 'text-rose-400 border-rose-500/40 bg-rose-500/15',
      desc: `Noise floor dominates speech. Audio requires DeepFilterNet3 enhancement for intelligibility.`,
      ratioText: 'Noise Dominant',
    };
  };

  const qual = getQualityInfo(outSNR ?? inSNR);

  const toPct = (v: number | null) => {
    if (v === null) return 0;
    const clamped = Math.max(-15, Math.min(35, v));
    return ((clamped - (-15)) / (35 - (-15))) * 100;
  };

  return (
    <div className="hud-panel flex flex-col overflow-hidden relative border border-cyan-500/20 bg-[#070e1c]/95">
      {/* Background glow highlight */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Gauge size={16} className="text-cyan-400 animate-pulse" />
          <span className="text-xs font-bold text-white tracking-wide uppercase font-mono">
            Signal-to-Noise Ratio (SNR) Visualizer
          </span>
          {isCalibrated && (
            <span className="tag-enhanced text-[9px] font-mono px-1.5 py-0.2">
              CALIBRATED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAutoCalibrate && (
            <button
              onClick={onAutoCalibrate}
              disabled={isCalibrating || inSNR === null}
              title="Auto-zero noise floor against quietest 20% frames"
              className="btn-secondary text-[10px] px-2 py-0.5"
            >
              <RefreshCw size={11} className={isCalibrating ? 'animate-spin' : ''} />
              <span>{isCalibrating ? 'Calibrating…' : 'Auto-Zero'}</span>
            </button>
          )}
          <button
            onClick={() => setShowCalibSuite(!showCalibSuite)}
            className="text-slate-400 hover:text-cyan-300 transition-colors p-1"
            title="Toggle Calibration Controls"
          >
            <Sliders size={13} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Main Big Numbers Comparison (Input vs Enhanced) ── */}
        <div className="grid grid-cols-2 gap-3 font-mono">
          {/* Input SNR Card */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/30 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Input SNR
              </span>
              {rawInSNR !== null && rawInSNR !== inSNR && (
                <span className="text-[9px] text-slate-400">Raw: {rawInSNR.toFixed(1)} dB</span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-amber-300">
                {inSNR !== null ? `${inSNR > 0 ? '+' : ''}${inSNR.toFixed(1)}` : '—'}
              </span>
              <span className="text-xs text-amber-400 font-bold">dB</span>
            </div>
            {/* Input Mini Bar */}
            <div className="mt-2 h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${toPct(inSNR)}%` }}
              />
            </div>
          </div>

          {/* Enhanced SNR Card */}
          <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex flex-col justify-between relative overflow-hidden shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Enhanced SNR
              </span>
              {gainSNR !== null && (
                <span className="tag-enhanced text-[9px] font-black px-1.5 py-0.2">
                  +{gainSNR.toFixed(1)} dB
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">
                {outSNR !== null ? `+${outSNR.toFixed(1)}` : '—'}
              </span>
              <span className="text-xs text-cyan-400 font-bold">dB</span>
            </div>
            {/* Enhanced Mini Bar */}
            <div className="mt-2 h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,240,255,0.6)]"
                style={{ width: `${toPct(outSNR)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Plain-English Clarity & Operational Rating Banner ── */}
        <div className={`p-3 rounded-xl border flex flex-col gap-1 ${qual.color}`}>
          <div className="flex items-center justify-between font-mono text-[10px] font-black tracking-wider">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} />
              {qual.label}
            </span>
            <span>{qual.ratioText}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300 mt-0.5 font-mono">
            {qual.desc}
          </p>
        </div>

        {/* ── Calibration & Environment Offset Suite ───────── */}
        {showCalibSuite && (
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                <Sliders size={11} /> Environment Calibration Offset
              </span>
              <span className="text-xs font-bold text-white">
                {calibrationOffset > 0 ? `+${calibrationOffset.toFixed(1)}` : calibrationOffset.toFixed(1)} dB
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min="-12"
              max="12"
              step="0.5"
              value={calibrationOffset}
              onChange={e => onCalibrationChange?.(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />

            {/* Preset quick buttons */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {PRESET_ENVIRONMENTS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => onCalibrationChange?.(preset.offset)}
                  className={`p-1.5 rounded text-[10px] text-left border transition-all ${
                    calibrationOffset === preset.offset
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-300 font-bold'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-bold truncate">{preset.label}</div>
                  <div className="text-[8.5px] text-slate-400">{preset.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
