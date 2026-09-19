/* ============================================================
   components/PipelineStatus.tsx
   Horizontal pipeline stage tracker
   ============================================================ */
import React from 'react';
import { CheckCircle, Circle, XCircle, Loader } from 'lucide-react';
import type { PipelineStage, StageStatus } from '../types';

interface PipelineStatusProps {
  stages: Record<PipelineStage, StageStatus>;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  INPUT_AUDIO:     'INPUT\nAUDIO',
  PREPROCESSING:   'PRE-\nPROCESS',
  NOISE_ANALYSIS:  'NOISE\nANALYSIS',
  DEEPFILTERNET3:  'DEEPFILTER\nNET3',
  POST_PROCESSING: 'POST\nPROCESS',
  ENHANCED_SPEECH: 'ENHANCED\nSPEECH',
};

const STAGE_ORDER: PipelineStage[] = [
  'INPUT_AUDIO',
  'PREPROCESSING',
  'NOISE_ANALYSIS',
  'DEEPFILTERNET3',
  'POST_PROCESSING',
  'ENHANCED_SPEECH',
];

const StageIcon: React.FC<{ status: StageStatus }> = ({ status }) => {
  switch (status) {
    case 'complete': return <CheckCircle size={14} className="text-emerald-500" />;
    case 'active':   return <Loader size={14} className="text-amber-500 animate-spin" />;
    case 'error':    return <XCircle size={14} className="text-red-500" />;
    default:         return <Circle size={14} className="text-slate-300" />;
  }
};

const statusBg: Record<StageStatus, string> = {
  complete: 'bg-emerald-500',
  active:   'bg-amber-400',
  error:    'bg-red-500',
  waiting:  'bg-slate-200',
};

export const PipelineStatus: React.FC<PipelineStatusProps> = ({ stages }) => {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">System Pipeline</span>
        <span className="text-2xs text-slate-400 font-mono">
          DeepFilterNet3 ONNX Inference Path
        </span>
      </div>

      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          {STAGE_ORDER.map((stage, idx) => {
            const status = stages[stage];
            const isLast = idx === STAGE_ORDER.length - 1;

            return (
              <React.Fragment key={stage}>
                <div className="pipeline-stage flex-1 min-w-0">
                  {/* Icon */}
                  <div className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 mx-auto
                    ${status === 'complete' ? 'border-emerald-400 bg-emerald-50' :
                      status === 'active' ? 'border-amber-400 bg-amber-50' :
                      status === 'error' ? 'border-red-400 bg-red-50' :
                      'border-slate-200 bg-slate-50'}`}
                  >
                    {status === 'active' && (
                      <div className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-50" />
                    )}
                    <StageIcon status={status} />
                  </div>

                  {/* Label */}
                  <div className="text-center mt-1">
                    <div className="text-2xs font-mono font-medium text-slate-600 whitespace-pre-line leading-tight">
                      {STAGE_LABELS[stage]}
                    </div>
                    <div className={`text-2xs font-semibold font-mono mt-0.5
                      ${status === 'complete' ? 'text-emerald-600' :
                        status === 'active' ? 'text-amber-600' :
                        status === 'error' ? 'text-red-600' :
                        'text-slate-300'}`}>
                      {status === 'complete' ? '✓ Done' :
                       status === 'active' ? '● Active' :
                       status === 'error' ? '✕ Error' :
                       '○ Wait'}
                    </div>
                  </div>
                </div>

                {/* Connector */}
                {!isLast && (
                  <div className="flex-shrink-0 w-8 flex flex-col items-center" style={{ marginBottom: 28 }}>
                    <div className={`h-0.5 w-full ${statusBg[status]}`} />
                    <div className="text-2xs text-slate-300 font-mono">↓</div>
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
