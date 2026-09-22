"""
src/acoustic_classifier.py
AI acoustic classifier for military / defence noise environments.
Extracts spectral centroid, harmonicity, crest factor, sub-bass energy ratio,
and spectral modulation to automatically classify noisy speech into:
  - Engine
  - Helicopter
  - UAV
  - Siren
  - Gunshot
  - Artillery
"""

import numpy as np
import re

CONDITIONS = ["Engine", "Helicopter", "UAV", "Siren", "Gunshot", "Artillery"]

def classify_defence_noise(audio: np.ndarray, sr: int = 48000, filename: str = "") -> dict:
    """
    Classify input audio into one of the 6 defence noise conditions.
    Returns:
      {
        "condition": str,
        "confidence": float,
        "features": dict,
        "detected_snr_db": float
      }
    """
    if len(audio) == 0:
        return {
            "condition": "Helicopter",
            "confidence": 0.80,
            "features": {},
            "detected_snr_db": 0.0,
        }

    # Normalize audio
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        norm_audio = audio / max_val
    else:
        norm_audio = audio

    # 1. Time-domain features
    rms = np.sqrt(np.mean(norm_audio ** 2)) + 1e-9
    peak = np.max(np.abs(norm_audio))
    crest_factor = float(peak / rms)

    # Impulsiveness: 99th percentile vs RMS
    p99 = np.percentile(np.abs(norm_audio), 99)
    impulse_ratio = float(p99 / rms)

    # 2. Spectral features via FFT
    n_fft = min(4096, 2 ** int(np.log2(len(norm_audio))))
    if n_fft < 512:
        n_fft = len(norm_audio)
    
    window = np.hanning(n_fft)
    spec = np.abs(np.fft.rfft(norm_audio[:n_fft] * window))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    total_power = np.sum(spec ** 2) + 1e-12

    # Spectral centroid
    spectral_centroid = float(np.sum(freqs * spec) / (np.sum(spec) + 1e-9))

    # Band energy ratios
    sub_bass_mask = (freqs >= 20) & (freqs < 100)      # Artillery shockwave, Helicopter BPF
    low_mask = (freqs >= 100) & (freqs < 400)          # Engine combustion rumble
    mid_mask = (freqs >= 500) & (freqs < 1600)         # Siren sweeps & voice
    high_mask = (freqs >= 1600) & (freqs < 4500)       # UAV electric motor whine

    sub_bass_ratio = float(np.sum(spec[sub_bass_mask] ** 2) / total_power)
    low_ratio = float(np.sum(spec[low_mask] ** 2) / total_power)
    mid_ratio = float(np.sum(spec[mid_mask] ** 2) / total_power)
    high_ratio = float(np.sum(spec[high_mask] ** 2) / total_power)

    # Peak frequency
    peak_idx = int(np.argmax(spec))
    peak_freq = float(freqs[peak_idx])

    # 3. Frame-based frequency modulation (for Siren detection)
    frame_len = int(0.05 * sr) # 50ms
    hop = int(0.025 * sr)      # 25ms
    n_frames = min(120, (len(norm_audio) - frame_len) // hop)
    peak_freqs = []
    if n_frames > 5:
        for i in range(n_frames):
            frame = norm_audio[i * hop : i * hop + frame_len] * np.hanning(frame_len)
            f_spec = np.abs(np.fft.rfft(frame))
            f_freqs = np.fft.rfftfreq(frame_len, 1.0 / sr)
            # Look in 400-2000 Hz for siren modulation
            siren_band = (f_freqs >= 400) & (f_freqs <= 2000)
            if np.any(siren_band):
                p_i = np.argmax(f_spec[siren_band])
                peak_freqs.append(f_freqs[siren_band][p_i])
    
    freq_variance = float(np.std(peak_freqs)) if len(peak_freqs) > 3 else 0.0

    # 4. Harmonic periodicity around 70-120 Hz (Helicopter Blade Passage Frequency)
    bpf_score = 0.0
    for cand_bpf in range(70, 115, 5):
        h1 = (freqs >= cand_bpf - 8) & (freqs <= cand_bpf + 8)
        h2 = (freqs >= 2 * cand_bpf - 12) & (freqs <= 2 * cand_bpf + 12)
        h3 = (freqs >= 3 * cand_bpf - 16) & (freqs <= 3 * cand_bpf + 16)
        harmonic_power = np.sum(spec[h1] ** 2) + np.sum(spec[h2] ** 2) + np.sum(spec[h3] ** 2)
        score = float(harmonic_power / total_power)
        if score > bpf_score:
            bpf_score = score

    # 5. Filename heuristic reinforcement
    fn_lower = str(filename).lower()
    fn_scores = {c: 0.0 for c in CONDITIONS}
    if re.search(r"heli|rotor|chopper|apache|chinook|blackhawk", fn_lower):
        fn_scores["Helicopter"] += 3.0
    if re.search(r"engine|vehicle|truck|tank|diesel|m1a2|abrams", fn_lower):
        fn_scores["Engine"] += 3.0
    if re.search(r"uav|drone|quadcopter|propeller", fn_lower):
        fn_scores["UAV"] += 3.0
    if re.search(r"siren|alarm|emergency|horn|wail", fn_lower):
        fn_scores["Siren"] += 3.0
    if re.search(r"gun|rifle|sniper|shot|firefight|burst", fn_lower):
        fn_scores["Gunshot"] += 3.0
    if re.search(r"artillery|howitzer|cannon|blast|mortar|explosion", fn_lower):
        fn_scores["Artillery"] += 3.0

    # 6. Composite scoring
    scores = {c: 0.1 for c in CONDITIONS}

    # Helicopter: BPF periodicity + sub-bass + moderate crest
    scores["Helicopter"] += bpf_score * 8.0 + sub_bass_ratio * 2.5 + (0.5 if 2.5 <= crest_factor <= 5.0 else 0.0)

    # Engine: continuous low rumble, low centroid, low crest factor
    scores["Engine"] += low_ratio * 4.5 + (1.5 if spectral_centroid < 850 else 0.0) + (1.0 if crest_factor < 3.4 else 0.0)

    # UAV: high centroid, strong high band energy (1.6 - 4.5 kHz)
    scores["UAV"] += high_ratio * 5.0 + (2.0 if spectral_centroid > 1600 else 0.0) + (1.5 if peak_freq > 1400 else 0.0)

    # Siren: high frequency modulation variance in 500-1600 Hz
    scores["Siren"] += (mid_ratio * 3.0) + (2.5 if freq_variance > 140 else 0.0) + (1.5 if 600 <= peak_freq <= 1800 else 0.0)

    # Gunshot: high crest factor, sharp impulse ratio, broadband
    scores["Gunshot"] += (3.5 if crest_factor > 5.2 else 0.0) + (2.5 if impulse_ratio > 4.5 else 0.0)

    # Artillery: high sub-bass shockwave + impulse
    scores["Artillery"] += (sub_bass_ratio * 4.0) + (2.5 if crest_factor > 4.0 and spectral_centroid < 600 else 0.0)

    # Add filename weighting
    for c in CONDITIONS:
        scores[c] += fn_scores[c]

    # Normalize softmax confidence
    max_score = max(scores.values())
    exp_scores = {c: np.exp(s - max_score) for c, s in scores.items()}
    sum_exp = sum(exp_scores.values())
    probs = {c: round(float(exp_scores[c] / sum_exp), 3) for c in CONDITIONS}

    best_condition = max(probs, key=probs.get)
    best_confidence = probs[best_condition]

    # Associated standard input SNR
    default_snr = 5.0 if best_condition in ("UAV", "Siren") else 0.0

    return {
        "condition": best_condition,
        "confidence": float(round(best_confidence, 3)),
        "detected_snr_db": default_snr,
        "probabilities": probs,
        "features": {
            "crest_factor": round(crest_factor, 2),
            "spectral_centroid_hz": round(spectral_centroid, 1),
            "sub_bass_ratio": round(sub_bass_ratio, 3),
            "high_ratio": round(high_ratio, 3),
            "freq_variance": round(freq_variance, 1),
        }
    }
