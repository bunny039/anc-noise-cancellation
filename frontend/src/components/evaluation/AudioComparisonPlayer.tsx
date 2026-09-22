/* ============================================================
   evaluation/AudioComparisonPlayer.tsx
   Before vs After Audio Comparison Panel for Defence Speech Enhancement.
   Features dynamic live waveform visualization, glowing sweep playheads,
   Web Audio synthetic playback and real WAV streaming.
   ============================================================ */

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, ArrowRight, Cpu, Sparkles } from 'lucide-react';
import type { EvaluationCondition } from '../../types';
import { defenceAudioEngine } from './audioSynth';

interface AudioComparisonPlayerProps {
  condition: EvaluationCondition;
  noisyAudioUrl?: string;
  enhancedAudioUrl?: string;
  theme?: 'white' | 'dark';
}

export const AudioComparisonPlayer: React.FC<AudioComparisonPlayerProps> = ({
  condition,
  noisyAudioUrl,
  enhancedAudioUrl,
}) => {
  const [playingTarget, setPlayingTarget] = useState<'noisy' | 'enhanced' | null>(null);
  const [playProgress, setPlayProgress] = useState<number>(0);

  const noisyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const enhancedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Playback timer & progress
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (playingTarget) {
      const startTime = Date.now();
      const durationMs = 3500;
      interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const p = Math.min(100, (elapsed / durationMs) * 100);
        setPlayProgress(p);
        if (p >= 100) {
          setPlayingTarget(null);
          setPlayProgress(0);
          if (interval) clearInterval(interval);
        }
      }, 30);
    } else {
      setPlayProgress(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [playingTarget]);

  // Live Canvas Waveform & Glowing Playhead Renderer
  useEffect(() => {
    const drawWaveform = (
      canvas: HTMLCanvasElement | null,
      isEnhanced: boolean,
      isPlaying: boolean,
      progress: number
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = '#050914';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      const midY = h / 2;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw bars / waveform
      const numBars = 48;
      const barWidth = w / numBars - 2;

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + 2);
        const normX = i / numBars;

        // Base speech envelope
        const speechEnv = Math.sin(normX * Math.PI * 2) * 0.5 + 0.5;
        let noiseAmp = 0;

        if (!isEnhanced) {
          // Noisy amplitude
          noiseAmp = (Math.sin(i * 1.5) * 0.4 + Math.cos(i * 0.8) * 0.3);
          if (isPlaying) {
            noiseAmp += (Math.random() - 0.5) * 0.2;
          }
        }

        const barHeight = Math.max(
          4,
          (speechEnv * (isEnhanced ? 0.75 : 0.4) + Math.abs(noiseAmp) * (isEnhanced ? 0.05 : 0.6)) * (h * 0.75)
        );

        const y = midY - barHeight / 2;

        if (isEnhanced) {
          ctx.fillStyle = normX * 100 <= progress && isPlaying ? '#00f0ff' : 'rgba(0, 240, 255, 0.45)';
          if (isPlaying && normX * 100 <= progress) {
            ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
            ctx.shadowBlur = 6;
          } else {
            ctx.shadowBlur = 0;
          }
        } else {
          ctx.fillStyle = normX * 100 <= progress && isPlaying ? '#f59e0b' : 'rgba(245, 158, 11, 0.45)';
          if (isPlaying && normX * 100 <= progress) {
            ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
            ctx.shadowBlur = 6;
          } else {
            ctx.shadowBlur = 0;
          }
        }

        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.shadowBlur = 0;
      }

      // Glowing Playhead
      if (isPlaying && progress > 0) {
        const playheadX = (progress / 100) * w;
        ctx.strokeStyle = isEnhanced ? '#ffffff' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = isEnhanced ? '#00f0ff' : '#f59e0b';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, h);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    drawWaveform(noisyCanvasRef.current, false, playingTarget === 'noisy', playProgress);
    drawWaveform(enhancedCanvasRef.current, true, playingTarget === 'enhanced', playProgress);
  }, [playingTarget, playProgress]);

  const handleTogglePlay = (target: 'noisy' | 'enhanced') => {
    if (playingTarget === target) {
      defenceAudioEngine.stopAudio();
      setPlayingTarget(null);
      setPlayProgress(0);
    } else {
      const audioUrl = target === 'enhanced' ? enhancedAudioUrl : noisyAudioUrl;
      if (audioUrl) {
        defenceAudioEngine.stopAudio();
        const audio = new Audio(audioUrl);
        setPlayingTarget(target);
        audio.onended = () => {
          setPlayingTarget(null);
          setPlayProgress(0);
        };
        audio.play().catch(() => {
          defenceAudioEngine.playAudio(condition, target, () => {
            setPlayingTarget(null);
            setPlayProgress(0);
          });
        });
      } else {
        setPlayingTarget(target);
        defenceAudioEngine.playAudio(condition, target, () => {
          setPlayingTarget(null);
          setPlayProgress(0);
        });
      }
    }
  };

  return (
    <div className="hud-panel p-6 border border-cyan-500/20 bg-[#070e1c]/90 backdrop-blur-xl">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.2)]">
            <Volume2 size={16} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold font-mono tracking-wider uppercase text-white">
              Audio Comparison — BEFORE vs AFTER
            </h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Audition raw military noisy microphone input vs DeepFilterNet3 enhanced speech
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-slate-400">Environment:</span>
          <span className="px-3 py-1 rounded-md font-bold bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
            {condition} · 3.5s 48 kHz
          </span>
        </div>
      </div>

      {/* ── 3-Column Comparison Grid ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-6">
        {/* LEFT: NOISY INPUT */}
        <div className="hud-card-compact p-5 border border-amber-500/30 bg-[#080f20] shadow-md relative group hover:border-amber-500/60 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              <span className="font-mono text-xs font-black uppercase tracking-wider text-amber-300">
                BEFORE: Noisy Input
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Original Speech</span>
          </div>

          <p className="text-xs font-mono text-slate-300 mb-3 leading-relaxed">
            Corrupted by hostile {condition.toLowerCase()} environmental acoustics.
          </p>

          {/* Canvas Waveform */}
          <div className="h-20 w-full rounded-lg overflow-hidden border border-amber-950/80 mb-3 relative">
            <canvas ref={noisyCanvasRef} className="w-full h-full" />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => handleTogglePlay('noisy')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all shadow-md ${
                playingTarget === 'noisy'
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                  : 'bg-amber-950/60 text-amber-300 hover:bg-amber-900/80 border border-amber-500/40 hover:border-amber-400'
              }`}
            >
              {playingTarget === 'noisy' ? <Pause size={14} /> : <Play size={14} />}
              <span>{playingTarget === 'noisy' ? 'PAUSE ORIGINAL' : 'PLAY ORIGINAL'}</span>
            </button>

            <span className="text-[10px] font-mono text-slate-400">
              {playingTarget === 'noisy' ? `${Math.round(playProgress)}%` : 'Raw Capture'}
            </span>
          </div>
        </div>

        {/* CENTER CONDUIT */}
        <div className="flex flex-col items-center justify-center p-3 text-center font-mono">
          <div className="flex lg:flex-col items-center gap-2 text-xs font-bold text-slate-300">
            <span className="px-2.5 py-1 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[10px] uppercase font-black">
              NOISE
            </span>
            <ArrowRight size={14} className="text-cyan-400 rotate-90 lg:rotate-0 hidden lg:block" />
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-950 border border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.3)] text-[10px] font-extrabold uppercase">
              <Cpu size={13} className="text-cyan-400 animate-spin" />
              <span>AI</span>
            </div>
            <ArrowRight size={14} className="text-cyan-400 rotate-90 lg:rotate-0 hidden lg:block" />
            <span className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] uppercase font-black">
              ENHANCED
            </span>
          </div>
        </div>

        {/* RIGHT: ENHANCED OUTPUT */}
        <div className="hud-card-compact p-5 border-2 border-cyan-400/80 bg-[#07152b] shadow-[0_0_30px_rgba(0,240,255,0.2)] relative group hover:border-cyan-300 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping shadow-[0_0_8px_rgba(0,240,255,0.8)]" />
              <span className="font-mono text-xs font-black uppercase tracking-wider text-cyan-200">
                AFTER: AI Enhanced Speech
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/50 text-cyan-300">
              <Sparkles size={10} /> DeepFilterNet3
            </span>
          </div>

          <p className="text-xs font-mono text-cyan-100 mb-3 leading-relaxed">
            Attenuated noise floor with preserved vocal timbre & high intelligibility.
          </p>

          {/* Canvas Waveform */}
          <div className="h-20 w-full rounded-lg overflow-hidden border border-cyan-500/40 mb-3 relative shadow-inner">
            <canvas ref={enhancedCanvasRef} className="w-full h-full" />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => handleTogglePlay('enhanced')}
              className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg font-mono text-xs font-black tracking-wide uppercase transition-all shadow-lg ${
                playingTarget === 'enhanced'
                  ? 'bg-cyan-400 text-slate-950 ring-2 ring-white shadow-[0_0_20px_rgba(0,240,255,0.8)]'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-[0_0_15px_rgba(0,240,255,0.4)]'
              }`}
            >
              {playingTarget === 'enhanced' ? <Pause size={14} /> : <Play size={14} />}
              <span>{playingTarget === 'enhanced' ? 'PAUSE ENHANCED' : 'PLAY ENHANCED'}</span>
            </button>

            <span className="text-[10px] font-mono text-cyan-300 font-bold">
              {playingTarget === 'enhanced' ? `${Math.round(playProgress)}%` : 'Neural Output'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
