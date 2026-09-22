/* ============================================================
   components/SpectrumPlot.tsx — Futuristic Defence FFT Spectrum HUD
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ZoomIn, ZoomOut, BarChart2 } from 'lucide-react';
import type { SpectrumPoint } from '../types';

interface SpectrumPlotProps {
  title: string;
  data: SpectrumPoint[] | null;
  color?: string;
  isLoading?: boolean;
  label?: string;
  variant?: 'noisy' | 'enhanced';
}

const EMPTY: SpectrumPoint[] = Array.from({ length: 80 }, (_, i) => ({ f: i * 100, db: -70 + Math.sin(i * 0.3) * 5 }));

export const SpectrumPlot: React.FC<SpectrumPlotProps> = ({
  title, data, isLoading, label, variant = 'noisy',
}) => {
  const [maxFreq, setMaxFreq] = useState(8000);

  const isNoisy = variant === 'noisy';
  const accentColor = isNoisy ? '#f59e0b' : '#00f0ff';

  const plotData = useMemo(() => {
    if (!data || data.length === 0) return EMPTY;
    return data.filter(p => p.f <= maxFreq);
  }, [data, maxFreq]);

  const hasData = !!data && data.length > 0;

  const peakPoint = useMemo(() => {
    if (!data) return null;
    return data.reduce((best, p) => (!best || p.db > best.db) ? p : best, null as SpectrumPoint | null);
  }, [data]);

  return (
    <div className="hud-panel flex flex-col overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <BarChart2 size={13} style={{ color: accentColor }} />
          <span className="text-xs font-bold text-white tracking-wide font-mono uppercase">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {label && <span className={isNoisy ? 'tag tag-noisy' : 'tag tag-enhanced'}>{label}</span>}
          <div className="flex gap-1 font-mono">
            <button className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
              onClick={() => setMaxFreq(v => Math.max(1000, v - 1000))}>
              <ZoomIn size={11} />
            </button>
            <button className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
              onClick={() => setMaxFreq(v => Math.min(24000, v + 1000))}>
              <ZoomOut size={11} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5">
        {isLoading && (
          <div className="h-[76px] rounded-lg overflow-hidden relative bg-slate-950/80 border border-slate-800">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent animate-signal-flow" />
          </div>
        )}
        {!isLoading && (
          <div className={`relative transition-opacity duration-300 ${!hasData ? 'opacity-30' : ''}`}>
            <ResponsiveContainer width="100%" height={76}>
              <LineChart data={plotData} margin={{ top: 4, right: 2, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="2 3" stroke="rgba(56, 189, 248, 0.07)" />
                <XAxis
                  dataKey="f"
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                  tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: '#64748b' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  domain={[-80, 0]}
                  tickFormatter={(v: number) => `${v}`}
                  tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: '#64748b' }}
                  axisLine={false} tickLine={false} width={24}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as SpectrumPoint;
                    return (
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono shadow-xl">
                        <div className="text-slate-400">{d.f >= 1000 ? `${(d.f / 1000).toFixed(2)} kHz` : `${d.f.toFixed(0)} Hz`}</div>
                        <div style={{ color: accentColor }} className="font-bold">{d.db.toFixed(1)} dBFS</div>
                      </div>
                    );
                  }}
                />
                {peakPoint && (
                  <ReferenceLine x={peakPoint.f} stroke="#f59e0b66" strokeDasharray="3 2" strokeWidth={1} />
                )}
                <Line type="monotone" dataKey="db" stroke={accentColor} strokeWidth={1.8}
                  dot={false} isAnimationActive={hasData} animationDuration={600} />
              </LineChart>
            </ResponsiveContainer>
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] text-slate-400 font-mono">No spectrum data</span>
              </div>
            )}
          </div>
        )}

        {hasData && peakPoint && (
          <div className="mt-2 flex items-center justify-between font-mono text-[10px]">
            <span className="text-amber-400 font-bold">
              ↑ Dominant Resonance: {peakPoint.f >= 1000 ? `${(peakPoint.f / 1000).toFixed(2)} kHz` : `${peakPoint.f.toFixed(0)} Hz`}
              {' '}({peakPoint.db.toFixed(1)} dBFS)
            </span>
            <span className="text-slate-400">Bandwidth: 0 – {(maxFreq / 1000).toFixed(0)} kHz</span>
          </div>
        )}
      </div>
    </div>
  );
};
