/* ============================================================
   components/SystemStatus.tsx — Futuristic Defence System Status HUD
   ============================================================ */
import React from 'react';
import { Cpu, Monitor, Wifi, WifiOff, Activity } from 'lucide-react';
import type { SystemStatus as SystemStatusType, SystemStatusResponse } from '../types';

interface SystemStatusProps {
  status: SystemStatusType;
  sysInfo: SystemStatusResponse | null;
  latencyMs: number | null;
  chunkSeconds: number;
}

const Row: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="metric-row">
    <span className="metric-label">{label}</span>
    <span className={`text-[11px] font-bold font-mono ${accent ? 'text-cyan-300' : 'text-slate-200'}`}>{value}</span>
  </div>
);

const STATUS_COLOR: Record<SystemStatusType, string> = {
  READY:      'text-emerald-400 bg-emerald-950/80 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
  RECORDING:  'text-rose-400 bg-rose-950/80 border-rose-500/40',
  UPLOADING:  'text-amber-400 bg-amber-950/80 border-amber-500/40',
  ANALYZING:  'text-cyan-400 bg-cyan-950/80 border-cyan-500/40',
  PROCESSING: 'text-cyan-400 bg-cyan-950/80 border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]',
  COMPLETE:   'text-emerald-400 bg-emerald-950/80 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
  ERROR:      'text-rose-400 bg-rose-950/80 border-rose-500/40',
};

export const SystemStatus: React.FC<SystemStatusProps> = ({
  status, sysInfo, latencyMs, chunkSeconds,
}) => {
  const isActive = ['PROCESSING', 'ANALYZING'].includes(status);

  return (
    <div className="hud-panel flex flex-col overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95 font-mono">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <Monitor size={14} className="text-cyan-400" />
          <span className="text-xs font-bold text-white tracking-wide uppercase">Core Telemetry</span>
        </div>
        <span className="text-[9px] text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
          HOST
        </span>
      </div>

      <div className="px-4 py-3">
        {/* Status badge */}
        <div className={`flex items-center justify-center gap-2 py-2 rounded-lg border text-[11px] font-black uppercase mb-3 ${STATUS_COLOR[status]}`}>
          <Activity size={12} className={isActive ? 'animate-spin' : ''} />
          {status}
        </div>

        <Row label="Model" value="DeepFilterNet3" accent />
        <Row label="Format" value={sysInfo?.model_format ?? 'ONNX'} />
        <Row label="Device" value={sysInfo?.device ?? 'CPU'} />
        <Row label="Sample Rate" value={sysInfo?.sample_rate ? `${(sysInfo.sample_rate / 1000).toFixed(0)} kHz` : '48 kHz'} />
        <Row label="Chunk" value={`${chunkSeconds.toFixed(1)} s`} />
        <Row label="Latency" value={latencyMs !== null ? `${latencyMs} ms` : '— ms'} />

        {/* Connection */}
        <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
          <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border
            ${sysInfo ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'text-rose-400 bg-rose-950/60 border-rose-500/40'}`}>
            {sysInfo ? <Wifi size={12} /> : <WifiOff size={12} />}
            API: {sysInfo ? 'Connected' : 'Offline'}
          </div>

          {sysInfo?.onnx_loaded !== undefined && (
            <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border
              ${sysInfo.onnx_loaded ? 'text-cyan-300 bg-cyan-950/60 border-cyan-500/40' : 'text-slate-400 bg-slate-900 border-slate-800'}`}>
              <Cpu size={12} />
              ONNX: {sysInfo.onnx_loaded ? 'Sessions Active' : 'Unloaded'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
