/* ============================================================
   components/Header.tsx
   Top engineering workstation header bar
   ============================================================ */
import React from 'react';
import { Radio, Cpu, Zap, Clock } from 'lucide-react';
import type { SystemStatus } from '../types';

interface HeaderProps {
  status: SystemStatus;
  latencyMs: number | null;
  backendConnected: boolean;
  onDemoMode: () => void;
  isDemoRunning: boolean;
}

const STATUS_CONFIG: Record<SystemStatus, { color: string; bg: string; label: string }> = {
  READY:       { color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300',    label: 'SYSTEM READY' },
  RECORDING:   { color: 'text-red-700',     bg: 'bg-red-100 border-red-300',            label: 'RECORDING' },
  UPLOADING:   { color: 'text-amber-700',   bg: 'bg-amber-100 border-amber-300',        label: 'UPLOADING' },
  ANALYZING:   { color: 'text-blue-700',    bg: 'bg-blue-100 border-blue-300',          label: 'ANALYZING' },
  PROCESSING:  { color: 'text-amber-700',   bg: 'bg-amber-100 border-amber-300',        label: 'PROCESSING' },
  COMPLETE:    { color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300',    label: 'COMPLETE' },
  ERROR:       { color: 'text-red-700',     bg: 'bg-red-100 border-red-300',            label: 'ERROR' },
};

const HeaderParam: React.FC<{ label: string; value: string; icon?: React.ReactNode }> = ({
  label, value, icon,
}) => (
  <div className="flex items-center gap-1.5 px-3 border-l border-slate-300 first:border-0">
    {icon && <span className="text-slate-400">{icon}</span>}
    <div>
      <div className="text-2xs text-slate-400 tracking-wider uppercase font-mono">{label}</div>
      <div className="text-xs font-semibold text-slate-700 font-mono leading-tight">{value}</div>
    </div>
  </div>
);

export const Header: React.FC<HeaderProps> = ({
  status, latencyMs, backendConnected, onDemoMode, isDemoRunning,
}) => {
  const cfg = STATUS_CONFIG[status];
  const isProcessing = status === 'PROCESSING' || status === 'ANALYZING' || status === 'UPLOADING';

  return (
    <header className="bg-white border-b border-panel-border shadow-panel-sm">
      {/* ── Top strip ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-panel-border bg-defence-950">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-defence-500 flex items-center justify-center rounded-sm">
              <Zap size={13} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight leading-none">
                DEFENCE SPEECH ENHANCEMENT SYSTEM
              </h1>
              <p className="text-2xs text-defence-300 mt-0.5 font-mono">
                Real-Time Audio Processing · DeepFilterNet3 · ONNX · Edge Deployment · DRDO PS-26052
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Demo mode button */}
          <button
            onClick={onDemoMode}
            disabled={isDemoRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-2xs font-semibold rounded-sm
              border transition-colors duration-150
              ${isDemoRunning
                ? 'bg-amber-600 border-amber-500 text-white cursor-not-allowed'
                : 'bg-defence-700 border-defence-600 text-white hover:bg-defence-600'
              }`}
          >
            <Zap size={10} className={isDemoRunning ? 'animate-pulse' : ''} />
            {isDemoRunning ? 'DEMO RUNNING…' : 'DEMO MODE'}
          </button>

          {/* Backend status */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-sm border text-2xs font-semibold font-mono
            ${backendConnected
              ? 'bg-emerald-900 border-emerald-700 text-emerald-300'
              : 'bg-red-900 border-red-700 text-red-300'}`}>
            <span className={`status-dot ${backendConnected ? 'bg-emerald-400' : 'bg-red-400'} ${backendConnected ? '' : 'blink'}`} />
            {backendConnected ? 'BACKEND CONNECTED' : 'BACKEND OFFLINE'}
          </div>
        </div>
      </div>

      {/* ── Parameters bar ───────────────────────────────────── */}
      <div className="flex items-center px-4 py-1.5 gap-0">
        {/* System status badge */}
        <div className={`flex items-center gap-1.5 px-3 py-1 mr-4 rounded-sm border text-xs font-semibold font-mono
          ${cfg.bg} ${cfg.color}`}>
          <Radio size={11} className={isProcessing ? 'animate-pulse' : ''} />
          <span className="status-dot bg-current opacity-70" />
          {cfg.label}
        </div>

        <HeaderParam label="Model" value="DeepFilterNet3" icon={<Cpu size={10} />} />
        <HeaderParam label="Inference" value="ONNX" />
        <HeaderParam label="Sample Rate" value="48 kHz" />
        <HeaderParam label="Processing" value="REAL-TIME" />
        <HeaderParam
          label="Latency"
          value={latencyMs !== null ? `${latencyMs} ms` : '— ms'}
          icon={<Clock size={10} />}
        />
        <HeaderParam label="Deploy Target" value="Raspberry Pi 4" />
      </div>
    </header>
  );
};
