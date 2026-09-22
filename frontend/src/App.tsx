/* ============================================================
   App.tsx — Defence Speech Enhancement System
   Main orchestration + demo mode
   ============================================================ */
import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { WaveformPlot } from './components/WaveformPlot';
import { SpectrumPlot } from './components/SpectrumPlot';
import { SpectrogramPlot } from './components/SpectrogramPlot';
import { MetricsPanel } from './components/MetricsPanel';
import { PipelineStatus } from './components/PipelineStatus';
import { NoiseAnalysis } from './components/NoiseAnalysis';
import { AudioComparison } from './components/AudioComparison';
import { SNRMonitor } from './components/SNRMonitor';
import { SystemStatus } from './components/SystemStatus';
import { EdgeDeviceStatus } from './components/EdgeDeviceStatus';
import { EvaluationDashboard } from './components/evaluation/EvaluationDashboard';

import {
  uploadAudio,
  triggerEnhancement,
  pollUntilDone,
  getAudioUrl,
  getSystemStatus,
  checkHealth,
  calibrateSnr,
} from './api/client';

import type {
  SystemStatus as SystemStatusType,
  ProcessingConfig,
  JobResult,
  WaveformPoint,
  SpectrumPoint,
  SpectrogramData,
  Metrics,
  PipelineStage,
  StageStatus,
  SystemStatusResponse,
} from './types';

const roundVal = (v: number) => Math.round(v * 100) / 100;

/* ── Demo mode synthetic waveform generator ──────────────────────── */
function generateSyntheticWaveform(durationS: number): WaveformPoint[] {
  const pts = 600;
  const out: WaveformPoint[] = [];
  for (let i = 0; i < pts; i++) {
    const t = (i / pts) * durationS;
    // Helicopter-like: speech (sine ~200Hz) + rotor noise (~80Hz broadband)
    const speech = 0.4 * Math.sin(2 * Math.PI * 200 * t) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 3 * t));
    const rotor = 0.35 * Math.sin(2 * Math.PI * 80 * t) + 0.2 * (Math.random() - 0.5);
    out.push({ t: parseFloat(t.toFixed(4)), v: parseFloat((speech + rotor).toFixed(5)) });
  }
  return out;
}

function generateSyntheticSpectrum(): SpectrumPoint[] {
  const out: SpectrumPoint[] = [];
  for (let f = 0; f < 8000; f += 40) {
    const rotorNoise = f < 500 ? -20 + 15 * Math.exp(-f / 200) : -60;
    const speech = f > 100 && f < 4000 ? -35 + 8 * Math.sin(f / 300) : -70;
    const noise = (Math.random() - 0.5) * 4;
    out.push({ f, db: parseFloat((Math.max(rotorNoise, speech) + noise).toFixed(2)) });
  }
  return out;
}

function generateEnhancedSpectrum(): SpectrumPoint[] {
  const out: SpectrumPoint[] = [];
  for (let f = 0; f < 8000; f += 40) {
    const speech = f > 100 && f < 4000 ? -25 + 12 * Math.sin(f / 300) : -75;
    const noise = (Math.random() - 0.5) * 2;
    out.push({ f, db: parseFloat((speech + noise).toFixed(2)) });
  }
  return out;
}

function generateEnhancedWaveform(durationS: number): WaveformPoint[] {
  const pts = 600;
  const out: WaveformPoint[] = [];
  for (let i = 0; i < pts; i++) {
    const t = (i / pts) * durationS;
    const speech = 0.6 * Math.sin(2 * Math.PI * 200 * t) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 3 * t));
    const residual = 0.04 * (Math.random() - 0.5);
    out.push({ t: parseFloat(t.toFixed(4)), v: parseFloat((speech + residual).toFixed(5)) });
  }
  return out;
}

