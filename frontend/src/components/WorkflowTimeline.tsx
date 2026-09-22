/* ============================================================
   components/WorkflowTimeline.tsx
   Cinematic 6-Stage Evaluation Workflow Timeline with Live State
   Transitions and Execution Radar Indicators.
   ============================================================ */
import React from 'react';
import { Activity, CheckCircle2, Clock, Cpu, FileAudio, Sliders, Sparkles, BarChart2 } from 'lucide-react';

export interface WorkflowStage {
  step: string;
  name: string;
  desc: string;
  icon: React.ReactNode;
}

const STAGES: WorkflowStage[] = [
  { step: '01', name: 'LOAD AUDIO', desc: '48 kHz military frames', icon: <FileAudio size={14} /> },
  { step: '02', name: 'PREPROCESS', desc: 'STFT & ERB filterbanks', icon: <Sliders size={14} /> },
  { step: '03', name: 'AI ENHANCEMENT', desc: 'DeepFilterNet3 ONNX', icon: <Cpu size={14} /> },
  { step: '04', name: 'POSTPROCESS', desc: 'Synthesis & optional NLMS', icon: <Sparkles size={14} /> },
  { step: '05', name: 'QUALITY EVALUATION', desc: 'SNR, STOI & PESQ metrics', icon: <BarChart2 size={14} /> },
  { step: '06', name: 'RESULT', desc: 'Enhanced speech delivery', icon: <CheckCircle2 size={14} /> },
];

interface WorkflowTimelineProps {
  currentStepIndex: number; // -1 if idle, 0..5 during evaluation, or 6 when complete
  isEvaluating: boolean;
}

export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  currentStepIndex,
  isEvaluating,
}) => {
  return (
    <div className="hud-panel p-5 border border-cyan-500/20 bg-[#060c18]/90 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity size={15} className={`text-cyan-400 ${isEvaluating ? 'animate-spin' : ''}`} />
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-white">
            Evaluation Workflow Pipeline
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          {isEvaluating
            ? `Executing Stage ${Math.min(currentStepIndex + 1, STAGES.length)} of ${STAGES.length}`
            : currentStepIndex >= STAGES.length
            ? 'Pipeline Complete · Targets Verified'
            : 'Awaiting Pipeline Execution'}
        </span>
      </div>

      {/* 6 Stage Timeline Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono">
        {STAGES.map((stage, idx) => {
          const isActive = isEvaluating && currentStepIndex === idx;
          const isComplete = (isEvaluating && currentStepIndex > idx) || (!isEvaluating && currentStepIndex >= STAGES.length);
          const isPending = !isActive && !isComplete;

          return (
            <div
              key={stage.step}
              className={`relative flex flex-col p-3 rounded-xl border transition-all duration-300 ${
                isActive
                  ? 'bg-cyan-950/60 border-2 border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.3)] ring-1 ring-cyan-400/50 transform -translate-y-0.5'
                  : isComplete
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950/50 border-slate-800/80 text-slate-400'
              }`}
            >
              {/* Top row: step number + status icon */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                    isActive
                      ? 'bg-cyan-400 text-slate-950 font-extrabold'
                      : isComplete
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  {stage.step}
                </span>

                <div className="flex items-center">
                  {isActive && <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />}
                  {isComplete && <CheckCircle2 size={13} className="text-emerald-400" />}
                  {isPending && <Clock size={12} className="text-slate-400" />}
                </div>
              </div>

              {/* Stage Title */}
              <div className="flex items-center gap-1.5 my-0.5">
                <span className={isActive ? 'text-cyan-300' : isComplete ? 'text-emerald-400' : 'text-slate-400'}>
                  {stage.icon}
                </span>
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isActive ? 'text-white' : isComplete ? 'text-slate-100' : 'text-slate-400'
                  }`}
                >
                  {stage.name}
                </span>
              </div>

              {/* Stage Description */}
              <span className="text-[10px] text-slate-400 mt-1 leading-tight">
                {stage.desc}
              </span>

              {/* Bottom Progress Strip */}
              <div className="mt-3 h-1 w-full rounded-full bg-slate-900 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isActive
                      ? 'bg-cyan-400 w-full animate-pulse'
                      : isComplete
                      ? 'bg-emerald-400 w-full'
                      : 'w-0'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
