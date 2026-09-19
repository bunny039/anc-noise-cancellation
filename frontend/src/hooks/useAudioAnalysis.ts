/* ============================================================
   hooks/useAudioAnalysis.ts
   Web Audio API utilities: extract waveform + FFT from a File
   ============================================================ */

import { useCallback } from 'react';
import type { WaveformPoint, SpectrumPoint } from '../types';

export function useAudioAnalysis() {
  /** Decode an audio File to a Float32Array of PCM samples */
  const decodeAudio = useCallback(async (file: File): Promise<{ samples: Float32Array; sr: number }> => {
    const ctx = new AudioContext();
    const buffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buffer);
    await ctx.close();
    // Mix down to mono
    const ch = decoded.numberOfChannels;
    const len = decoded.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
      const channel = decoded.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += channel[i] / ch;
    }
    return { samples: mono, sr: decoded.sampleRate };
  }, []);

  /** Downsample PCM to waveform display points */
  const computeWaveform = useCallback(
    (samples: Float32Array, sr: number, maxPoints = 2000): WaveformPoint[] => {
      const step = Math.max(1, Math.floor(samples.length / maxPoints));
      const out: WaveformPoint[] = [];
      for (let i = 0; i < samples.length; i += step) {
        out.push({ t: parseFloat((i / sr).toFixed(4)), v: parseFloat(samples[i].toFixed(5)) });
      }
      return out;
    },
    [],
  );

  /** Compute FFT magnitude spectrum */
  const computeSpectrum = useCallback(
    (samples: Float32Array, sr: number, nFft = 2048): SpectrumPoint[] => {
      const ctx = new OffscreenCanvas(1, 1).getContext('2d'); // just need ctx namespace
      void ctx; // suppress lint

      // Simple DFT-based approach using AnalyserNode is more ergonomic
      // We'll do it manually via a fixed FFT window
      const len = Math.min(samples.length, nFft);
      const windowed = new Float32Array(nFft);
      for (let i = 0; i < len; i++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (nFft - 1))); // Hann
        windowed[i] = samples[i] * w;
      }

      // Use Web Audio AnalyserNode trick for FFT
      const offCtx = new OfflineAudioContext(1, nFft, sr);
      const buffer = offCtx.createBuffer(1, nFft, sr);
      buffer.copyToChannel(windowed, 0);
      const src = offCtx.createBufferSource();
      src.buffer = buffer;
      const analyser = offCtx.createAnalyser();
      analyser.fftSize = nFft;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      analyser.connect(offCtx.destination);
      src.start();
      // We can't await the render here synchronously, so we fall back to manual FFT
      // Simple real-to-complex DFT for small nFft:
      const bins = nFft / 2 + 1;
      const re = new Float32Array(bins);
      const im = new Float32Array(bins);
      for (let k = 0; k < bins; k++) {
        for (let n = 0; n < nFft; n++) {
          const angle = (2 * Math.PI * k * n) / nFft;
          re[k] += windowed[n] * Math.cos(angle);
          im[k] -= windowed[n] * Math.sin(angle);
        }
      }
      const out: SpectrumPoint[] = [];
      for (let k = 0; k < bins; k++) {
        const freq = (k * sr) / nFft;
        if (freq > 8000) break; // limit display to 8 kHz
        const mag = Math.sqrt(re[k] ** 2 + im[k] ** 2);
        const db = 20 * Math.log10(mag + 1e-8);
        out.push({ f: parseFloat(freq.toFixed(1)), db: parseFloat(db.toFixed(2)) });
      }
      return out;
    },
    [],
  );

  return { decodeAudio, computeWaveform, computeSpectrum };
}
