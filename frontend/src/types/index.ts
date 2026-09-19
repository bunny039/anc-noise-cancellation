/* ============================================================
   types/index.ts — Shared TypeScript types for the DSE system
   ============================================================ */

export type SystemStatus =
  | 'READY'
  | 'RECORDING'
  | 'UPLOADING'
  | 'ANALYZING'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'ERROR';

export type PipelineStage =
  | 'INPUT_AUDIO'
  | 'PREPROCESSING'
  | 'NOISE_ANALYSIS'
  | 'DEEPFILTERNET3'
  | 'POST_PROCESSING'
  | 'ENHANCED_SPEECH';

export type StageStatus = 'waiting' | 'active' | 'complete' | 'error';

export type NoiseProfile =
  | 'helicopter'
  | 'engine'
  | 'gunfire'
  | 'wind'
  | 'environmental'
  | 'custom';

export type InferenceMode = 'ONNX' | 'PyTorch';

export interface WaveformPoint {
  t: number;  // time (s)
  v: number;  // amplitude
}

export interface SpectrumPoint {
  f: number;  // frequency (Hz)
  db: number; // magnitude (dBFS)
}

export interface SpectrogramData {
  data: number[][];
  n_frames: number;
  n_freqs: number;
  db_min: number;
  db_max: number;
}

export interface Metrics {
  input_snr: number | 'N/A';
  output_snr: number | 'N/A';
  snr_improvement: number | 'N/A';
  si_sdr: number | 'N/A';
  si_sdr_improvement: number | 'N/A';
  stoi: number | 'N/A';
  pesq: number | 'N/A';
  latency_ms: number;
  rtf: number;
  note?: string;
  rms_input?: number;
  rms_output?: number;
  peak_input?: number;
  peak_output?: number;
  dominant_freq_hz?: number;
}

export interface JobResult {
  status: SystemStatus;
  pipeline: Record<PipelineStage, StageStatus>;
  duration_s?: number;
  sample_rate?: number;
  noisy_waveform?: WaveformPoint[];
  enhanced_waveform?: WaveformPoint[];
  noisy_fft?: SpectrumPoint[];
  enhanced_fft?: SpectrumPoint[];
  noisy_spectrogram?: SpectrogramData;
  enhanced_spectrogram?: SpectrogramData;
  metrics?: Metrics;
  error?: string;
  input_sr?: number;
  input_channels?: number;
  original_filename?: string;
}

export interface UploadResponse {
  session_id: string;
  filename: string;
  duration_s: number;
  sample_rate: number;
  channels: number;
  warnings: string[];
}

export interface SystemStatusResponse {
  model: string;
  model_format: string;
  device: string;
  sample_rate: number;
  channels: string;
  chunk_seconds: number;
  backend: string;
  onnx_loaded: boolean;
}

export interface ProcessingConfig {
  noiseProfile: NoiseProfile;
  inferenceMode: InferenceMode;
  useNlms: boolean;
  chunkSeconds: number;
  useReferenceMic: boolean;
}

export type PlaybackTarget = 'noisy' | 'enhanced' | null;
