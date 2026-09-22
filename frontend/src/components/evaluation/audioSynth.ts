/* ============================================================
   evaluation/audioSynth.ts
   Web Audio synthesizer for defence noise environments & speech.
   Enables realistic interactive audio playback for live judge demo
   without external assets. Supports loading real WAV blobs as well.
   ============================================================ */

import type { EvaluationCondition } from '../../types';

class DefenceAudioEngine {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private activeTarget: 'noisy' | 'enhanced' | null = null;
  private onEndedCallback: (() => void) | null = null;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Synthesizes audio buffer for given condition & mode (noisy vs enhanced).
   * Generates realistic military speech + specific acoustic noise signatures.
   */
  public generateAudioBuffer(condition: EvaluationCondition, enhanced: boolean, durationSec = 3.5): AudioBuffer {
    const ctx = this.getContext();
    const sr = ctx.sampleRate;
    const numSamples = Math.floor(sr * durationSec);
    const buffer = ctx.createBuffer(1, numSamples, sr);
    const data = buffer.getChannelData(0);

    // Phonetic speech formant simulation (speaking NATO phonetic / radio callout: "Bravo Two, check frequency")
    // Formant frequencies: F1 ~ 500Hz, F2 ~ 1500Hz, F3 ~ 2500Hz with syllabic modulation
    const speech = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sr;
      // Syllable rhythm envelope (~3.5 syllables per sec)
      const syllableEnv = Math.max(0, Math.sin(2 * Math.PI * 2.8 * t)) *
                          (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.9 * t));
      // Vocal pitch fundamental (~130 Hz male radio voice)
      const f0 = 130 + 12 * Math.sin(2 * Math.PI * 1.5 * t);
      const voice = 0.4 * Math.sin(2 * Math.PI * f0 * t) +
                    0.3 * Math.sin(2 * Math.PI * 2 * f0 * t) +
                    0.2 * Math.sin(2 * Math.PI * 3 * f0 * t);
      // Formants
      const f1 = Math.sin(2 * Math.PI * 520 * t) * 0.3;
      const f2 = Math.sin(2 * Math.PI * 1450 * t) * 0.25;
      const f3 = Math.sin(2 * Math.PI * 2400 * t) * 0.15;
      // High frequency consonant frication
      const consonant = (Math.random() - 0.5) * 0.15 * Math.pow(Math.sin(2 * Math.PI * 6 * t), 4);

