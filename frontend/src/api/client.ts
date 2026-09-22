/* ============================================================
   api/client.ts — Axios wrapper for the backend REST API
   ============================================================ */

import axios from 'axios';
import type { UploadResponse, JobResult, Metrics, SystemStatusResponse, EvaluationResponse, EvaluationRow, EvaluationSummary } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL !== undefined 
  ? import.meta.env.VITE_API_URL 
  : '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120_000,
});

/** Upload an audio file; returns session metadata */
export async function uploadAudio(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<UploadResponse>('/api/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Trigger enhancement for a session */
export async function triggerEnhancement(
  sessionId: string,
  useNlms: boolean = false,
  calibrationOffsetDb: number = 0.0,
): Promise<{ job_id: string; status: string }> {
  const { data } = await api.post('/api/enhance', {
    session_id: sessionId,
    use_nlms: useNlms,
    calibration_offset_db: calibrationOffsetDb,
  });
  return data;
}

/** Calibrate SNR for a session */
export async function calibrateSnr(
  sessionId: string,
  calibrationOffsetDb: number = 0.0,
  autoZeroNoiseFloor: boolean = false,
): Promise<{ session_id: string; calibration_offset_db: number; is_calibrated: boolean; metrics?: Metrics }> {
  const { data } = await api.post('/api/calibrate', {
    session_id: sessionId,
    calibration_offset_db: calibrationOffsetDb,
    auto_zero_noise_floor: autoZeroNoiseFloor,
  });
  return data;
}

/** Poll job results */
export async function getResults(jobId: string): Promise<JobResult> {
  const { data } = await api.get<JobResult>(`/api/results/${jobId}`);
  return data;
}

/** Get metrics */
export async function getMetrics(jobId: string): Promise<Metrics> {
  const { data } = await api.get<Metrics>(`/api/metrics/${jobId}`);
  return data;
}

/** Get audio URL for inline playback */
export function getAudioUrl(jobId: string, type: 'noisy' | 'enhanced'): string {
  return `${BASE_URL}/api/audio/${jobId}/${type}`;
}

/** System status */
export async function getSystemStatus(): Promise<SystemStatusResponse> {
  const { data } = await api.get<SystemStatusResponse>('/api/status');
  return data;
}

/** Health check */
export async function checkHealth(): Promise<boolean> {
  try {
    await api.get('/api/health');
    return true;
  } catch {
    return false;
  }
}

/** Poll until job completes or errors */
export async function pollUntilDone(
  jobId: string,
  onUpdate: (result: JobResult) => void,
  intervalMs: number = 100,
  timeoutMs: number = 120_000,
): Promise<JobResult> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const result = await getResults(jobId);
        onUpdate(result);
        if (result.status === 'COMPLETE' || result.status === 'ERROR') {
          clearInterval(interval);
          resolve(result);
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error('Polling timed out'));
        }
      } catch (err) {
        clearInterval(interval);
        reject(err);
      }
    }, intervalMs);
  });
}

/**
 * Run evaluation against backend POST /evaluate endpoint.
 * Accepts noisy file, optional clean reference, noise condition name, and input SNR.
 */
export async function evaluateAudio(params: {
  file?: File;
  cleanFile?: File;
  noiseCondition: string;
  inputSnrDb: number;
}): Promise<EvaluationResponse> {
  const form = new FormData();
  if (params.file) {
    form.append('file', params.file);
  }
  if (params.cleanFile) {
    form.append('clean_file', params.cleanFile);
  }
  form.append('noise', params.noiseCondition);
  form.append('input_snr_db', params.inputSnrDb.toString());

  // Try /evaluate, fallback to /api/evaluate
  try {
    const { data } = await api.post<EvaluationResponse>('/evaluate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  } catch (err) {
    const { data } = await api.post<EvaluationResponse>('/api/evaluate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }
}

/** Export evaluation report to CSV */
export function exportEvaluationReport(rows: EvaluationRow[], summary: EvaluationSummary): void {
  const dateStr = new Date().toISOString();
  let csv = 'DEFENCE SPEECH ENHANCEMENT SYSTEM - PERFORMANCE ANALYSIS REPORT\n';
  csv += `Generated: ${dateStr}\n`;
  csv += `Model: DeepFilterNet3 (ONNX Inference)\n`;
  csv += `Target Criteria: SNR Improvement >= 15 dB | STOI >= 0.85 | PESQ >= 2.5 | Latency <= 30 ms\n\n`;
  csv += 'Noise Condition,Input SNR (dB),Output SNR (dB),SNR Improvement (dB),STOI,PESQ (MOS),Latency (ms),Status\n';

  rows.forEach(r => {
    csv += `"${r.name}",${r.input_snr_db},${r.output_snr_db !== null ? r.output_snr_db.toFixed(1) : '--'},${r.snr_improvement_db !== null ? r.snr_improvement_db.toFixed(1) : '--'},${r.stoi !== null ? r.stoi.toFixed(3) : '--'},${r.pesq !== null ? r.pesq.toFixed(2) : '--'},${r.latency_ms !== null ? r.latency_ms.toFixed(1) : '--'},"${r.status}"\n`;
  });

  csv += '\nSUMMARY METRICS\n';
  csv += `Average SNR Improvement (dB),${summary.avg_snr_improvement !== null ? summary.avg_snr_improvement.toFixed(2) : '--'}\n`;
  csv += `Average STOI,${summary.avg_stoi !== null ? summary.avg_stoi.toFixed(3) : '--'}\n`;
  csv += `Average PESQ (MOS),${summary.avg_pesq !== null ? summary.avg_pesq.toFixed(2) : '--'}\n`;
  csv += `Average Processing Latency (ms),${summary.avg_latency !== null ? summary.avg_latency.toFixed(2) : '--'}\n`;
  csv += `Overall Evaluation Result,${summary.overall_status}\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Defence_Speech_Enhancement_Evaluation_${dateStr.slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

