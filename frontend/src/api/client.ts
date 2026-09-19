/* ============================================================
   api/client.ts — Axios wrapper for the backend REST API
   ============================================================ */

import axios from 'axios';
import type { UploadResponse, JobResult, Metrics, SystemStatusResponse } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

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
): Promise<{ job_id: string; status: string }> {
  const { data } = await api.post('/api/enhance', { session_id: sessionId, use_nlms: useNlms });
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
  intervalMs: number = 400,
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