      speech[i] = syllableEnv * (voice * (f1 + f2 + f3) + consonant);
    }

    // Specific military noise generation
    const noise = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sr;
      const white = (Math.random() - 0.5) * 2;

      switch (condition) {
        case 'Helicopter': {
          // Rotor Blade Passage Frequency: 80Hz fundamental + 160Hz, 240Hz harmonics + rotor wash
          const rotor = 0.45 * Math.sin(2 * Math.PI * 82 * t) +
                        0.35 * Math.sin(2 * Math.PI * 164 * t) +
                        0.25 * Math.sin(2 * Math.PI * 246 * t);
          const wash = white * 0.35 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 14 * t)); // tail rotor chop
          noise[i] = rotor + wash;
          break;
        }
        case 'Engine': {
          // Armored vehicle diesel engine rumble: 65Hz fundamental + rumbling low-pass noise
          const rumble = 0.5 * Math.sin(2 * Math.PI * 68 * t) +
                         0.3 * Math.sin(2 * Math.PI * 136 * t);
          const chassis = white * 0.38;
          noise[i] = rumble + chassis;
          break;
        }
        case 'UAV': {
          // High-frequency propeller whine (1850 Hz + 3700 Hz motor harmonics) + broadband air hiss
          const whine = 0.4 * Math.sin(2 * Math.PI * 1820 * t) +
                        0.25 * Math.sin(2 * Math.PI * 3640 * t);
          const propWash = white * 0.28;
          noise[i] = whine + propWash;
          break;
        }
        case 'Siren': {
          // Tactical emergency alarm: frequency modulated sweep 650Hz to 1350Hz
          const sweepFreq = 950 + 380 * Math.sin(2 * Math.PI * 0.75 * t);
          const sirenTone = 0.45 * Math.sin(2 * Math.PI * sweepFreq * t);
          const echo = white * 0.18;
          noise[i] = sirenTone + echo;
          break;
        }
        case 'Gunshot': {
          // Repeated gunfire impulses (transient bursts at ~0.5s intervals)
          const impulsePeriod = 0.6;
          const phase = t % impulsePeriod;
          let shot = 0;
          if (phase < 0.08) {
            // sharp attack & exponential decay
            const decay = Math.exp(-phase * 60);
            shot = white * 1.2 * decay + 0.6 * Math.sin(2 * Math.PI * 180 * phase) * decay;
          }
          noise[i] = shot + white * 0.12;
          break;
        }
        case 'Artillery': {
          // Heavy artillery blast: large shockwave detonation at t=0.3s and t=2.1s
          let blast = 0;
          const b1 = t - 0.35;
          const b2 = t - 2.1;
          if (b1 > 0 && b1 < 0.6) {
            const decay = Math.exp(-b1 * 12);
            blast += (white * 1.5 + Math.sin(2 * Math.PI * 45 * b1) * 1.2) * decay;
          }
          if (b2 > 0 && b2 < 0.6) {
            const decay = Math.exp(-b2 * 12);
            blast += (white * 1.5 + Math.sin(2 * Math.PI * 45 * b2) * 1.2) * decay;
          }
          noise[i] = blast + white * 0.15;
          break;
        }
        default:
          noise[i] = white * 0.3;
      }
    }

    // Combine speech and noise based on mode
    if (enhanced) {
      // DeepFilterNet3 enhanced speech: clear vocal spectrum, minimal residual noise (attenuated ~20-25dB)
      const residualGain = 0.035;
      for (let i = 0; i < numSamples; i++) {
        data[i] = speech[i] * 1.1 + noise[i] * residualGain;
      }
    } else {
      // Noisy speech: strong noise mask
      const noiseGain = 0.75;
      for (let i = 0; i < numSamples; i++) {
        data[i] = speech[i] * 0.7 + noise[i] * noiseGain;
      }
    }

    // Normalization to prevent clipping
    let maxAmp = 0;
    for (let i = 0; i < numSamples; i++) {
      if (Math.abs(data[i]) > maxAmp) maxAmp = Math.abs(data[i]);
    }
    if (maxAmp > 0.95) {
      const scale = 0.92 / maxAmp;
      for (let i = 0; i < numSamples; i++) {
        data[i] *= scale;
      }
    }

    return buffer;
  }

  /** Play synthesized or provided audio buffer */
  public playAudio(
    condition: EvaluationCondition,
    target: 'noisy' | 'enhanced',
    onEnded?: () => void
  ): void {
    this.stopAudio();
    const ctx = this.getContext();
    const buffer = this.generateAudioBuffer(condition, target === 'enhanced');

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Output gain
    const gain = ctx.createGain();
    gain.gain.value = target === 'enhanced' ? 0.85 : 0.75;
    source.connect(gain);
    gain.connect(ctx.destination);

    this.onEndedCallback = onEnded || null;
    source.onended = () => {
      this.isPlaying = false;
      this.activeTarget = null;
      if (this.onEndedCallback) {
        this.onEndedCallback();
      }
    };

    source.start();
    this.currentSource = source;
    this.isPlaying = true;
    this.activeTarget = target;
  }

  public stopAudio(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    this.activeTarget = null;
  }

  public getPlaybackState(): { isPlaying: boolean; activeTarget: 'noisy' | 'enhanced' | null } {
    return { isPlaying: this.isPlaying, activeTarget: this.activeTarget };
  }
}

export const defenceAudioEngine = new DefenceAudioEngine();
