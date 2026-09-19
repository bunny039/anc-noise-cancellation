/* ============================================================
   components/SpectrumPlot.tsx
   Frequency-domain FFT magnitude spectrum using Recharts
   ============================================================ */
import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { SpectrumPoint } from '../types';

interface SpectrumPlotProps {
  title: string;
  data: SpectrumPoint[] | null;
  color?: string;
  isLoading?: boolean;
  label?: string;
}

const EMPTY_DATA: SpectrumPoint[] = Array.from({ length: 100 }, (_, i) => ({
  f: i * 80,
  db: -80 + Math.random() * 2 - 1,
}));

export const SpectrumPlot: React.FC<SpectrumPlotProps> = ({
  title, data, color = '#3b82f6', isLoading, label,
}) => {
  const dbRange: [number, number] = [-80, 0];
  const [maxFreq, setMaxFreq] = useState(8000);

  const plotData = useMemo(() => {
    if (!data || data.length === 0) return EMPTY_DATA;
    return data.filter(p => p.f <= maxFreq);
  }, [data, maxFreq]);

  const hasData = !!data && data.length > 0;

  // Find peak frequency
  const peakPoint = useMemo(() => {
    if (!data) return null;
    return data.reduce((best, p) => (!best || p.db > best.db) ? p : best, null as SpectrumPoint | null);
  }, [data]);

  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        <div className="flex items-center gap-2">
          {label && (
            <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-sm font-mono border
              ${label === 'NOISY' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {label}
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              className="text-slate-400 hover:text-slate-600"
              onClick={() => setMaxFreq(v => Math.max(1000, v - 1000))}
              title="Zoom in (reduce freq range)"
            >
              <ZoomIn size={11} />
            </button>
            <button
              className="text-slate-400 hover:text-slate-600"
              onClick={() => setMaxFreq(v => Math.min(24000, v + 1000))}
              title="Zoom out (extend freq range)"
            >
              <ZoomOut size={11} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-2 pt-2 pb-1">
        {isLoading && (
          <div className="flex items-center justify-center h-20 bg-slate-50 border border-panel-border rounded-sm">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border-2 border-defence-500 border-t-transparent rounded-full animate-spin" />
              Computing spectrum…
            </div>
          </div>
        )}

        {!isLoading && (
          <div className={`relative ${!hasData ? 'opacity-30' : ''}`}>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={plotData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#e5e7eb" />
                <XAxis
                  dataKey="f"
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                  tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Hz', position: 'insideRight', fontSize: 8, fill: '#9ca3af' }}
                />
                <YAxis
                  domain={dbRange}
                  tickFormatter={(v: number) => `${v}`}
                  tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  label={{ value: 'dB', angle: -90, position: 'insideLeft', fontSize: 8, fill: '#9ca3af' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as SpectrumPoint;
                    return (
                      <div className="bg-slate-900 text-white text-2xs px-2 py-1 rounded font-mono">
                        <div>{d.f >= 1000 ? `${(d.f / 1000).toFixed(2)} kHz` : `${d.f.toFixed(0)} Hz`}</div>
                        <div>{d.db.toFixed(1)} dBFS</div>
                      </div>
                    );
                  }}
                />
                {/* Peak frequency marker */}
                {peakPoint && (
                  <ReferenceLine
                    x={peakPoint.f}
                    stroke="#f59e0b"
                    strokeDasharray="3 2"
                    strokeWidth={1}
                    label={{ value: `Peak: ${peakPoint.f >= 1000 ? `${(peakPoint.f / 1000).toFixed(1)}k` : peakPoint.f.toFixed(0)}Hz`, fontSize: 7, fill: '#d97706', position: 'top' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="db"
                  stroke={color}
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xs text-slate-400 font-mono">No spectrum data</span>
              </div>
            )}
          </div>
        )}

        {/* Axis labels */}
        {hasData && peakPoint && (
          <div className="mt-1 flex items-center gap-3">
            <span className="text-2xs text-amber-600 font-mono">
              ⬆ Peak: {peakPoint.f >= 1000 ? `${(peakPoint.f / 1000).toFixed(2)} kHz` : `${peakPoint.f.toFixed(0)} Hz`}
              {' '}({peakPoint.db.toFixed(1)} dBFS)
            </span>
            <span className="text-2xs text-slate-400 font-mono">Range: 0–{(maxFreq / 1000).toFixed(0)} kHz</span>
          </div>
        )}
      </div>
    </div>
  );
};
