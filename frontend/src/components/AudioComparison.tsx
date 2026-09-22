/* ============================================================
   components/AudioComparison.tsx — Futuristic Defence A/B Comparison HUD
   ============================================================ */
import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, SkipBack, ArrowLeftRight } from 'lucide-react';

interface AudioComparisonProps {
  noisyUrl: string | null;
  enhancedUrl: string | null;
  jobId: string | null;
}

type ActiveChannel = 'noisy' | 'enhanced';

interface PlayerProps {
  url: string | null;
  label: string;
  accentColor: string;
  variant: 'noisy' | 'enhanced';
}

const Player: React.FC<PlayerProps> = ({ url, label, accentColor, variant }) => {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCT] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => { setPlaying(false); setProgress(0); setCT(0); }, [url]);

  const toggle = () => {
    if (!ref.current || !url) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || !url) return;
    const rect = e.currentTarget.getBoundingClientRect();
    ref.current.currentTime = ((e.clientX - rect.left) / rect.width) * (ref.current.duration || 0);
  };

  const restart = () => { if (ref.current) { ref.current.currentTime = 0; } };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(0).padStart(2, '0')}`;

  return (
    <div className="flex-1 p-3.5 rounded-xl transition-all duration-200 bg-slate-950/80 border border-slate-800">
      {/* Label */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
          <span className={`text-xs font-bold font-mono tracking-wider ${variant === 'noisy' ? 'text-amber-300' : 'text-cyan-300'}`}>
            {label}
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">{fmt(currentTime)} / {fmt(dur)}</span>
      </div>

      {/* Seek bar */}
      <div className="h-1.5 rounded-full mb-3 overflow-hidden cursor-pointer bg-slate-900"
        onClick={seek}>
        <div className="h-full rounded-full transition-all duration-100"
          style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}99)` }} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 font-mono">
        <button onClick={restart} disabled={!url}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30">
          <SkipBack size={11} />
        </button>
        <button onClick={toggle} disabled={!url}
          className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-all"
          style={{
            background: url ? `${accentColor}25` : 'rgba(255,255,255,0.05)',
            border: `1px solid ${url ? accentColor + '60' : 'rgba(255,255,255,0.1)'}`,
          }}>
          {playing
            ? <Pause size={12} style={{ color: accentColor }} />
            : <Play size={12} style={{ color: url ? accentColor : '#475569' }} />
          }
        </button>
        <div className="flex-1" />
        <Volume2 size={12} className="text-slate-400 flex-shrink-0" />
      </div>

      <audio ref={ref} src={url ?? undefined}
        onTimeUpdate={e => { const el = e.currentTarget; setCT(el.currentTime); setProgress(el.duration ? el.currentTime / el.duration : 0); }}
        onLoadedMetadata={e => setDur(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)} />
    </div>
  );
};

export const AudioComparison: React.FC<AudioComparisonProps> = ({
  noisyUrl, enhancedUrl, jobId: _jobId,
}) => {
  const [abMode, setAbMode] = useState(false);
  const [abChannel, setAbChannel] = useState<ActiveChannel>('noisy');
  const [abPlaying, setAbPlaying] = useState(false);
  const noisyRef = useRef<HTMLAudioElement>(null);
  const enhancedRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!abMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); setAbChannel(c => c === 'noisy' ? 'enhanced' : 'noisy'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abMode]);

  useEffect(() => {
    if (!abMode || !abPlaying) return;
    const noisy = noisyRef.current;
    const enhanced = enhancedRef.current;
    if (!noisy || !enhanced) return;
    if (abChannel === 'noisy') { enhanced.pause(); noisy.currentTime = enhanced.currentTime; noisy.play(); }
    else { noisy.pause(); enhanced.currentTime = noisy.currentTime; enhanced.play(); }
  }, [abChannel, abMode, abPlaying]);

  const toggleABPlay = () => {
    if (!noisyUrl || !enhancedUrl) return;
    if (abPlaying) { noisyRef.current?.pause(); enhancedRef.current?.pause(); setAbPlaying(false); }
    else { setAbPlaying(true); (abChannel === 'noisy' ? noisyRef : enhancedRef).current?.play(); }
  };

  return (
    <div className="hud-panel overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={14} className="text-cyan-400" />
          <span className="text-xs font-bold text-white tracking-wide font-mono uppercase">A / B Channel Auditioning</span>
        </div>
        <button
          onClick={() => { setAbMode(m => !m); setAbPlaying(false); }}
          className={`px-3 py-1 rounded-lg text-[11px] font-bold font-mono transition-all
            ${abMode ? 'text-cyan-300 bg-cyan-950 border border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.3)]' : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'}`}
        >
          A/B Mode {abMode ? '● ACTIVE' : '○'}
        </button>
      </div>

      <div className="p-4 font-mono">
        {abMode ? (
          <div className="space-y-3">
            {/* A/B control bar */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex gap-1.5 flex-1">
                {(['noisy', 'enhanced'] as ActiveChannel[]).map(ch => (
                  <button key={ch} onClick={() => setAbChannel(ch)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono transition-all
                      ${abChannel === ch
                        ? ch === 'noisy'
                          ? 'text-amber-300 bg-amber-950/80 border border-amber-500/60 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                          : 'text-cyan-300 bg-cyan-950/80 border border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                        : 'text-slate-400 bg-slate-900 border border-slate-800 hover:text-white'}`}
                  >
                    {ch === 'noisy' ? '[A] Noisy Channel' : '[B] Enhanced Channel'}
                  </button>
                ))}
              </div>
              <button onClick={toggleABPlay} disabled={!noisyUrl || !enhancedUrl}
                className="btn-primary px-4 py-1.5 text-xs disabled:opacity-30">
                {abPlaying ? <><Pause size={12} /> PAUSE</> : <><Play size={12} /> PLAY</>}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-mono text-center">
              Press <kbd className="px-1.5 py-0.5 rounded text-[9px] bg-slate-900 border border-slate-700 text-cyan-300">Space</kbd>
              {' '}to instantly swap channels in real time during playback
            </p>
            <audio ref={noisyRef} src={noisyUrl ?? undefined} onEnded={() => setAbPlaying(false)} />
            <audio ref={enhancedRef} src={enhancedUrl ?? undefined} onEnded={() => setAbPlaying(false)} />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <Player url={noisyUrl} label="NOISY INPUT" accentColor="#f59e0b" variant="noisy" />
            <Player url={enhancedUrl} label="ENHANCED OUTPUT" accentColor="#00f0ff" variant="enhanced" />
          </div>
        )}
      </div>
    </div>
  );
};
