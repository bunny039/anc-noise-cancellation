/* ============================================================
   components/AudioComparison.tsx
   Synchronized A/B audio comparison panel
   ============================================================ */
import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, ArrowLeftRight } from 'lucide-react';

interface AudioComparisonProps {
  noisyUrl: string | null;
  enhancedUrl: string | null;
  jobId: string | null;
}

type ActiveChannel = 'noisy' | 'enhanced';

function AudioPlayer({
  url, label, color, isAB, abActive,
}: {
  url: string | null;
  label: string;
  color: string;
  isAB?: boolean;
  abActive?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCT] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setCT(0);
  }, [url]);

  const toggle = () => {
    if (!audioRef.current || !url) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const formatT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(0).padStart(2, '0')}`;

  return (
    <div className={`px-2.5 py-2 border rounded-sm transition-all ${
      isAB && abActive
        ? `border-${color}-400 bg-${color}-50`
        : 'border-panel-border bg-white'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${url ? 'bg-' + color + '-500' : 'bg-slate-300'}`} />
          <span className="text-2xs font-semibold font-mono text-slate-700">{label}</span>
          {isAB && abActive && (
            <span className={`text-2xs font-mono px-1 py-0.5 rounded-sm bg-${color}-100 text-${color}-700`}>
              PLAYING
            </span>
          )}
        </div>
        <span className="text-2xs font-mono text-slate-400">
          {formatT(currentTime)} / {formatT(duration)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          disabled={!url}
          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
            ${url
              ? 'bg-defence-600 text-white hover:bg-defence-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
        >
          {playing ? <Pause size={10} /> : <Play size={10} />}
        </button>

        {/* Seek bar */}
        <div
          className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden cursor-pointer"
          onClick={e => {
            if (!audioRef.current || !url) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = frac * (audioRef.current.duration || 0);
          }}
        >
          <div
            className={`h-full rounded-full transition-all bg-${color}-500`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <Volume2 size={11} className="text-slate-400" />
      </div>

      <audio
        ref={audioRef}
        src={url ?? undefined}
        onTimeUpdate={e => {
          const el = e.currentTarget;
          setCT(el.currentTime);
          setProgress(el.duration ? el.currentTime / el.duration : 0);
        }}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

export const AudioComparison: React.FC<AudioComparisonProps> = ({
  noisyUrl, enhancedUrl, jobId: _jobId,
}) => {
  const [abMode, setAbMode] = useState(false);
  const [abChannel, setAbChannel] = useState<ActiveChannel>('noisy');
  const noisyRef = useRef<HTMLAudioElement>(null);
  const enhancedRef = useRef<HTMLAudioElement>(null);
  const [abPlaying, setAbPlaying] = useState(false);

  // A/B keyboard shortcut
  useEffect(() => {
    if (!abMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setAbChannel(c => c === 'noisy' ? 'enhanced' : 'noisy');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abMode]);

  // A/B playback management
  useEffect(() => {
    if (!abMode || !abPlaying) return;
    const noisy = noisyRef.current;
    const enhanced = enhancedRef.current;
    if (!noisy || !enhanced) return;

    if (abChannel === 'noisy') {
      const t = enhanced.currentTime;
      enhanced.pause();
      noisy.currentTime = t;
      noisy.play();
    } else {
      const t = noisy.currentTime;
      noisy.pause();
      enhanced.currentTime = t;
      enhanced.play();
    }
  }, [abChannel, abMode, abPlaying]);

  const toggleABPlay = () => {
    if (!noisyUrl || !enhancedUrl) return;
    if (abPlaying) {
      noisyRef.current?.pause();
      enhancedRef.current?.pause();
      setAbPlaying(false);
    } else {
      setAbPlaying(true);
      (abChannel === 'noisy' ? noisyRef : enhancedRef).current?.play();
    }
  };

  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <ArrowLeftRight size={10} />
          Before / After Comparison
        </span>
        <button
          onClick={() => { setAbMode(m => !m); setAbPlaying(false); }}
          className={`text-2xs font-semibold px-2 py-0.5 rounded-sm border font-mono transition-colors
            ${abMode
              ? 'bg-defence-700 text-white border-defence-800'
              : 'bg-white text-slate-600 border-panel-border hover:bg-slate-50'}`}
        >
          A/B MODE {abMode ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="px-2.5 py-2 space-y-2">
        {abMode ? (
          <>
            <div className="flex items-center justify-between px-2 py-1.5 bg-slate-900 rounded-sm">
              <div className="text-2xs text-white font-mono">
                Now playing: <span className={abChannel === 'noisy' ? 'text-blue-400' : 'text-emerald-400'}>
                  {abChannel === 'noisy' ? '▶ NOISY INPUT' : '▶ ENHANCED OUTPUT'}
                </span>
              </div>
              <div className="text-2xs text-slate-400 font-mono">Space = switch</div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setAbChannel('noisy'); }}
                className={`flex-1 py-1.5 text-2xs font-semibold font-mono rounded-sm border transition-colors
                  ${abChannel === 'noisy'
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white text-slate-600 border-panel-border hover:bg-slate-50'}`}
              >
                [ A ] NOISY
              </button>
              <button
                onClick={() => { setAbChannel('enhanced'); }}
                className={`flex-1 py-1.5 text-2xs font-semibold font-mono rounded-sm border transition-colors
                  ${abChannel === 'enhanced'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-slate-600 border-panel-border hover:bg-slate-50'}`}
              >
                [ B ] ENHANCED
              </button>
            </div>

            <button
              onClick={toggleABPlay}
              disabled={!noisyUrl || !enhancedUrl}
              className={`w-full btn-primary ${!noisyUrl || !enhancedUrl ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {abPlaying ? <Pause size={11} /> : <Play size={11} />}
              {abPlaying ? 'PAUSE A/B' : 'PLAY A/B'}
            </button>

            {/* Hidden A/B audio elements */}
            <audio ref={noisyRef} src={noisyUrl ?? undefined} onEnded={() => setAbPlaying(false)} />
            <audio ref={enhancedRef} src={enhancedUrl ?? undefined} onEnded={() => setAbPlaying(false)} />
          </>
        ) : (
          <>
            <AudioPlayer url={noisyUrl} label="NOISY INPUT" color="blue" />
            <AudioPlayer url={enhancedUrl} label="ENHANCED OUTPUT" color="emerald" />
          </>
        )}
      </div>
    </div>
  );
};
