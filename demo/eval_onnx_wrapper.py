"""
Batch evaluation of the onnxruntime DSP wrapper (src/df_onnx_dsp.py)
against synthetic_defence_test clean/noisy pairs. Reuses compute_snr_db
and pass_fail from demo/live_demo.py so SNR/pass-fail numbers stay
directly comparable to the existing PyTorch-pipeline baselines. Test
files are native 16kHz; the ONNX model runs at 48kHz, so noisy audio is
resampled 16k->48k before enhance_chunk and the enhanced output is
resampled back 48k->16k before scoring against the 16k clean reference,
matching the resampling convention already used in src/pipeline.py.
Each file is processed as one whole-buffer chunk (offline/batch mode,
GRU state reset per file), matching how the PyTorch-pipeline baseline
was evaluated.
"""

import glob
import os
import sys
import time

import librosa
import numpy as np
import soundfile as sf
import yaml
from pesq import pesq
from pystoi import stoi

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from demo.live_demo import compute_snr_db, pass_fail
import src.df_onnx_dsp as wrap

NOISY_DIR = os.path.join(PROJECT_ROOT, "data", "processed", "synthetic_defence_test", "noisy")
CLEAN_DIR = os.path.join(PROJECT_ROOT, "data", "processed", "synthetic_defence_test", "clean")
ONNX_DIR = os.path.join(PROJECT_ROOT, "models", "onnx_export")
CONFIG_PATH = os.path.join(PROJECT_ROOT, "configs", "config.yaml")
MAX_FILES = 50


def load_targets(config_path):
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)
    return config["evaluation"]["targets"]


def evaluate_file(noisy_path, clean_path, enc_session, erb_dec_session, df_dec_session, erb_inv_fb):
    noisy, sr_noisy = sf.read(noisy_path, dtype="float32")
    clean, sr_clean = sf.read(clean_path, dtype="float32")
    if noisy.ndim > 1:
        noisy = noisy.mean(axis=1)
    if clean.ndim > 1:
        clean = clean.mean(axis=1)
    if sr_noisy != sr_clean:
        raise ValueError(f"Sample rate mismatch: noisy={sr_noisy}, clean={sr_clean} for {noisy_path}")

    native_sr = sr_noisy
    if native_sr != wrap.SR:
        noisy_model_sr = librosa.resample(noisy, orig_sr=native_sr, target_sr=wrap.SR)
    else:
        noisy_model_sr = noisy

    start = time.perf_counter()
    enhanced_model_sr = wrap.enhance_chunk(noisy_model_sr, enc_session, erb_dec_session, df_dec_session, erb_inv_fb)
    elapsed = time.perf_counter() - start

    if native_sr != wrap.SR:
        enhanced = librosa.resample(enhanced_model_sr, orig_sr=wrap.SR, target_sr=native_sr)
    else:
        enhanced = enhanced_model_sr

    n = min(len(clean), len(noisy), len(enhanced))
    clean = clean[:n]
    noisy = noisy[:n]
    enhanced = enhanced[:n]

    snr_before = compute_snr_db(clean, noisy)
    snr_after = compute_snr_db(clean, enhanced)
    snr_improvement = snr_after - snr_before

    try:
        stoi_value = float(stoi(clean, enhanced, native_sr, extended=False))
    except Exception as exc:
        stoi_value = None
        print(f"  STOI failed for {noisy_path}: {exc}")

    try:
        pesq_mode = "wb" if native_sr >= 16000 else "nb"
        pesq_value = float(pesq(native_sr, clean, enhanced, pesq_mode))
    except Exception as exc:
        pesq_value = None
        print(f"  PESQ failed for {noisy_path}: {exc}")

    model_sr_len = len(noisy_model_sr)
    num_frames = 1 + (model_sr_len - wrap.FFT_SIZE) // wrap.HOP_SIZE if model_sr_len >= wrap.FFT_SIZE else 1
    latency_ms = (elapsed / num_frames) * 1000.0

    return {
        "file": os.path.basename(noisy_path),
        "snr_before_db": snr_before,
        "snr_after_db": snr_after,
        "snr_improvement_db": snr_improvement,
        "stoi": stoi_value,
        "pesq": pesq_value,
        "latency_ms": latency_ms,
    }


