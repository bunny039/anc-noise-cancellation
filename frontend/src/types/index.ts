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
  raw_input_snr?: number;
  raw_output_snr?: number;
  calibration_offset_db?: number;
  is_calibrated?: boolean;
  noise_floor_in_db?: number;
  noise_floor_out_db?: number;
  noise_reduction_db?: number;
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
  initial_metrics?: Metrics;
  noisy_waveform?: WaveformPoint[];
  noisy_fft?: SpectrumPoint[];
  noisy_spectrogram?: SpectrogramData;
  detected_condition?: EvaluationCondition;
  detection_confidence?: number;
  detected_snr_db?: number;
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
  snrCalibrationOffset: number;
}

export type PlaybackTarget = 'noisy' | 'enhanced' | null;

/* ── Evaluation Dashboard Types ─────────────────────────────── */
export type EvaluationCondition =
  | 'Engine'
  | 'Helicopter'
  | 'UAV'
  | 'Siren'
  | 'Gunshot'
  | 'Artillery';

export type ConditionStatus = 'PASS' | 'FAIL' | 'NOT_TESTED';

export interface EvaluationRow {
  id: string;
  name: string;
  icon: string;
  input_snr_db: number;
  output_snr_db: number | null;
  snr_improvement_db: number | null;
  stoi: number | null;
  pesq: number | null;
  latency_ms: number | null;
  status: ConditionStatus;
  notes?: string;
  noisy_audio_url?: string;
  enhanced_audio_url?: string;
  is_detected?: boolean;
}

export type EvaluationStepId =
  | 'IDLE'
  | 'PROCESSING'
  | 'LOADING_AUDIO'
  | 'RUNNING_ENHANCEMENT'
  | 'CALCULATING_SNR'
  | 'CALCULATING_STOI'
  | 'CALCULATING_PESQ'
  | 'MEASURING_LATENCY'
  | 'EVALUATION_COMPLETE';

export interface EvaluationStep {
  id: EvaluationStepId;
  label: string;
  description: string;
}

export interface EvaluationResponse {
  noise: string;
  input_snr_db: number;
  output_snr_db: number;
  snr_improvement_db: number;
  stoi: number;
  pesq: number;
  latency_ms: number;
  status: 'PASS' | 'FAIL';
  enhanced_audio_url?: string;
  detected_condition?: EvaluationCondition;
  detection_confidence?: number;
}

export interface EvaluationSummary {
  avg_snr_improvement: number | null;
  avg_stoi: number | null;
  avg_pesq: number | null;
  avg_latency: number | null;
  overall_status: ConditionStatus;
  evaluated_count: number;
  total_count: number;
}

