/* ============================================================
   evaluation/EvaluationTable.tsx
   Futuristic Defence Noise Condition Evaluation Matrix.
   Displays target standards, 6 defense noise conditions, explicit
   Input SNR vs Output SNR vs SNR Improvement, STOI, PESQ, Latency,
   and PASS/FAIL status indicators with interactive selection.
   ============================================================ */

import React from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, Clock, Sparkles } from 'lucide-react';
import type { EvaluationRow, EvaluationCondition } from '../../types';

interface EvaluationTableProps {
  rows: EvaluationRow[];
  selectedCondition: EvaluationCondition;
  onSelectCondition: (condition: EvaluationCondition) => void;
  theme?: 'white' | 'dark';
}

export const EvaluationTable: React.FC<EvaluationTableProps> = ({
  rows,
  selectedCondition,
  onSelectCondition,
}) => {
  return (
    <div className="hud-panel w-full overflow-hidden border border-cyan-500/20 bg-[#070e1e]/90 shadow-2xl backdrop-blur-xl">
      {/* ── Table Header / Target Criteria Banner ───────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-400">
            <ShieldCheck size={16} />
          </div>
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              Evaluation Matrix — Defence Noise Conditions
            </span>
            <span className="ml-2 rounded px-2 py-0.5 font-mono text-[9px] font-bold bg-slate-900 border border-slate-700 text-slate-400">
              6 BENCHMARK CONDITIONS
            </span>
          </div>
        </div>

        {/* Target Standards readout */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="uppercase tracking-wider text-[10px] text-slate-400 font-bold">
            Target Standards:
          </span>
          <span className="rounded px-2.5 py-0.5 border border-cyan-500/30 bg-cyan-950/50 text-cyan-300 font-bold">
            SNR Gain &ge; 15.0 dB
          </span>
          <span className="rounded px-2.5 py-0.5 border border-indigo-500/30 bg-indigo-950/50 text-indigo-300 font-bold">
            STOI &ge; 0.85
          </span>
          <span className="rounded px-2.5 py-0.5 border border-emerald-500/30 bg-emerald-950/50 text-emerald-300 font-bold">
            PESQ &ge; 2.50 MOS
          </span>
          <span className="rounded px-2.5 py-0.5 border border-cyan-500/30 bg-cyan-950/50 text-cyan-300 font-bold">
            Latency &le; 30 ms
          </span>
        </div>
      </div>

      {/* ── Table Container ─────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/90 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              <th className="px-5 py-3 font-bold">Noise Condition</th>
              <th className="px-5 py-3 text-right font-bold">Input SNR</th>
              <th className="px-5 py-3 text-right font-bold text-slate-300">Output SNR</th>
              <th className="px-5 py-3 text-right font-bold text-cyan-400">SNR Improvement</th>
              <th className="px-5 py-3 text-right font-bold">STOI</th>
              <th className="px-5 py-3 text-right font-bold">PESQ (MOS)</th>
              <th className="px-5 py-3 text-right font-bold">Latency</th>
              <th className="px-5 py-3 text-center font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {rows.map((row) => {
              const isSelected = selectedCondition === row.name;
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelectCondition(row.name as EvaluationCondition)}
                  className={`group cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'bg-cyan-950/40 text-cyan-100 hover:bg-cyan-950/50'
                      : 'text-slate-300 hover:bg-slate-900/60 hover:text-white'
                  }`}
                >
                  {/* Condition Name + Icon */}
                  <td className="whitespace-nowrap px-5 py-3.5 font-semibold">
                    <div className="flex items-center gap-3">
                      <span className="text-lg drop-shadow-sm">{row.icon}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm tracking-wide ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-cyan-300'}`}>
                          {row.name}
                        </span>
                        {row.is_detected && (
                          <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider font-extrabold bg-emerald-500/20 border-emerald-500/40 text-emerald-300 animate-pulse">
                            <Sparkles size={9} /> Auto-Detected
                          </span>
                        )}
                        {isSelected && !row.is_detected && (
                          <span className="inline-block rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Input SNR */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-right">
                    <span className="rounded px-2.5 py-1 border font-bold bg-slate-950/80 border-slate-800 text-amber-300">
                      {row.input_snr_db.toFixed(1)} dB
                    </span>
                  </td>

                  {/* Output SNR */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-right font-bold text-slate-200">
                    {row.output_snr_db !== null ? (
                      <span>+{row.output_snr_db.toFixed(1)} dB</span>
                    ) : (
                      <span className="text-slate-400 font-normal">--</span>
                    )}
                  </td>

                  {/* SNR Improvement */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-right">
                    {row.snr_improvement_db !== null ? (
                      <span
                        className={`font-black text-sm ${
                          row.snr_improvement_db >= 15.0
                            ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]'
                            : 'text-rose-400'
                        }`}
                      >
                        +{row.snr_improvement_db.toFixed(1)} dB
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">--</span>
                    )}
                  </td>

                  {/* STOI */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-right font-bold">
                    {row.stoi !== null ? (
                      <span className={row.stoi >= 0.85 ? 'text-emerald-400' : 'text-rose-400'}>
                        {row.stoi.toFixed(3)}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">--</span>
                    )}
                  </td>

                  {/* PESQ */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-right font-bold">
                    {row.pesq !== null ? (
                      <span className={row.pesq >= 2.5 ? 'text-emerald-400' : 'text-rose-400'}>
                        {row.pesq.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">--</span>
                    )}
                  </td>

                  {/* Latency */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-right font-bold">
                    {row.latency_ms !== null ? (
                      <span className={row.latency_ms <= 30.0 ? 'text-slate-200' : 'text-rose-400'}>
                        {row.latency_ms.toFixed(1)} ms
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">--</span>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-center">
                    {row.status === 'PASS' && (
                      <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider border-emerald-500/40 bg-emerald-950/60 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                        <CheckCircle2 size={11} />
                        PASS
                      </span>
                    )}
                    {row.status === 'FAIL' && (
                      <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider border-rose-500/40 bg-rose-950/60 text-rose-400">
                        <AlertCircle size={11} />
                        FAIL
                      </span>
                    )}
                    {row.status === 'NOT_TESTED' && (
                      <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider border-slate-800 bg-slate-900 text-slate-400">
                        <Clock size={11} />
                        PENDING
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Note under table */}
      <div className="flex flex-wrap items-center justify-between border-t border-slate-800 px-6 py-3 text-[10px] font-mono text-slate-400 bg-slate-950/70">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          Click any noise condition row to inspect waveforms, spectrograms, and A/B audio auditioning below.
        </span>
        <span className="text-slate-400">Model: DeepFilterNet3 · Native Rate: 48 kHz</span>
      </div>
    </div>
  );
};
