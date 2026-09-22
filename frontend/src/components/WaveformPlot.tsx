/* ============================================================
   components/WaveformPlot.tsx — Futuristic Defence Waveform HUD Card
   ============================================================ */
import React, { useMemo, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Play, Pause, Volume2, Waves } from 'lucide-react';
import type { WaveformPoint } from '../types';

interface WaveformPlotProps {
  title: string;
  data: WaveformPoint[] | null;
  color?: string;
  fillColor?: string;
  audioUrl?: string | null;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  peakAmplitude?: number;
  rms?: number;
  isLoading?: boolean;
  label?: string;
  variant?: 'noisy' | 'enhanced';
}

const EMPTY: WaveformPoint[] = Array.from({ length: 60 }, (_, i) => ({ t: i * 0.1, v: 0 }));

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(0).padStart(2, '0')}`;
}

export const WaveformPlot: React.FC<WaveformPlotProps> = ({
  title, data, color, fillColor, audioUrl,
  duration, sampleRate, channels, peakAmplitude, rms,
  isLoading, label, variant = 'noisy',
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [dur, setDur] = useState(0);

  const isNoisy = variant === 'noisy';
  const accentColor = color ?? (isNoisy ? '#f59e0b' : '#00f0ff');
  const plotColor = data ? accentColor : '#334155';
  const fillGradient = fillColor ?? accentColor;

  const plotData = useMemo(() => {
    if (!data || data.length === 0) return EMPTY;
    const step = Math.max(1, Math.floor(data.length / 500));
    return data.filter((_, i) => i % step === 0);
  }, [data]);

  const hasData = !!data && data.length > 0;

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div className="hud-panel flex flex-col overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <Waves size={13} style={{ color: accentColor }} />
          <span className="text-xs font-bold text-white tracking-wide font-mono uppercase">{title}</span>
        </div>
        {label && (
          <span className={isNoisy ? 'tag tag-noisy' : 'tag tag-enhanced'}>{label}</span>
        )}
      </div>

      <div className="px-3 py-2.5">
        {/* Loading skeleton */}
        {isLoading && (
          <div className="h-[76px] rounded-lg overflow-hidden relative bg-slate-950/80 border border-slate-800">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent animate-signal-flow" />
          </div>
        )}

        {/* Chart */}
        {!isLoading && (
          <div className={`relative transition-opacity duration-300 ${!hasData ? 'opacity-30' : ''}`}>
            <ResponsiveContainer width="100%" height={76}>
              <AreaChart data={plotData} margin={{ top: 4, right: 2, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id={`wfill-${variant}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={fillGradient} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={fillGradient} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 3" stroke="rgba(56, 189, 248, 0.07)" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v: number) => `${v.toFixed(1)}s`}
                  tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: '#64748b' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  domain={[-1, 1]}
                  tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: '#64748b' }}
                  axisLine={false} tickLine={false} width={24}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as WaveformPoint;
                    return (
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono shadow-xl">
                        <div className="text-slate-400">t = {d.t.toFixed(3)} s</div>
                        <div style={{ color: accentColor }} className="font-bold">v = {d.v.toFixed(4)}</div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone" dataKey="v"
                  stroke={plotColor} strokeWidth={1.8}
                  fill={`url(#wfill-${variant})`}
                  dot={false} isAnimationActive={hasData}
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] text-slate-400 font-mono">No audio loaded</span>
              </div>
            )}
          </div>
        )}

        {/* Player */}
        {audioUrl && (
          <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800">
            <button onClick={togglePlay}
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
              style={{ background: accentColor + '25', border: `1px solid ${accentColor}60` }}>
              {playing
                ? <Pause size={10} style={{ color: accentColor }} />
                : <Play size={10} style={{ color: accentColor }} />
              }
            </button>
            <div className="text-[10px] font-mono text-slate-400 w-12 text-center">
              {fmt(currentTime)} / {fmt(dur || duration || 0)}
            </div>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden cursor-pointer bg-slate-900"
              onClick={e => {
                if (!audioRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * (audioRef.current.duration || 0);
              }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }} />
            </div>
            <Volume2 size={11} className="text-slate-400 flex-shrink-0" />
            <audio ref={audioRef} src={audioUrl}
              onTimeUpdate={e => { const el = e.currentTarget; setCurrentTime(el.currentTime); setProgress(el.duration ? el.currentTime / el.duration : 0); }}
              onLoadedMetadata={e => setDur(e.currentTarget.duration)}
              onEnded={() => setPlaying(false)} />
          </div>
        )}

        {/* Metadata chips */}
        {hasData && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 font-mono">
            {duration !== undefined && (
              <span className="tag text-[9px] bg-slate-900 border border-slate-800 text-slate-300">DUR {fmt(duration)}</span>
            )}
            {sampleRate !== undefined && (
              <span className="tag text-[9px] bg-slate-900 border border-slate-800 text-slate-300">SR {(sampleRate / 1000).toFixed(0)} kHz</span>
            )}
            {channels !== undefined && (
              <span className="tag text-[9px] bg-slate-900 border border-slate-800 text-slate-300">{channels === 1 ? 'MONO' : 'STEREO'}</span>
            )}
            {peakAmplitude !== undefined && (
              <span className="tag text-[9px] bg-slate-900 border border-slate-800 text-slate-300">PEAK {peakAmplitude.toFixed(3)}</span>
            )}
            {rms !== undefined && (
              <span className="tag text-[9px] bg-slate-900 border border-slate-800 text-slate-300">RMS {rms.toFixed(4)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