function generateSpectrogram(noisy: boolean): SpectrogramData {
  const n_frames = 80;
  const n_freqs = 32;
  const data: number[][] = [];
  for (let f = 0; f < n_frames; f++) {
    const row: number[] = [];
    for (let freq = 0; freq < n_freqs; freq++) {
      const speech = freq > 4 && freq < 24 ? 0.5 + 0.4 * Math.sin(f / 10) : 0.05;
      const helicopter = noisy && freq < 8 ? 0.6 + 0.3 * Math.random() : 0;
      const noise = noisy ? 0.2 * Math.random() : 0.03 * Math.random();
      row.push(Math.min(1, speech + helicopter + noise));
    }
    data.push(row);
  }
  return { data, n_frames, n_freqs, db_min: -80, db_max: 0 };
}

const DEFAULT_PIPELINE: Record<PipelineStage, StageStatus> = {
  INPUT_AUDIO:     'waiting',
  PREPROCESSING:   'waiting',
  NOISE_ANALYSIS:  'waiting',
  DEEPFILTERNET3:  'waiting',
  POST_PROCESSING: 'waiting',
  ENHANCED_SPEECH: 'waiting',
};

const INITIAL_PIPELINE: Record<PipelineStage, StageStatus> = {
  ...DEFAULT_PIPELINE,
  INPUT_AUDIO: 'complete',
};

