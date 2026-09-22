/* ============================================================
   components/HeroSection.tsx
   Futuristic Defence Command Hero Section with Physics-Driven
   Acoustic Waveform Canvas, Signal Transformation Conduit,
   and Live System Status HUD Panel.
   ============================================================ */
import React, { useEffect, useRef } from 'react';
import {
  Shield,
  Cpu,
  Radio,
  ArrowDown,
  Play,
  Upload,
} from 'lucide-react';
import type { SystemStatus } from '../types';

interface HeroSectionProps {
  status?: SystemStatus;
  onRunEvaluation: () => void;
  onUploadClick: () => void;
  isEvaluating?: boolean;
  onSelectAnchor?: (anchorId: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onRunEvaluation,
  onUploadClick,
  isEvaluating = false,
  onSelectAnchor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // High-performance canvas animation simulating authentic military acoustic harmonics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.025;
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

      const midY = h / 2;

      // Draw subtle background grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Draw 3 harmonic waveform layers representing acoustic noise & clean speech convergence
      const layers = [
        { color: 'rgba(245, 158, 11, 0.35)', speed: 1.2, freq: 0.015, amp: 28, noise: 12, label: 'RAW ACOUSTIC' },
        { color: 'rgba(56, 189, 248, 0.5)',  speed: 1.8, freq: 0.022, amp: 20, noise: 4,  label: 'FILTERED' },
        { color: 'rgba(0, 240, 255, 0.85)', speed: 2.2, freq: 0.028, amp: 35, noise: 1,  label: 'ENHANCED VOICE' },
      ];

      layers.forEach((layer, idx) => {
        ctx.beginPath();
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = idx === 2 ? 2.5 : 1.2;

        if (idx === 2) {
          ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
          ctx.shadowBlur = 12;
        } else {
          ctx.shadowBlur = 0;
        }

        for (let x = 0; x < w; x += 3) {
          const t = x * layer.freq + time * layer.speed;
          // Harmonic speech envelope
          const speechPulse = Math.sin(t * 0.4) * Math.cos(t * 0.15);
          const fundamental = Math.sin(t) * layer.amp;
          const harmonic = Math.sin(t * 2.5) * (layer.amp * 0.4);
          const noiseComponent = (Math.sin(x * 0.8 + time * 3) + Math.cos(x * 0.4 - time * 2)) * layer.noise;

          const y = midY + (fundamental + harmonic + noiseComponent) * (0.6 + 0.4 * speechPulse);

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });

      ctx.shadowBlur = 0;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <section className="relative overflow-hidden pt-8 pb-12 px-4 sm:px-6 lg:px-8 border-b border-cyan-500/15">
      {/* Background Radial Atmosphere Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[400px] bg-cyan-500/10 blur-[140px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-0 right-1/4 w-[400px] h-[300px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Dynamic Animated Waveform Canvas in Background */}
      <div className="absolute inset-0 opacity-40 pointer-events-none -z-10">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* ── Left Column: Primary Headline & Badges (7 cols) ── */}
          <div className="lg:col-span-7 flex flex-col items-start gap-4 z-10">
            {/* Live Operational Status & Defence Protocol Badges */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="status-pill bg-cyan-950/70 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                <span className="dot-live bg-cyan-400 animate-pulse" />
                <span className="tracking-widest">● SYSTEM OPERATIONAL</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-mono font-bold tracking-wider uppercase bg-slate-900/80 border border-slate-700/70 text-slate-300">
                <Shield size={12} className="text-cyan-400" />
                <span>DRDO PS-26052</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-extrabold tracking-widest uppercase bg-gradient-to-r from-cyan-950/80 to-blue-950/80 border border-cyan-500/30 text-cyan-200">
                <span>DEEP LEARNING • REAL-TIME • EDGE READY</span>
              </div>
            </div>

            {/* Main Title */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight font-display text-white leading-[1.1]">
              DEFENCE SPEECH <br />
              <span className="text-gradient-cyan drop-shadow-[0_0_25px_rgba(0,240,255,0.35)]">
                ENHANCEMENT SYSTEM
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-300 font-normal leading-relaxed max-w-2xl">
              AI-powered speech enhancement for high-noise defence environments. Real-time neural noise suppression across airborne, armored vehicle, and battlefield acoustic conditions.
            </p>

            {/* Signal Transformation Flow Indicator (NOISY -> AI -> CLEAR) */}
            <div className="w-full mt-2 p-3.5 rounded-xl bg-slate-950/80 border border-cyan-500/20 backdrop-blur-md shadow-lg">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase text-slate-400 mb-2 font-bold tracking-wider">
                <span>Acoustic Transformation Conduit</span>
                <span className="text-cyan-400 font-extrabold">End-to-End ONNX Pipeline</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                {/* Stage A */}
                <div className="flex flex-col items-center p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <span className="text-amber-400 font-extrabold text-[11px] tracking-wider">NOISY SIGNAL</span>
                  <span className="text-[9px] text-amber-200/70 mt-0.5">0.0 dB Input SNR</span>
                  <div className="h-1 w-full bg-amber-500/30 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-amber-500 w-full animate-pulse" />
                  </div>
                </div>

                {/* Stage B */}
                <div className="flex flex-col items-center p-2 rounded-lg bg-cyan-500/15 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.2)]">
                  <span className="text-cyan-300 font-extrabold text-[11px] tracking-wider flex items-center gap-1">
                    <Cpu size={11} className="animate-spin" />
                    AI ENHANCEMENT
                  </span>
                  <span className="text-[9px] text-cyan-200/80 mt-0.5">DeepFilterNet3 ONNX</span>
                  <div className="h-1 w-full bg-cyan-500/30 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-cyan-400 w-full animate-signal-flow" />
                  </div>
                </div>

                {/* Stage C */}
                <div className="flex flex-col items-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-emerald-400 font-extrabold text-[11px] tracking-wider">CLEAR SPEECH</span>
                  <span className="text-[9px] text-emerald-200/70 mt-0.5">+16.4 dB Improvement</span>
                  <div className="h-1 w-full bg-emerald-500/30 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-emerald-400 w-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={onRunEvaluation}
                disabled={isEvaluating}
                className="btn-primary px-6 py-3 text-sm shadow-[0_0_25px_rgba(0,240,255,0.5)]"
              >
                <Play size={15} className={isEvaluating ? 'animate-spin' : ''} />
                <span>{isEvaluating ? 'RUNNING PIPELINE…' : 'RUN EVALUATION'}</span>
              </button>

              <button
                onClick={onUploadClick}
                className="btn-secondary px-5 py-3 text-xs"
              >
                <Upload size={14} className="text-cyan-400" />
                <span>UPLOAD TACTICAL AUDIO</span>
              </button>

              {onSelectAnchor && (
                <button
                  onClick={() => onSelectAnchor('evaluation-matrix')}
                  className="inline-flex items-center gap-1.5 px-4 py-3 rounded-lg font-mono text-xs text-slate-300 hover:text-cyan-300 hover:bg-slate-900/50 transition-colors"
                >
                  <span>Explore Benchmarks</span>
                  <ArrowDown size={13} />
                </button>
              )}
            </div>
          </div>

          {/* ── Right Column: Floating Live System Status HUD (5 cols) ── */}
          <div className="lg:col-span-5">
            <div className="hud-panel p-5 relative border border-cyan-500/30 bg-[#070e1e]/90 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.7)] backdrop-blur-xl">
              {/* Corner HUD reticles */}
              <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-cyan-400" />
              <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-cyan-400" />
              <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-cyan-400" />
              <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-cyan-400" />

              {/* Status Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Radio size={14} className="text-cyan-400 animate-pulse" />
                  <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-100">
                    Live System Status
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  ONLINE
                </span>
              </div>

              {/* Status Metric Grid */}
              <div className="grid grid-cols-2 gap-3 mt-3.5 font-mono">
                {/* Status Field 1 */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block">SYSTEM STATUS</span>
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    OPERATIONAL
                  </span>
                </div>

                {/* Status Field 2 */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block">MODEL</span>
                  <span className="text-xs font-bold text-cyan-300 mt-0.5 block">DeepFilterNet3</span>
                </div>

                {/* Status Field 3 */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block">MODE</span>
                  <span className="text-xs font-bold text-slate-200 mt-0.5 block">Speech Enhancement</span>
                </div>

                {/* Status Field 4 */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block">SAMPLING RATE</span>
                  <span className="text-xs font-bold text-slate-200 mt-0.5 block">48 kHz / 16 kHz</span>
                </div>

                {/* Status Field 5 */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block">PROCESSING</span>
                  <span className="text-xs font-bold text-cyan-300 mt-0.5 block">Real-time / Chunked</span>
                </div>

                {/* Status Field 6 */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block">TARGET PLATFORM</span>
                  <span className="text-xs font-bold text-slate-200 mt-0.5 block">Edge / Raspberry Pi</span>
                </div>
              </div>

              {/* Target Mil-Standard Criteria Check */}
              <div className="mt-3.5 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-400">Target Standard:</span>
                <span className="text-cyan-300 font-bold">SNR Gain ≥ 15 dB · Latency ≤ 30 ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
