/* ============================================================
   components/ControlPanel.tsx — Futuristic Defence Sidebar Controls
   ============================================================ */
import React, { useRef } from 'react';
import {
  Upload, Mic, Play, RotateCcw, Download, Settings,
  AlertTriangle, ChevronDown
} from 'lucide-react';
import type { ProcessingConfig, NoiseProfile, SystemStatus } from '../types';

interface ControlPanelProps {
  config: ProcessingConfig;
  onConfigChange: (cfg: Partial<ProcessingConfig>) => void;
  onFileSelect: (file: File) => void;
  onRun: () => void;
  onReset: () => void;
  onExport: () => void;
  onStartRecording: () => void;
  selectedFile: File | null;
  status: SystemStatus;
  warnings: string[];
}

const NOISE_PROFILES: { value: NoiseProfile; label: string; icon: string }[] = [
  { value: 'helicopter', label: 'Helicopter / Rotor', icon: '🚁' },
  { value: 'engine',     label: 'Engine / Vehicle',   icon: '🚜' },
  { value: 'gunfire',    label: 'Gunfire / Blast',    icon: '💥' },
  { value: 'wind',       label: 'Wind / Gust',         icon: '🌬️' },
  { value: 'environmental', label: 'Environmental',   icon: '🌿' },
  { value: 'custom',     label: 'Custom',              icon: '⚙️' },
];

const CHUNK_OPTIONS = [0.5, 1.0, 1.5, 2.0, 3.0];

const Divider: React.FC = () => (
  <div className="mx-4 my-2.5 h-px bg-slate-800/80" />
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 pt-3 pb-1.5 panel-title text-cyan-400">{children}</div>
);

const FieldRow: React.FC<{ label: string; children: React.ReactNode; tooltip?: string }> = ({
  label, children, tooltip,
}) => (
  <div className="px-4 pb-2">
    <label className="field-label" title={tooltip}>{label}</label>
    {children}
  </div>
);

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config, onConfigChange, onFileSelect, onRun, onReset, onExport,
  onStartRecording, selectedFile, status, warnings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRunning = ['PROCESSING', 'ANALYZING', 'UPLOADING'].includes(status);
  const canRun = selectedFile !== null && !isRunning;

  return (
    <aside className="hud-panel flex flex-col overflow-hidden border border-cyan-500/20 bg-[#070e1c]/95" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-cyan-950 border border-cyan-500/40 text-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.2)]">
            <Settings size={13} />
          </div>
          <span className="text-xs font-bold text-white tracking-wide font-mono uppercase">Processing Controls</span>
        </div>
        <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
          ONNX DSP
        </span>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* ── Input Source ─────────────────────────────────── */}
        <SectionLabel>Input Source</SectionLabel>
        <div className="px-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary flex-col gap-1 py-3 h-auto"
          >
            <Upload size={15} className="text-cyan-400" />
            <span className="text-[10px]">Upload WAV</span>
          </button>
          <button
            onClick={onStartRecording}
            disabled={status === 'RECORDING'}
            className={`btn-secondary flex-col gap-1 py-3 h-auto ${status === 'RECORDING' ? 'border-red-400/40 text-red-400' : ''}`}
          >
            <Mic size={15} className={`${status === 'RECORDING' ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`} />
            <span className="text-[10px]">{status === 'RECORDING' ? 'Recording…' : 'Record Mic'}</span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.flac,.mp3"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f); e.target.value = ''; }}
        />

        {/* File name */}
        <div className="px-4 mt-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono bg-slate-950/80 border border-slate-800 text-slate-300 truncate">
            {selectedFile
              ? <><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0 animate-pulse" /><span className="truncate text-white font-bold">{selectedFile.name}</span></>
              : <span className="text-slate-400">No file loaded</span>
            }
          </div>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="px-4 mt-2 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="notice-warn">
                <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <Divider />

        {/* ── Engine ────────────────────────────────────────── */}
        <SectionLabel>Inference Engine</SectionLabel>
        <FieldRow label="Model Architecture">
          <div className="relative">
            <select className="field-select appearance-none cursor-not-allowed opacity-80" disabled>
              <option>DeepFilterNet3 (Dual-Stage)</option>
            </select>
          </div>
        </FieldRow>
        <FieldRow label="Runtime Provider">
          <div className="relative">
            <select
              className="field-select appearance-none"
              value={config.inferenceMode}
              onChange={e => onConfigChange({ inferenceMode: e.target.value as 'ONNX' | 'PyTorch' })}
            >
              <option value="ONNX">ONNX — Edge / Raspberry Pi</option>
              <option value="PyTorch">PyTorch — Dev</option>
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </FieldRow>

        <Divider />

        {/* ── Noise Profile ─────────────────────────────────── */}
        <SectionLabel>Noise Environment</SectionLabel>
        <FieldRow label="Acoustic Preset">
          <div className="relative">
            <select
              className="field-select appearance-none"
              value={config.noiseProfile}
              onChange={e => onConfigChange({ noiseProfile: e.target.value as NoiseProfile })}
            >
              {NOISE_PROFILES.map(p => (
                <option key={p.value} value={p.value}>
                  {p.icon} {p.label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </FieldRow>

        <FieldRow label="Chunk Buffer (s)">
          <div className="grid grid-cols-5 gap-1 font-mono">
            {CHUNK_OPTIONS.map(c => (
              <button
                key={c}
                onClick={() => onConfigChange({ chunkSeconds: c })}
                className={`py-1 text-center rounded text-[10px] font-bold transition-all ${
                  config.chunkSeconds === c
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_8px_rgba(0,240,255,0.4)]'
                    : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                {c}s
              </button>
            ))}
          </div>
        </FieldRow>

        <Divider />

        {/* ── DSP Options ────────────────────────────────────── */}
        <SectionLabel>DSP Post-Processing</SectionLabel>
        <div className="px-4 space-y-2">
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-200 font-mono">NLMS Adaptive Filter</span>
              <span className="text-[9px] text-slate-400">Armored cockpit feedback cancellation</span>
            </div>
            <button
              onClick={() => onConfigChange({ useNlms: !config.useNlms })}
              className={`toggle-track ${config.useNlms ? 'bg-cyan-500 border-cyan-400' : 'bg-slate-800 border-slate-700'}`}
            >
              <span className={`toggle-thumb ${config.useNlms ? 'translate-x-3.5 bg-slate-950' : 'translate-x-0.5 bg-slate-400'}`} />
            </button>
          </div>
        </div>

        <div className="flex-1" />

        <Divider />

        {/* ── Main Action Buttons ───────────────────────────── */}
        <div className="p-4 space-y-2.5">
          <button
            onClick={onRun}
            disabled={!canRun}
            className="btn-primary w-full py-2.5 text-xs"
          >
            <Play size={15} className={isRunning ? 'animate-spin' : ''} />
            <span>{isRunning ? 'PROCESSING…' : 'ENHANCE AUDIO'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2 font-mono">
            <button
              onClick={onReset}
              disabled={isRunning}
              className="btn-secondary py-2"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
            <button
              onClick={onExport}
              className="btn-secondary py-2"
            >
              <Download size={12} className="text-cyan-400" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