export default function App() {
  /* ── View & Theme state ─────────────────────────────────────── */
  const [activeView, setActiveView] = useState<'evaluation' | 'workbench'>('evaluation');
  const [theme, setTheme] = useState<'white' | 'dark'>('dark');
  const [systemStatus, setSystemStatus] = useState<SystemStatusType>('READY');
  const [config, setConfig] = useState<ProcessingConfig>({
    noiseProfile: 'helicopter',
    inferenceMode: 'ONNX',
    useNlms: false,
    chunkSeconds: 2.0,
    useReferenceMic: false,
    snrCalibrationOffset: 0.0,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [noisyWaveform, setNoisyWaveform] = useState<WaveformPoint[] | null>(null);
  const [enhancedWaveform, setEnhancedWaveform] = useState<WaveformPoint[] | null>(null);
  const [noisySpectrum, setNoisySpectrum] = useState<SpectrumPoint[] | null>(null);
  const [enhancedSpectrum, setEnhancedSpectrum] = useState<SpectrumPoint[] | null>(null);
  const [noisySpec, setNoisySpec] = useState<SpectrogramData | null>(null);
  const [enhancedSpec, setEnhancedSpec] = useState<SpectrogramData | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [pipeline, setPipeline] = useState<Record<PipelineStage, StageStatus>>(DEFAULT_PIPELINE);

  const [noisyAudioUrl, setNoisyAudioUrl] = useState<string | null>(null);
  const [enhancedAudioUrl, setEnhancedAudioUrl] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | undefined>(undefined);
  const [audioSampleRate, setAudioSampleRate] = useState<number | undefined>(undefined);

  const [backendConnected, setBackendConnected] = useState(false);
  const [sysInfo, setSysInfo] = useState<SystemStatusResponse | null>(null);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);

  const [, setIsProcessing] = useState(false);

  /* ── SNR Calibration Callbacks ────────────────────────────────── */
  const handleCalibrationChange = useCallback(async (offsetDb: number) => {
    setConfig(prev => ({ ...prev, snrCalibrationOffset: offsetDb }));
    if (sessionId && metrics) {
      try {
        const res = await calibrateSnr(sessionId, offsetDb);
        if (res.metrics) {
          setMetrics(res.metrics);
        }
      } catch (e) {
        console.error('Calibration adjustment failed:', e);
      }
    } else if (metrics) {
      // Local adjustment for synthetic/demo mode
      setMetrics(prev => {
        if (!prev) return null;
        const rawIn = typeof prev.raw_input_snr === 'number' ? prev.raw_input_snr : (typeof prev.input_snr === 'number' ? prev.input_snr : 0);
        const rawOut = typeof prev.raw_output_snr === 'number' ? prev.raw_output_snr : (typeof prev.output_snr === 'number' ? prev.output_snr : 0);
        const calIn = roundVal(rawIn + offsetDb);
        const calOut = roundVal(rawOut + offsetDb);
        return {
          ...prev,
          raw_input_snr: rawIn,
          raw_output_snr: rawOut,
          input_snr: calIn,
          output_snr: calOut,
          snr_improvement: roundVal(calOut - calIn),
          calibration_offset_db: offsetDb,
          is_calibrated: offsetDb !== 0,
        };
      });
    }
  }, [sessionId, metrics]);

  const handleAutoCalibrate = useCallback(async () => {
    if (sessionId) {
      setIsCalibrating(true);
      try {
        const res = await calibrateSnr(sessionId, 0.0, true);
        if (res.metrics) {
          setConfig(prev => ({ ...prev, snrCalibrationOffset: res.calibration_offset_db }));
          setMetrics(res.metrics);
        }
      } catch (e) {
        console.error('Auto calibration failed:', e);
      } finally {
        setIsCalibrating(false);
      }
    }
  }, [sessionId]);

  /* ── Backend health check ─────────────────────────────────────── */
  useEffect(() => {
    const check = async () => {
      const ok = await checkHealth();
      setBackendConnected(ok);
      if (ok) {
        try {
          const info = await getSystemStatus();
          setSysInfo(info);
        } catch { /* ignore */ }
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  /* ── Instant Client-Side WebAudio SNR Calculation (< 2ms) ────── */
  const computeLocalAudioSNR = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = decoded.getChannelData(0);
      const sr = decoded.sampleRate;
      const frameLen = Math.floor(0.025 * sr); // 25ms
      if (channelData.length < frameLen) return null;

      const targetMaxFrames = 2000;
      const hopLen = Math.max(Math.floor(0.010 * sr), Math.floor((channelData.length - frameLen) / targetMaxFrames));
      const numFrames = Math.floor((channelData.length - frameLen) / hopLen) + 1;
      if (numFrames <= 0) return null;

      const energies = new Float32Array(numFrames);
      for (let i = 0; i < numFrames; i++) {
        let sumSq = 0;
        const offset = i * hopLen;
        for (let j = 0; j < frameLen; j++) {
          const v = channelData[offset + j];
          sumSq += v * v;
        }
        energies[i] = sumSq / frameLen + 1e-12;
      }
      energies.sort();

      const p20 = energies[Math.floor(numFrames * 0.20)];
      const p60 = energies[Math.floor(numFrames * 0.60)];
      const p80 = energies[Math.floor(numFrames * 0.80)];

      let speechSum = 0;
      let speechCnt = 0;
      for (let i = 0; i < numFrames; i++) {
        if (energies[i] > p60) {
          speechSum += energies[i];
          speechCnt++;
        }
      }
      const speechPow = speechCnt > 0 ? speechSum / speechCnt : p80;
      const snr = 10 * Math.log10(Math.max(speechPow - p20, 1e-10) / (p20 + 1e-10));
      const snrClamped = Math.max(-15, Math.min(45, Math.round(snr * 100) / 100));

      return {
        input_snr: snrClamped,
        output_snr: 'N/A' as const,
        snr_improvement: 'N/A' as const,
        raw_input_snr: snrClamped,
        noise_floor_in_db: Math.round(10 * Math.log10(p20 + 1e-12) * 10) / 10,
        speech_level_db: Math.round(10 * Math.log10(speechPow + 1e-12) * 10) / 10,
        si_sdr: 'N/A' as const,
        si_sdr_improvement: 'N/A' as const,
        stoi: 'N/A' as const,
        pesq: 'N/A' as const,
        latency_ms: 0,
        rtf: 0,
        note: 'Instant local SNR estimated in browser on file selection.',
      };
    } catch {
      return null;
    }
  };

  /* ── File selection ───────────────────────────────────────────── */
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setSystemStatus('UPLOADING');
    setWarnings([]);

    // Compute and display instant input SNR locally in < 2ms before network upload completes
    computeLocalAudioSNR(file).then(localMetrics => {
      if (localMetrics) {
        setMetrics(localMetrics);
      }
    });

    try {
      const result = await uploadAudio(file);
      setSessionId(result.session_id);
      setWarnings(result.warnings);
      setAudioDuration(result.duration_s);
      setAudioSampleRate(result.sample_rate);
      if (result.initial_metrics) setMetrics(result.initial_metrics);
      if (result.noisy_waveform) setNoisyWaveform(result.noisy_waveform);
      if (result.noisy_fft) setNoisySpectrum(result.noisy_fft);
      if (result.noisy_spectrogram) setNoisySpec(result.noisy_spectrogram);
      setPipeline(INITIAL_PIPELINE);
      setNoisyAudioUrl(getAudioUrl(result.session_id, 'noisy'));
      setSystemStatus('READY');
    } catch (err) {
      console.error('Upload failed:', err);
      setSystemStatus('ERROR');
      setWarnings(['Upload failed — is the backend running?']);
    }
  }, []);

  /* ── Run enhancement ──────────────────────────────────────────── */
  const handleRun = useCallback(async () => {
    if (!sessionId) return;
    setIsProcessing(true);
    setSystemStatus('PROCESSING');
    setEnhancedWaveform(null);
    setEnhancedSpectrum(null);
    setEnhancedSpec(null);
    setMetrics(prev => prev ? { ...prev, output_snr: 'N/A', snr_improvement: 'N/A' } : null);

    try {
      await triggerEnhancement(sessionId, config.useNlms, config.snrCalibrationOffset);

      const result = await pollUntilDone(sessionId, (r: JobResult) => {
        if (r.pipeline) setPipeline(r.pipeline);
        if (r.status) setSystemStatus(r.status === 'ANALYZING' ? 'ANALYZING' : 'PROCESSING');
        if (r.metrics) setMetrics(r.metrics);
      });

      if (result.status === 'COMPLETE') {
        if (result.noisy_waveform)   setNoisyWaveform(result.noisy_waveform);
        if (result.enhanced_waveform) setEnhancedWaveform(result.enhanced_waveform);
        if (result.noisy_fft)        setNoisySpectrum(result.noisy_fft);
        if (result.enhanced_fft)     setEnhancedSpectrum(result.enhanced_fft);
        if (result.noisy_spectrogram) setNoisySpec(result.noisy_spectrogram);
        if (result.enhanced_spectrogram) setEnhancedSpec(result.enhanced_spectrogram);
        if (result.metrics)           setMetrics(result.metrics);
        if (result.pipeline)          setPipeline(result.pipeline);
        if (result.metrics?.latency_ms) setLatencyMs(result.metrics.latency_ms);
        setEnhancedAudioUrl(getAudioUrl(sessionId, 'enhanced'));
        setSystemStatus('COMPLETE');
      } else {
        setSystemStatus('ERROR');
      }
    } catch (err) {
      console.error('Enhancement failed:', err);
      setSystemStatus('ERROR');
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, config.useNlms, config.snrCalibrationOffset]);

  /* ── Reset ────────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setSessionId(null);
    setWarnings([]);
    setNoisyWaveform(null);
    setEnhancedWaveform(null);
    setNoisySpectrum(null);
    setEnhancedSpectrum(null);
    setNoisySpec(null);
    setEnhancedSpec(null);
    setMetrics(null);
    setNoisyAudioUrl(null);
    setEnhancedAudioUrl(null);
    setLatencyMs(null);
    setAudioDuration(undefined);
    setAudioSampleRate(undefined);
    setPipeline(DEFAULT_PIPELINE);
    setSystemStatus('READY');
  }, []);

  /* ── Export ───────────────────────────────────────────────────── */
  const handleExport = useCallback(() => {
    if (!enhancedAudioUrl) return;
    const a = document.createElement('a');
    a.href = enhancedAudioUrl;
    a.download = 'enhanced_speech.wav';
    a.click();
  }, [enhancedAudioUrl]);

  /* ── Demo Mode ────────────────────────────────────────────────── */
  // (reserved for cancellation logic)

  const runDemoMode = useCallback(async () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    handleReset();

    const DEMO_DURATION = 4.5;

    // Step 1: Simulate file loaded
    await new Promise(r => setTimeout(r, 600));
    setSelectedFile(new File([''], 'helicopter_speech_demo.wav', { type: 'audio/wav' }));
    setAudioDuration(DEMO_DURATION);
    setAudioSampleRate(48000);
    setWarnings([]);
    setSystemStatus('READY');
    setPipeline(INITIAL_PIPELINE);

    // Step 2: Show noisy waveform + spectrum
    await new Promise(r => setTimeout(r, 700));
    setNoisyWaveform(generateSyntheticWaveform(DEMO_DURATION));
    setNoisySpectrum(generateSyntheticSpectrum());
    setNoisySpec(generateSpectrogram(true));

    // Step 3: Start processing animation
    await new Promise(r => setTimeout(r, 500));
    setSystemStatus('PROCESSING');

    const stages: PipelineStage[] = [
      'PREPROCESSING', 'NOISE_ANALYSIS', 'DEEPFILTERNET3', 'POST_PROCESSING', 'ENHANCED_SPEECH',
    ];
    for (const stage of stages) {
      setPipeline(prev => ({ ...prev, [stage]: 'active' }));
      await new Promise(r => setTimeout(r, 600));
      setPipeline(prev => ({ ...prev, [stage]: 'complete' }));
    }

    // Step 4: Show enhanced results
    await new Promise(r => setTimeout(r, 300));
    setEnhancedWaveform(generateEnhancedWaveform(DEMO_DURATION));
    setEnhancedSpectrum(generateEnhancedSpectrum());
    setEnhancedSpec(generateSpectrogram(false));
    setLatencyMs(24);

    // Step 5: Show metrics (realistic, matching README results)
    setMetrics({
      input_snr: 2.41,
      output_snr: 14.09,
      snr_improvement: 11.68,
      si_sdr: 12.34,
      si_sdr_improvement: 9.91,
      stoi: 0.906,
      pesq: 2.56,
      latency_ms: 24,
      rtf: 0.012,
      rms_input: 0.1823,
      rms_output: 0.2341,
      peak_input: 0.7832,
      peak_output: 0.8104,
      dominant_freq_hz: 80,
      note: 'DEMO MODE — values from published evaluation on 48-file held-out test set',
    });

    setSystemStatus('COMPLETE');
    setIsDemoRunning(false);
  }, [isDemoRunning, handleReset]);

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <div className={`flex flex-col min-h-screen transition-colors duration-200 ${
      theme === 'white' ? 'bg-slate-900 text-slate-100' : 'bg-transparent text-slate-100'
    }`}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <Header
        status={systemStatus}
        latencyMs={latencyMs}
        inputSnr={typeof metrics?.input_snr === 'number' ? metrics.input_snr : null}
        outputSnr={typeof metrics?.output_snr === 'number' ? metrics.output_snr : null}
        snrGain={typeof metrics?.snr_improvement === 'number' ? metrics.snr_improvement : null}
        backendConnected={backendConnected}
        onDemoMode={runDemoMode}
        isDemoRunning={isDemoRunning}
        activeView={activeView}
        onViewChange={setActiveView}
        theme={theme}
        onToggleTheme={() => setTheme(t => t === 'white' ? 'dark' : 'white')}
      />

      {/* ── Conditional View: Evaluation Dashboard vs Workbench ─── */}
      {activeView === 'evaluation' ? (
        <EvaluationDashboard theme={theme} />
      ) : (
        <>
          {/* ── Main 3-column grid ──────────────────────────────────── */}
          <div className="flex-1 p-3 pt-3 grid overflow-hidden" style={{
            gridTemplateColumns: '272px 1fr 252px',
            gap: '12px',
            minHeight: 0,
          }}>

        {/* ── LEFT: Control Panel ─────────────────────────────── */}
        <ControlPanel
          config={config}
          onConfigChange={cfg => setConfig(prev => ({ ...prev, ...cfg }))}
          onFileSelect={handleFileSelect}
          onRun={handleRun}
          onReset={handleReset}
          onExport={handleExport}
          onStartRecording={() => {}}
          selectedFile={selectedFile}
          status={systemStatus}
          warnings={warnings}
        />

        {/* ── CENTER: Workspace ────────────────────────────────── */}
        <div className="flex flex-col gap-3 min-w-0 overflow-y-auto pr-0.5">

          {/* Row 1: Waveforms */}
          <div className="grid grid-cols-2 gap-3">
            <WaveformPlot
              title="Time Domain — Noisy Input"
              data={noisyWaveform}
              audioUrl={noisyAudioUrl}
              duration={audioDuration}
              sampleRate={audioSampleRate}
              channels={1}
              peakAmplitude={metrics?.peak_input as number | undefined}
              rms={metrics?.rms_input as number | undefined}
              label="NOISY"
              variant="noisy"
            />
            <WaveformPlot
              title="Time Domain — Enhanced"
              data={enhancedWaveform}
              audioUrl={enhancedAudioUrl}
              duration={audioDuration}
              sampleRate={audioSampleRate}
              channels={1}
              peakAmplitude={metrics?.peak_output as number | undefined}
              rms={metrics?.rms_output as number | undefined}
              label="ENHANCED"
              variant="enhanced"
            />
          </div>

          {/* Row 2: Spectra */}
          <div className="grid grid-cols-2 gap-3">
            <SpectrumPlot title="Frequency Domain — Noisy" data={noisySpectrum} label="NOISY" variant="noisy" />
            <SpectrumPlot title="Frequency Domain — Enhanced" data={enhancedSpectrum} label="ENHANCED" variant="enhanced" />
          </div>

          {/* Row 3: Spectrograms */}
          <div className="grid grid-cols-2 gap-3">
            <SpectrogramPlot title="Spectrogram — Noisy" data={noisySpec} label="NOISY" variant="noisy" />
            <SpectrogramPlot title="Spectrogram — Enhanced" data={enhancedSpec} label="ENHANCED" variant="enhanced" />
          </div>

          {/* Row 4: A/B Comparison */}
          <AudioComparison
            noisyUrl={noisyAudioUrl}
            enhancedUrl={enhancedAudioUrl}
            jobId={sessionId}
          />
        </div>

        {/* ── RIGHT: Info Column ──────────────────────────────── */}
        <div className="flex flex-col gap-3 overflow-y-auto pr-0.5">
          <SNRMonitor
            metrics={metrics}
            isLoading={systemStatus === 'PROCESSING' || systemStatus === 'ANALYZING'}
            calibrationOffset={config.snrCalibrationOffset}
            onCalibrationChange={handleCalibrationChange}
            onAutoCalibrate={handleAutoCalibrate}
            isCalibrating={isCalibrating}
          />
          <MetricsPanel
            metrics={metrics}
            isLoading={systemStatus === 'PROCESSING' || systemStatus === 'ANALYZING'}
          />
          <SystemStatus
            status={systemStatus}
            sysInfo={sysInfo}
            latencyMs={latencyMs}
            chunkSeconds={config.chunkSeconds}
          />
          <EdgeDeviceStatus
            cpuPercent={null}
            ramMb={null}
            latencyMs={latencyMs}
            rtf={metrics?.rtf as number | null ?? null}
            connected={false}
          />
        </div>
      </div>

      {/* ── Bottom strip: Pipeline + Noise Analysis ─────────────── */}
      <div className="p-1.5 pt-0 grid gap-1.5" style={{ gridTemplateColumns: '1fr 280px' }}>
        <PipelineStatus stages={pipeline} />
        <NoiseAnalysis
          noiseProfile={config.noiseProfile}
          dominantFreqHz={metrics?.dominant_freq_hz ?? null}
          spectrumData={noisySpectrum}
          estimatedSnrDb={
            typeof metrics?.input_snr === 'number' ? metrics.input_snr : null
          }
        />
      </div>
        </>
      )}
    </div>
  );
}
