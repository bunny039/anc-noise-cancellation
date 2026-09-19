/* ============================================================
   components/ControlPanel.tsx
   Left vertical engineering control panel
   ============================================================ */
import React, { useRef } from 'react';
import {
  Upload, Mic, Play, RotateCcw, Download, Settings,
  AlertTriangle
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

const NOISE_PROFILES: { value: NoiseProfile; label: string }[] = [
  { value: 'helicopter', label: 'Helicopter / Rotor' },
  { value: 'engine',     label: 'Engine / Vehicle' },
  { value: 'gunfire',    label: 'Gunfire / Blast' },
  { value: 'wind',       label: 'Wind / Gust' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'custom',     label: 'Custom' },
];

const CHUNK_OPTIONS = [0.5, 1.0, 1.5, 2.0, 3.0];

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-2.5 pt-3 pb-1">
    <div className="field-label text-slate-400">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode; tooltip?: string }> = ({
  label, children, tooltip,
}) => (
  <div className="px-2.5 py-1">
    <label className="field-label" title={tooltip}>{label}</label>
    <div className="mt-0.5">{children}</div>
  </div>
);

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config, onConfigChange, onFileSelect, onRun, onReset, onExport,
  onStartRecording, selectedFile, status, warnings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRunning = status === 'PROCESSING' || status === 'ANALYZING' || status === 'UPLOADING';
  const canRun = selectedFile !== null && !isRunning;

  return (
    <aside className="panel flex flex-col overflow-y-auto" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <Settings size={10} />
          Processing Controls
        </span>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* ── Input Source ─────────────────────────────────── */}
        <SectionLabel>Input Source</SectionLabel>
        <div className="px-2.5 flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary flex-1 text-2xs"
          >
            <Upload size={11} />
            Upload Audio
          </button>
          <button
            onClick={onStartRecording}
            disabled={status === 'RECORDING'}
            className={`btn-secondary flex-1 text-2xs ${status === 'RECORDING' ? 'border-red-400 text-red-600' : ''}`}
          >
            <Mic size={11} className={status === 'RECORDING' ? 'blink' : ''} />
            {status === 'RECORDING' ? 'Recording…' : 'Record Mic'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.flac,.mp3"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onFileSelect(f);
            e.target.value = '';
          }}
        />

        {/* File name */}
        <div className="px-2.5 mt-1.5">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-panel-border rounded-sm min-h-[26px]">
            <span className="text-2xs text-slate-400 font-mono truncate">
              {selectedFile ? selectedFile.name : 'No file selected'}
            </span>
          </div>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="px-2.5 mt-1.5 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-sm">
                <AlertTriangle size={10} className="text-amber-600 mt-0.5 shrink-0" />
                <span className="text-2xs text-amber-700">{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Processing Engine ─────────────────────────────── */}
        <SectionLabel>Processing Engine</SectionLabel>
        <Row label="Model">
          <select className="field-select">
            <option>DeepFilterNet3</option>
          </select>
        </Row>

        <Row label="Inference Mode">
          <select
            className="field-select"
            value={config.inferenceMode}
            onChange={e => onConfigChange({ inferenceMode: e.target.value as 'ONNX' | 'PyTorch' })}
          >
            <option value="ONNX">ONNX (Edge / Pi)</option>
            <option value="PyTorch">PyTorch (Dev)</option>
          </select>
        </Row>

        {/* ── Noise Profile ─────────────────────────────────── */}
        <SectionLabel>Noise Profile</SectionLabel>
        <Row label="Detected Noise Type" tooltip="Used for display and analysis — does not change the model">
          <select
            className="field-select"
            value={config.noiseProfile}
            onChange={e => onConfigChange({ noiseProfile: e.target.value as NoiseProfile })}
          >
            {NOISE_PROFILES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Row>

        {/* ── Reference Mic ─────────────────────────────────── */}
        <SectionLabel>Reference Microphone</SectionLabel>
        <Row label="Input Configuration">
          <select className="field-select">
            <option>Primary Only</option>
            <option>Primary + Reference</option>
          </select>
        </Row>

        {/* ── NLMS ──────────────────────────────────────────── */}
        <SectionLabel>NLMS Adaptive Filter</SectionLabel>
        <div className="px-2.5">
          <div className="flex items-center justify-between py-1 px-2 bg-slate-50 border border-panel-border rounded-sm">
            <div>
              <span className="text-2xs font-medium text-slate-700">NLMS</span>
              <span className="ml-1 text-2xs text-slate-400">(adaptive filter)</span>
            </div>
            <button
              onClick={() => onConfigChange({ useNlms: !config.useNlms })}
              className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors
                ${config.useNlms ? 'bg-defence-600 border-defence-700' : 'bg-slate-200 border-slate-300'}`}
              title="NLMS is off by default — real dual-mic testing showed it can cancel real speech"
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform
                ${config.useNlms ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {config.useNlms && (
            <div className="mt-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-sm">
              <span className="text-2xs text-amber-700">⚠ NLMS may attenuate real speech on genuine dual-mic captures</span>
            </div>
          )}
        </div>

        {/* ── Chunk Size ────────────────────────────────────── */}
        <SectionLabel>Chunk Size</SectionLabel>
        <Row label="Processing Window" tooltip="Larger = better quality, higher latency">
          <select
            className="field-select"
            value={config.chunkSeconds}
            onChange={e => onConfigChange({ chunkSeconds: parseFloat(e.target.value) })}
          >
            {CHUNK_OPTIONS.map(v => (
              <option key={v} value={v}>{v.toFixed(1)} s</option>
            ))}
          </select>
        </Row>

        {/* ── Spacer ────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Action Buttons ────────────────────────────────── */}
        <div className="px-2.5 py-3 space-y-2 border-t border-panel-border mt-3">
          <button
            onClick={onRun}
            disabled={!canRun}
            className={`w-full btn-primary ${!canRun ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Play size={12} className={isRunning ? 'animate-pulse' : ''} />
            {isRunning ? 'PROCESSING…' : '▶  RUN SPEECH ENHANCEMENT'}
          </button>
          <div className="flex gap-2">
            <button onClick={onReset} className="btn-secondary flex-1">
              <RotateCcw size={11} />
              Reset
            </button>
            <button onClick={onExport} className="btn-secondary flex-1" disabled={status !== 'COMPLETE'}>
              <Download size={11} />
              Export
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