def main():
    targets = load_targets(CONFIG_PATH)
    erb_inv_fb = wrap.build_erb_inv_fb(wrap.ERB_WIDTHS)
    enc_session, erb_dec_session, df_dec_session = wrap.load_sessions(ONNX_DIR)

    noisy_paths = sorted(glob.glob(os.path.join(NOISY_DIR, "*.wav")))[:MAX_FILES]
    if not noisy_paths:
        print(f"No wav files found in {NOISY_DIR}")
        return

    results = []
    for noisy_path in noisy_paths:
        filename = os.path.basename(noisy_path)
        clean_path = os.path.join(CLEAN_DIR, filename)
        if not os.path.exists(clean_path):
            print(f"Skipping {filename}: no matching clean file at {clean_path}")
            continue
        print(f"Processing {filename}...")
        result = evaluate_file(noisy_path, clean_path, enc_session, erb_dec_session, df_dec_session, erb_inv_fb)
        results.append(result)
        print(
            f"  SNR before {result['snr_before_db']:.2f} dB, "
            f"SNR after {result['snr_after_db']:.2f} dB, "
            f"improvement {result['snr_improvement_db']:+.2f} dB, "
            f"STOI {result['stoi']}, PESQ {result['pesq']}, "
            f"latency {result['latency_ms']:.2f} ms/frame"
        )

    if not results:
        print("No files were evaluated.")
        return

    snr_afters = [r["snr_after_db"] for r in results if np.isfinite(r["snr_after_db"])]
    snr_improvements = [r["snr_improvement_db"] for r in results if np.isfinite(r["snr_improvement_db"])]
    stoi_values = [r["stoi"] for r in results if r["stoi"] is not None]
    pesq_values = [r["pesq"] for r in results if r["pesq"] is not None]
    latency_values = [r["latency_ms"] for r in results]

    avg_snr_after = float(np.mean(snr_afters)) if snr_afters else float("nan")
    avg_snr_improvement = float(np.mean(snr_improvements)) if snr_improvements else float("nan")
    avg_stoi = float(np.mean(stoi_values)) if stoi_values else float("nan")
    avg_pesq = float(np.mean(pesq_values)) if pesq_values else float("nan")
    avg_latency = float(np.mean(latency_values)) if latency_values else float("nan")

    print()
    print("=" * 70)
    print(f"ONNX WRAPPER BATCH EVAL ({len(results)} files)")
    print("=" * 70)
    print(f"Avg SNR after:        {avg_snr_after:.2f} dB  (target >= {targets['snr_improvement_db']} dB) "
          f"-> {pass_fail(avg_snr_after, targets['snr_improvement_db'])}")
    print(f"Avg SNR improvement:  {avg_snr_improvement:+.2f} dB  (informational, no target)")
    print(f"Avg STOI:             {avg_stoi:.4f}  (target >= {targets['stoi']}) "
          f"-> {pass_fail(avg_stoi, targets['stoi'])}")
    print(f"Avg PESQ:             {avg_pesq:.3f}  (target >= {targets['pesq']}) "
          f"-> {pass_fail(avg_pesq, targets['pesq'])}")
    print(f"Avg latency:          {avg_latency:.2f} ms/frame  (target <= {targets['latency_ms']} ms) "
          f"-> {pass_fail(avg_latency, targets['latency_ms'], higher_is_better=False)}")
    print()
    print("Compare against known PyTorch-pipeline baselines:")
    print("  Zero-shot:   SNR improvement 7.75 dB, STOI 0.920, PESQ 2.394")
    print("  Fine-tuned:  SNR improvement 8.49 dB, STOI 0.920, PESQ 2.417")


if __name__ == "__main__":
    main()