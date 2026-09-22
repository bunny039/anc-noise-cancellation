/* ============================================================
   components/SystemArchitecture.tsx
   Interactive System Architecture Flow with Hover Explanations
   for DeepFilterNet3 Defense Speech Enhancement Pipeline.
   ============================================================ */
import React, { useState } from 'react';
import { Layers, ArrowRight, CheckCircle2 } from 'lucide-react';

interface ArchNode {
  id: string;
  number: string;
  name: string;
  category: string;
  desc: string;
  specs: string[];
}

const ARCH_NODES: ArchNode[] = [
  {
    id: 'input',
    number: '01',
    name: 'AUDIO INPUT',
    category: 'Signal Ingest',
    desc: 'Raw acoustic speech captured from field microphones corrupted by hostile environmental noise.',
    specs: ['Sampling Rate: 48 kHz / 16 kHz', 'Channels: Mono 32-bit Float', 'Chunk Size: 2.0s buffered'],
  },
  {
    id: 'preprocess',
    number: '02',
    name: 'PREPROCESSING',
    category: 'Signal Conditioning',
    desc: 'STFT time-frequency decomposition into 32 Equivalent Rectangular Bandwidth (ERB) filterbank channels.',
    specs: ['Window: 20 ms Hanning', 'Hop Size: 10 ms (50% overlap)', 'ERB bands: 32 bins (0–8 kHz)'],
  },
  {
    id: 'neural',
    number: '03',
    name: 'DEEPFILTERNET3',
    category: 'Deep Learning Core',
    desc: 'Two-stage neural network combining spectral gain estimation on ERB bands with complex deep filtering for harmonic recovery.',
    specs: ['Runtime: ONNX CPU Provider', 'Architecture: Conv-GRU + DFN', 'Inference: < 25 ms per frame'],
  },
  {
    id: 'nlms',
    number: '04',
    name: 'OPTIONAL NLMS',
    category: 'Adaptive DSP',
    desc: 'Normalized Least Mean Squares post-filter for secondary reference microphone feedback cancellation in armored vehicle intercoms.',
    specs: ['Filter Order: 64 taps', 'Step Size: Adaptive normalized', 'Mode: User toggleable'],
  },
  {
    id: 'enhanced',
    number: '05',
    name: 'ENHANCED AUDIO',
    category: 'Synthesis',
    desc: 'Inverse STFT signal resynthesis generating clean time-domain speech with suppressed background acoustics.',
    specs: ['Output Rate: 48 kHz Linear PCM', 'Phase: Preserved complex bins', 'Attenuation: > 20 dB noise floor drop'],
  },
  {
    id: 'metrics',
    number: '06',
    name: 'QUALITY METRICS',
    category: 'Objective Benchmark',
    desc: 'Automatic evaluation against military tactical communications standards (SNR improvement, STOI, PESQ, RTF).',
    specs: ['SNR Target: ≥ 15 dB gain', 'STOI Target: ≥ 0.85', 'PESQ Target: ≥ 2.50 MOS'],
  },
  {
    id: 'output',
    number: '07',
    name: 'TACTICAL OUTPUT',
    category: 'Delivery',
    desc: 'Streamed audio delivered to tactical transceiver headset, edge device speaker, or command center recording system.',
    specs: ['Interface: Web Audio / ALSA', 'Transport: Zero-latency stream', 'Status: Mission Verified'],
  },
];

export const SystemArchitecture: React.FC = () => {
  const [activeNode, setActiveNode] = useState<ArchNode>(ARCH_NODES[2]);

  return (
    <div className="hud-panel p-6 border border-cyan-500/20 bg-[#070e1c]/90 backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.2)]">
            <Layers size={16} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold font-mono tracking-wider uppercase text-white">
              System Architecture & Data Flow
            </h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Interactive end-to-end tactical signal processing architecture (DRDO PS-26052)
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 border border-cyan-500/40 px-3 py-1 rounded-md">
          Hover any stage to inspect technical specifications
        </span>
      </div>

      {/* ── Architecture Nodes Flow ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 font-mono">
        {ARCH_NODES.map((node, idx) => {
          const isSelected = activeNode.id === node.id;
          const isNeural = node.id === 'neural';

          return (
            <div
              key={node.id}
              onMouseEnter={() => setActiveNode(node)}
              onClick={() => setActiveNode(node)}
              className={`relative flex flex-col p-3 rounded-xl cursor-pointer transition-all duration-300 ${
                isSelected
                  ? isNeural
                    ? 'bg-cyan-950/80 border-2 border-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.35)] ring-1 ring-cyan-400/50 transform -translate-y-1'
                    : 'bg-slate-900 border-2 border-cyan-400/80 shadow-[0_0_15px_rgba(0,240,255,0.2)] transform -translate-y-1'
                  : 'bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/40'
              }`}
            >
              {/* Number and Arrow */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                    isSelected
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  {node.number}
                </span>

                {idx < ARCH_NODES.length - 1 && (
                  <ArrowRight size={11} className="text-slate-400 hidden lg:block" />
                )}
              </div>

              {/* Title */}
              <span
                className={`text-[11px] font-black uppercase tracking-wider ${
                  isSelected ? (isNeural ? 'text-cyan-300' : 'text-white') : 'text-slate-300'
                }`}
              >
                {node.name}
              </span>

              <span className="text-[9px] text-slate-400 mt-1 uppercase tracking-wider">
                {node.category}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Active Node Detailed Specification Drawer ──────── */}
      <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 backdrop-blur-md shadow-lg font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-cyan-400 text-slate-950 text-xs font-black">
              STAGE {activeNode.number}
            </span>
            <span className="text-sm font-bold text-white tracking-wide">
              {activeNode.name}
            </span>
            <span className="text-xs text-cyan-400">({activeNode.category})</span>
          </div>
          <span className="text-[10px] text-slate-400">Defence Architecture Specification</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
          <div className="md:col-span-2">
            <p className="text-xs text-slate-300 leading-relaxed">
              {activeNode.desc}
            </p>
          </div>

          <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-slate-800 pt-2 md:pt-0 md:pl-4">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Technical Specs:</span>
            {activeNode.specs.map((spec, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-cyan-200">
                <CheckCircle2 size={11} className="text-cyan-400 flex-shrink-0" />
                <span>{spec}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
