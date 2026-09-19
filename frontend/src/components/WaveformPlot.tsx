/* ============================================================
   components/WaveformPlot.tsx
   Time-domain waveform using Recharts AreaChart
   ============================================================ */
import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Play, Pause, Volume2 } from 'lucide-react';
import type { WaveformPoint } from '../types';

interface WaveformPlotProps {
  title: string;
  data: WaveformPoint[] | null;
  color?: string;
  audioUrl?: string | null;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  peakAmplitude?: number;
  rms?: number;
  isLoading?: boolean;
  label?: string;
}

const EMPTY_DATA: WaveformPoint[] = Array.from({ length: 80 }, (_, i) => ({
  t: i * 0.05,
  v: 0,
}));

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

export const WaveformPlot: React.FC<WaveformPlotProps> = ({
  title, data, color = '#3b82f6', audioUrl, duration,
  sampleRate, channels, peakAmplitude, rms, isLoading, label,
}) => {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const plotData = useMemo(() => {
    if (!data || data.length === 0) return EMPTY_DATA;
    // Downsample to max 600 points for smooth rendering
    const step = Math.max(1, Math.floor(data.length / 600));
    return data.filter((_, i) => i % step === 0);
  }, [data]);

  const hasData = !!data && data.length > 0;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        {label && (
          <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-sm font-mono border
            ${label === 'NOISY' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {label}
          </span>
        )}
      </div>

      <div className="px-2 pt-2 pb-1">
        {/* Loading overlay */}
        {isLoading && (
          <div className="flex items-center justify-center h-20 bg-slate-50 border border-panel-border rounded-sm">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border-2 border-defence-500 border-t-transparent rounded-full animate-spin" />
              Analyzing waveform…
            </div>
          </div>
        )}

        {/* Chart */}
        {!isLoading && (
          <div className={`relative ${!hasData ? 'opacity-30' : ''}`}>
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={plotData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={v => `${v.toFixed(1)}s`}
                  tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[-1, 1]}
                  tickFormatter={v => v.toFixed(1)}
                  tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as WaveformPoint;
                    return (
                      <div className="bg-slate-900 text-white text-2xs px-2 py-1 rounded font-mono">
                        <div>t = {d.t.toFixed(3)} s</div>
                        <div>v = {d.v.toFixed(4)}</div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.15}
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xs text-slate-400 font-mono">No audio loaded</span>
              </div>
            )}
          </div>
        )}

        {/* Audio player */}
        {audioUrl && (
          <div className="mt-1.5 flex items-center gap-2 px-2 py-1 bg-slate-50 border border-panel-border rounded-sm">
            <button
              onClick={togglePlay}
              className="w-5 h-5 rounded-full bg-defence-600 text-white flex items-center justify-center hover:bg-defence-700 transition-colors flex-shrink-0"
            >
              {playing ? <Pause size={9} /> : <Play size={9} />}
            </button>
            <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-defence-500 transition-all duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <Volume2 size={10} className="text-slate-400" />
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={e => {
                const el = e.currentTarget;
                setProgress(el.duration ? el.currentTime / el.duration : 0);
              }}
              onEnded={() => setPlaying(false)}
            />
          </div>
        )}

        {/* Metadata row */}
        {hasData && (
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            {duration !== undefined && (
              <span className="text-2xs text-slate-500 font-mono">
                <span className="text-slate-400">DUR</span> {formatTime(duration)}
              </span>
            )}
            {sampleRate !== undefined && (
              <span className="text-2xs text-slate-500 font-mono">
                <span className="text-slate-400">SR</span> {(sampleRate / 1000).toFixed(0)} kHz
              </span>
            )}
            {channels !== undefined && (
              <span className="text-2xs text-slate-500 font-mono">
                <span className="text-slate-400">CH</span> {channels === 1 ? 'Mono' : 'Stereo'}
              </span>
            )}
            {peakAmplitude !== undefined && (
              <span className="text-2xs text-slate-500 font-mono">
                <span className="text-slate-400">PEAK</span> {peakAmplitude.toFixed(3)}
              </span>
            )}
            {rms !== undefined && (
              <span className="text-2xs text-slate-500 font-mono">
                <span className="text-slate-400">RMS</span> {rms.toFixed(4)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
