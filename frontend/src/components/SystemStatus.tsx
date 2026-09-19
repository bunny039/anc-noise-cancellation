/* ============================================================
   components/SystemStatus.tsx
   Right panel: live system status parameters
   ============================================================ */
import React from 'react';
import { Server, Cpu, Radio } from 'lucide-react';
import type { SystemStatus as SystemStatusType, SystemStatusResponse } from '../types';

interface SystemStatusProps {
  status: SystemStatusType;
  sysInfo: SystemStatusResponse | null;
  latencyMs: number | null;
  chunkSeconds: number;
}

const Row: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label, value, highlight,
}) => (
  <div className="metric-row">
    <span className="metric-label">{label}</span>
    <span className={`metric-value ${highlight ? 'text-defence-700' : ''}`}>{value}</span>
  </div>
);

const STATUS_COLOR: Record<SystemStatusType, string> = {
  READY:       'text-emerald-700 bg-emerald-100 border-emerald-200',
  RECORDING:   'text-red-700 bg-red-100 border-red-200',
  UPLOADING:   'text-amber-700 bg-amber-100 border-amber-200',
  ANALYZING:   'text-blue-700 bg-blue-100 border-blue-200',
  PROCESSING:  'text-amber-700 bg-amber-100 border-amber-200',
  COMPLETE:    'text-emerald-700 bg-emerald-100 border-emerald-200',
  ERROR:       'text-red-700 bg-red-100 border-red-200',
};

export const SystemStatus: React.FC<SystemStatusProps> = ({
  status, sysInfo, latencyMs, chunkSeconds,
}) => {
  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <Server size={10} />
          System Status
        </span>
      </div>

      <div className="px-2.5 py-2">
        {/* Processing state badge */}
        <div className={`flex items-center justify-center gap-1.5 py-1.5 mb-2 rounded-sm border text-xs font-semibold font-mono
          ${STATUS_COLOR[status]}`}>
          <Radio size={11} className={
            status === 'PROCESSING' || status === 'ANALYZING' ? 'animate-pulse' :
            status === 'RECORDING' ? 'blink' : ''
          } />
          {status}
        </div>

        <div className="space-y-0">
          <Row label="Model" value={sysInfo?.model ?? 'DeepFilterNet3'} highlight />
          <Row label="Format" value={sysInfo?.model_format ?? 'ONNX'} />
          <Row label="Device" value={sysInfo?.device ?? 'CPU'} />
          <Row label="Sample Rate" value={sysInfo?.sample_rate ? `${(sysInfo.sample_rate / 1000).toFixed(0)} kHz` : '48 kHz'} />
          <Row label="Channels" value={sysInfo?.channels ?? 'Mono'} />
          <Row label="Chunk Size" value={`${chunkSeconds.toFixed(1)} s`} />
          <Row label="Latency" value={latencyMs !== null ? `${latencyMs} ms` : '— ms'} />
        </div>

        {/* Backend connection */}
        <div className="mt-2 pt-2 border-t border-panel-border">
          <div className={`flex items-center gap-1.5 py-1 px-2 rounded-sm border text-2xs font-mono font-semibold
            ${sysInfo
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'}`}>
            <span className={`status-dot ${sysInfo ? 'bg-emerald-500' : 'bg-red-500'} ${!sysInfo ? 'blink' : ''}`} />
            Backend: {sysInfo ? 'CONNECTED' : 'DISCONNECTED'}
          </div>

          {sysInfo?.onnx_loaded !== undefined && (
            <div className={`flex items-center gap-1.5 mt-1 py-1 px-2 rounded-sm border text-2xs font-mono
              ${sysInfo.onnx_loaded
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              <Cpu size={9} />
              ONNX Sessions: {sysInfo.onnx_loaded ? 'LOADED' : 'Not loaded'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
