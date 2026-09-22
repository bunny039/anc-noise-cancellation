/* ============================================================
   components/EdgeDeviceStatus.tsx — Futuristic Defence Edge Device HUD
   ============================================================ */
import React from 'react';
import { Cpu, Server } from 'lucide-react';

interface EdgeDeviceStatusProps {
  cpuPercent: number | null;
  ramMb: number | null;
  latencyMs: number | null;
  rtf: number | null;
  connected: boolean;
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const isHigh = pct > 75;
  return (
    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
      <div
        className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-amber-400' : color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export const EdgeDeviceStatus: React.FC<EdgeDeviceStatusProps> = ({
  cpuPercent, ramMb, latencyMs, rtf, connected,
}) => {
  return (
    <div className="hud-panel flex flex-col overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95 font-mono">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-cyan-400" />
          <span className="text-xs font-bold text-white tracking-wide uppercase">Edge Hardware</span>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded border
          ${connected ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'text-slate-400 bg-slate-900 border-slate-800'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
          {connected ? 'PI CONNECTED' : 'PI OFFLINE'}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Device info */}
        <div className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
            <Server size={12} />
            <span>Raspberry Pi 4 (aarch64)</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">ONNX Runtime · Low-Power Tactical Node</div>
        </div>

        {/* CPU */}
        <div>
          <div className="flex justify-between items-center mb-1 text-[11px]">
            <span className="text-slate-400">CPU Usage</span>
            <span className="font-bold text-white">
              {cpuPercent !== null ? `${cpuPercent.toFixed(0)}%` : '—'}
            </span>
          </div>
          <ProgressBar value={cpuPercent ?? 0} max={100} color="bg-cyan-400" />
        </div>

        {/* RAM */}
        <div>
          <div className="flex justify-between items-center mb-1 text-[11px]">
            <span className="text-slate-400">RAM Allocated</span>
            <span className="font-bold text-white">
              {ramMb !== null ? `${ramMb} MB` : '—'}
            </span>
          </div>
          <ProgressBar value={ramMb ?? 0} max={4096} color="bg-indigo-400" />
        </div>

        {/* Latency + RTF */}
        <div className="border-t border-slate-800 pt-2.5">
          <div className="metric-row">
            <span className="metric-label">Inference Latency</span>
            <span className="text-[11px] font-bold text-slate-200">
              {latencyMs !== null ? `${latencyMs} ms` : '— ms'}
            </span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Real-Time Factor</span>
            <span className={`text-[11px] font-bold ${rtf !== null && rtf < 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {rtf !== null ? `${rtf.toFixed(3)}x` : '—'}
            </span>
          </div>
        </div>

        {!connected && (
          <div className="text-[10px] text-slate-400 text-center px-2 py-1.5 bg-slate-950/60 rounded-lg border border-slate-800">
            Hardware telemetry streams live when target Pi is linked
          </div>
        )}
      </div>
    </div>
  );
};
