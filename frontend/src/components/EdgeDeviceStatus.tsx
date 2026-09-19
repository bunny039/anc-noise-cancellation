/* ============================================================
   components/EdgeDeviceStatus.tsx
   Raspberry Pi edge deployment status panel
   ============================================================ */
import React from 'react';
import { Cpu, Wifi } from 'lucide-react';

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
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${isHigh ? 'bg-amber-500' : color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export const EdgeDeviceStatus: React.FC<EdgeDeviceStatusProps> = ({
  cpuPercent, ramMb, latencyMs, rtf, connected,
}) => {
  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <Cpu size={10} />
          Edge Device
        </span>
        <div className={`flex items-center gap-1 text-2xs font-mono font-semibold
          ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>
          <Wifi size={10} />
          {connected ? 'Pi CONNECTED' : 'Pi OFFLINE'}
        </div>
      </div>

      <div className="px-2.5 py-2 space-y-2">
        {/* Device info */}
        <div className="px-2 py-1.5 bg-slate-50 border border-panel-border rounded-sm">
          <div className="text-2xs font-semibold text-slate-600 font-mono">Raspberry Pi 4 (aarch64)</div>
          <div className="text-2xs text-slate-400 font-mono">ONNX Runtime · No Torch · No Rust</div>
        </div>

        {/* CPU */}
        <div>
          <div className="flex justify-between items-center mb-0.5">
            <span className="metric-label">CPU Usage</span>
            <span className="metric-value">
              {cpuPercent !== null ? `${cpuPercent.toFixed(0)} %` : '— %'}
            </span>
          </div>
          <ProgressBar value={cpuPercent ?? 0} max={100} color="bg-blue-500" />
        </div>

        {/* RAM */}
        <div>
          <div className="flex justify-between items-center mb-0.5">
            <span className="metric-label">RAM</span>
            <span className="metric-value">
              {ramMb !== null ? `${ramMb} MB` : '— MB'}
            </span>
          </div>
          <ProgressBar value={ramMb ?? 0} max={4096} color="bg-purple-500" />
        </div>

        {/* Latency + RTF */}
        <div className="border-t border-slate-100 pt-2">
          <div className="metric-row">
            <span className="metric-label">Inference Latency</span>
            <span className="metric-value">
              {latencyMs !== null ? `${latencyMs} ms` : '— ms'}
            </span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Real-Time Factor</span>
            <span className={`metric-value ${rtf !== null && rtf < 1 ? 'text-emerald-700' : 'text-amber-600'}`}>
              {rtf !== null ? rtf.toFixed(3) : '—'}
            </span>
          </div>
        </div>

        {!connected && (
          <div className="text-2xs text-slate-400 font-mono text-center px-2 py-1.5 bg-slate-50 rounded-sm border border-panel-border">
            Pi metrics appear when device is connected
          </div>
        )}
      </div>
    </div>
  );
};
