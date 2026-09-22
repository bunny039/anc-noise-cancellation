/* ============================================================
   components/Header.tsx
   Futuristic Defence AI Command Navigation Bar.
   Features sticky translucent glass effect, DRDO badges,
   smooth navigation links, real-time SNR readouts, and API status.
   ============================================================ */
import React from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  Shield,
  Sliders,
  Radio,
} from 'lucide-react';
import type { SystemStatus } from '../types';

interface HeaderProps {
  status: SystemStatus;
  latencyMs?: number | null;
  inputSnr?: number | null;
  outputSnr?: number | null;
  snrGain?: number | null;
  backendConnected: boolean;
  onDemoMode: () => void;
  isDemoRunning: boolean;
  activeView?: 'evaluation' | 'workbench';
  onViewChange?: (view: 'evaluation' | 'workbench') => void;
  theme?: 'white' | 'dark';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  inputSnr,
  outputSnr,
  snrGain,
  backendConnected,
  onDemoMode,
  isDemoRunning,
  activeView = 'evaluation',
  onViewChange,
}) => {
  const isActive = ['PROCESSING', 'ANALYZING', 'UPLOADING'].includes(status);

  const scrollToAnchor = (id: string) => {
    if (activeView !== 'evaluation' && onViewChange) {
      onViewChange('evaluation');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-50 flex-shrink-0 backdrop-blur-xl bg-[#030712]/85 border-b border-cyan-500/20 shadow-2xl">
      {/* Subtle top electric cyan gradient line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_#00f0ff]" />

      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        {/* ── Brand & Military Identifiers ──────────────────── */}
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-700 border border-cyan-300/40 shadow-[0_0_15px_rgba(0,240,255,0.4)]">
            <Radio size={18} className="text-slate-950 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-black tracking-tight text-white font-display">
                DEFENCE AI
              </span>
              <span className="rounded px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-cyan-950/90 border border-cyan-500/50 text-cyan-300 shadow-[0_0_8px_rgba(0,240,255,0.2)]">
                DRDO PS-26052
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 hidden sm:block">
              Speech Enhancement Intelligence Platform · DeepFilterNet3 ONNX
            </p>
          </div>
        </div>

        {/* ── Navigation Links (Overview, Live Demo, Evaluation, etc.) ─ */}
        <nav className="hidden xl:flex items-center gap-1 font-mono text-xs font-semibold">
          <button
            onClick={() => scrollToAnchor('overview')}
            className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-900/60 transition-colors"
          >
            Overview
          </button>
          <button
            onClick={() => scrollToAnchor('live-demo')}
            className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-900/60 transition-colors"
          >
            Live Demo
          </button>
          <button
            onClick={() => scrollToAnchor('evaluation')}
            className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-900/60 transition-colors"
          >
            Evaluation
          </button>
          <button
            onClick={() => scrollToAnchor('audio-analysis')}
            className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-900/60 transition-colors"
          >
            Audio Analysis
          </button>
          <button
            onClick={() => scrollToAnchor('architecture')}
            className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-900/60 transition-colors"
          >
            Architecture
          </button>
          <button
            onClick={() => scrollToAnchor('system')}
            className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-900/60 transition-colors"
          >
            System
          </button>
        </nav>

        {/* ── View Switcher: Evaluation Console vs Signal Workbench ── */}
        {onViewChange && (
          <div className="flex items-center rounded-xl p-1 font-mono text-xs bg-[#070d1a] border border-cyan-500/20 shadow-inner">
            <button
              onClick={() => onViewChange('evaluation')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all duration-200 ${
                activeView === 'evaluation'
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Shield size={13} />
              <span>Evaluation Console</span>
            </button>

            <button
              onClick={() => onViewChange('workbench')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all duration-200 ${
                activeView === 'workbench'
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Sliders size={13} />
              <span>Signal Workbench</span>
            </button>
          </div>
        )}

        {/* ── Right: Live Indicators, SNR Readout & Demo Mode ─ */}
        <div className="flex items-center gap-3 font-mono">
          {/* Real-Time Live SNR Gain Pill */}
          {((inputSnr !== undefined && inputSnr !== null) || (outputSnr !== undefined && outputSnr !== null)) && (
            <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-xs">
              <div className="flex flex-col items-start">
                <span className="text-[8px] uppercase text-amber-400 font-extrabold">In SNR</span>
                <span className="font-black text-amber-300">
                  {inputSnr !== null && inputSnr !== undefined ? `${inputSnr.toFixed(1)} dB` : '—'}
                </span>
              </div>
              <span className="text-emerald-400 font-bold">→</span>
              <div className="flex flex-col items-start">
                <span className="text-[8px] uppercase text-emerald-400 font-extrabold">Out SNR</span>
                <span className="font-black text-emerald-300">
                  {outputSnr !== null && outputSnr !== undefined ? `+${outputSnr.toFixed(1)} dB` : '—'}
                </span>
              </div>
              {snrGain !== undefined && snrGain !== null && (
                <span className="tag-enhanced text-[9px] font-black px-2 py-0.5 ml-0.5">
                  +{snrGain.toFixed(1)} dB Gain
                </span>
              )}
            </div>
          )}

          {/* Backend Connection Indicator */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
              backendConnected
                ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'text-rose-400 bg-rose-950/60 border-rose-500/40'
            }`}
          >
            {backendConnected ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} className="text-rose-400" />}
            <span>{backendConnected ? 'API CONNECTED' : 'OFFLINE'}</span>
          </div>

          {/* Demo Mode Button */}
          <button
            onClick={onDemoMode}
            disabled={isDemoRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-cyan-500/40 bg-cyan-950/80 text-cyan-300 hover:bg-cyan-900/80 hover:border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.2)] transition-all disabled:opacity-40"
          >
            <Activity size={12} className={isDemoRunning ? 'animate-spin' : ''} />
            <span>{isDemoRunning ? 'SIMULATING…' : 'DEMO MODE'}</span>
          </button>
        </div>
      </div>

      {/* Real-time processing progress bar strip */}
      {isActive && (
        <div className="h-[2px] w-full overflow-hidden bg-slate-900">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-signal-flow" />
        </div>
      )}
    </header>
  );
};
