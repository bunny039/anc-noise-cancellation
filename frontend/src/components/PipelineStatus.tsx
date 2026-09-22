/* ============================================================
   components/PipelineStatus.tsx — Futuristic Defence Pipeline HUD
   ============================================================ */
import React from 'react';
import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import type { PipelineStage, StageStatus } from '../types';

interface PipelineStatusProps {
  stages: Record<PipelineStage, StageStatus>;
}

const STAGE_ORDER: PipelineStage[] = [
  'INPUT_AUDIO', 'PREPROCESSING', 'NOISE_ANALYSIS',
  'DEEPFILTERNET3', 'POST_PROCESSING', 'ENHANCED_SPEECH',
];

const STAGE_CFG: Record<PipelineStage, { short: string; sub: string }> = {
  INPUT_AUDIO:     { short: 'Input',       sub: 'Audio' },
  PREPROCESSING:   { short: 'Pre-proc.',   sub: 'Resample' },
  NOISE_ANALYSIS:  { short: 'Noise',       sub: 'Analysis' },
  DEEPFILTERNET3:  { short: 'DFNet3',      sub: 'ONNX' },
  POST_PROCESSING: { short: 'Post-proc.',  sub: 'Normalize' },
  ENHANCED_SPEECH: { short: 'Output',      sub: 'Enhanced' },
};

const STATUS_CFG: Record<StageStatus, {
  icon: (size: number) => React.ReactElement;
  ring: string;
  glow: string;
  label: string;
  labelColor: string;
}> = {
  complete: {
    icon: (s) => <CheckCircle size={s} className="text-emerald-400" />,
    ring: 'border-emerald-400 bg-emerald-950/80',
    glow: 'shadow-[0_0_12px_rgba(16,185,129,0.3)]',
    label: 'Done',
    labelColor: 'text-emerald-400',
  },
  active: {
    icon: (s) => <Loader2 size={s} className="text-cyan-400 animate-spin" />,
    ring: 'border-cyan-400 bg-cyan-950/80',
    glow: 'shadow-[0_0_15px_rgba(0,240,255,0.4)]',
    label: 'Running',
    labelColor: 'text-cyan-300 font-black',
  },
  error: {
    icon: (s) => <AlertCircle size={s} className="text-rose-400" />,
    ring: 'border-rose-400 bg-rose-950/80',
    glow: 'shadow-[0_0_12px_rgba(244,63,94,0.3)]',
    label: 'Error',
    labelColor: 'text-rose-400',
  },
  waiting: {
    icon: (s) => <Clock size={s} className="text-slate-400" />,
    ring: 'border-slate-800 bg-slate-900/60',
    glow: '',
    label: 'Wait',
    labelColor: 'text-slate-400',
  },
};

export const PipelineStatus: React.FC<PipelineStatusProps> = ({ stages }) => {
  return (
    <div className="hud-panel overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95 font-mono">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/70">
        <span className="panel-title">Processing Pipeline Flow</span>
        <span className="text-[10px] text-cyan-400 font-mono font-bold">DeepFilterNet3 · Dual Stage</span>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center">
          {STAGE_ORDER.map((stage, idx) => {
            const cfg = STATUS_CFG[stages[stage]];
            const isLast = idx === STAGE_ORDER.length - 1;
            const { short, sub } = STAGE_CFG[stage];
            const isActive = stages[stage] === 'active';

            return (
              <React.Fragment key={stage}>
                <div className="flex flex-col items-center flex-1 min-w-0">
                  {/* Node */}
                  <div className="relative">
                    {isActive && (
                      <div className="absolute inset-0 rounded-full border-2 border-cyan-400 animate-ping opacity-70" />
                    )}
                    <div className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${cfg.ring} ${cfg.glow}`}>
                      {cfg.icon(14)}
                    </div>
                  </div>

                  {/* Label */}
                  <div className="text-center mt-2">
                    <div className="text-[10.5px] font-bold text-white leading-tight">{short}</div>
                    <div className="text-[9px] text-slate-400">{sub}</div>
                    <div className={`text-[9px] font-bold mt-0.5 ${cfg.labelColor}`}>
                      {cfg.label}
                    </div>
                  </div>
                </div>

                {/* Connector */}
                {!isLast && (
                  <div className="flex-shrink-0 flex items-center pb-8" style={{ width: '2rem' }}>
                    <div className="w-full h-0.5 rounded-full transition-all duration-500"
                      style={{
                        background: stages[stage] === 'complete'
                          ? 'linear-gradient(90deg, #10b981, #059669)'
                          : stages[stage] === 'active'
                          ? 'linear-gradient(90deg, #00f0ff, rgba(0,240,255,0.2))'
                          : 'rgba(255,255,255,0.07)',
                      }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
