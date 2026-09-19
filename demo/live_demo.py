"""
Live/file demo for the DeepFilterNet3 (+ optional NLMS) pipeline: runs a
primary+reference-mic recording through src/pipeline.py's
enhance_audio_file, then reports SNR before/after, STOI, PESQ, and
end-to-end latency, each labeled PASS/FAIL against configs/config.yaml's
evaluation.targets.

MODEL CHANGE NOTE: originally built for DTLN, now runs DeepFilterNet3
(pretrained, vendored in external/DeepFilterNet3/). enhance_audio_file's
function name/signature is unchanged, only what it does internally
changed - see src/pipeline.py.

NLMS FLAG: --nlms controls whether apply_nlms runs after the model stage.
Defaults to OFF. Confirmed via real 20-file eval: with an identical
primary/reference signal (no physical second mic exists yet), NLMS
actively destroys quality DeepFilterNet3 already provides (full pipeline
SNR improvement -2.48dB vs DeepFilterNet3-alone +11.93dB on the same
data). --nlms is exposed so this can be re-tested directly, side-by-side,
whenever a different step_size or a real second mic is available - not
because it is expected to help by default.

Two input modes:
- File mode (default, reliable): --primary, --reference, --clean wav paths.
  All four metrics are computed since a clean reference signal exists.
- Mic mode (--mic, secondary fallback): captures ONE live channel from the
  laptop's default input device. LIMITATION, flagging again: this project
  has NO physical second (reference) microphone yet, so mic mode feeds a
  SILENT (all-zero) reference signal - not an identical copy of the
  primary. A silent reference makes NLMS a safe no-op (predicted_noise is
  always zero, so output equals the model-stage output exactly) rather
  than the harmful identical-reference case measured above. Mic mode has
  no clean reference signal either, so SNR/STOI/PESQ cannot be computed -
  only before/after audio and a waveform/spectrogram comparison are
  produced. This gets fixed once real dual-mic hardware exists.

Output, per run:
- <name>_enhanced.wav      - enhanced audio alone
- <name>_before_after.wav  - before audio, a short silence gap, then after
  audio, concatenated into ONE file - so a judge can hit play once and
  hear the noisy input followed immediately by the cleaned output, no
  file-switching needed during a live demo.
- <name>_comparison.png    - before/after waveform + spectrogram, for the PPT.

COMMIT NOTE: commit once run successfully end-to-end on a real
synthetic_defence_test triplet and both audio outputs sound correct -
not before.

ADDITION (2026-09-02): added --onnx flag. When set, both file mode and
mic mode call src/pipeline.py's ONNX chunked path (enhance_audio_file_onnx
/ enhance_onnx_stage) instead of the torch DeepFilterNet3 path - this is
the path with no Rust/torch dependency, meant to run on the Pi. --chunk-
seconds controls the buffer size each ONNX call processes independently
(GRU state resets at each chunk boundary - see src/df_onnx_dsp.py's
enhance_chunked ADDITION note). --onnx-dir points at the folder holding
enc.onnx/erb_dec.onnx/df_dec.onnx (default models/onnx_export).
"""

import argparse
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
import yaml
from pesq import pesq
from pystoi import stoi

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.pipeline import enhance_audio_file, enhance_dtln_stage, enhance_audio_file_onnx, enhance_onnx_stage
from src.audio.io import load_audio_file
from src.audio.framing import frame_signal
from src.model.nlms import apply_nlms


OUTPUT_DIR = "demo/output"
GAP_SECONDS = 0.75


def load_config(config_path):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def compute_snr_db(clean, estimate):
    min_len = min(len(clean), len(estimate))
    clean = clean[:min_len]
    estimate = estimate[:min_len]
    noise = clean - estimate
    signal_power = np.sum(clean ** 2)
    noise_power = np.sum(noise ** 2)
    if noise_power == 0:
        return float("inf")
    return 10 * np.log10(signal_power / noise_power)


def pass_fail(value, target, higher_is_better=True):
    if higher_is_better:
        return "PASS" if value >= target else "FAIL"
    return "PASS" if value <= target else "FAIL"


def count_frames(signal, config_path):
    frames = frame_signal(signal, config_path)
    return frames.shape[0]


def build_before_after_audio(before_signal, after_signal, sample_rate, gap_seconds=GAP_SECONDS):
    before_signal = np.asarray(before_signal, dtype=np.float64)
    after_signal = np.asarray(after_signal, dtype=np.float64)

    combined_peak = max(
        np.max(np.abs(before_signal)) if len(before_signal) > 0 else 0.0,
        np.max(np.abs(after_signal)) if len(after_signal) > 0 else 0.0,
        1e-9,
    )
    norm = 0.95 / combined_peak

    before_normalized = (before_signal * norm).astype(np.float32)
    after_normalized = (after_signal * norm).astype(np.float32)

    gap = np.zeros(int(gap_seconds * sample_rate), dtype=np.float32)

    return np.concatenate([before_normalized, gap, after_normalized])


def compute_metrics(clean, noisy, enhanced, sample_rate, elapsed_seconds, num_frames, targets):
    n = min(len(clean), len(noisy), len(enhanced))
    clean = clean[:n]
    noisy = noisy[:n]
    enhanced = enhanced[:n]

    snr_before = compute_snr_db(clean, noisy)
    snr_after = compute_snr_db(clean, enhanced)
    snr_improvement = snr_after - snr_before

    try:
        stoi_value = float(stoi(clean, enhanced, sample_rate, extended=False))
    except Exception as exc:
        stoi_value = None
        print(f"  STOI failed: {exc}")

    try:
        pesq_value = float(pesq(sample_rate, clean, enhanced, "wb"))
    except Exception as exc:
        pesq_value = None
        print(f"  PESQ failed: {exc}")

    latency_ms = (elapsed_seconds / num_frames) * 1000.0 if num_frames > 0 else None

    print()
    print("=" * 70)
    print("LIVE DEMO RESULT")
    print("=" * 70)
    print(f"SNR before:      {snr_before:.2f} dB")
    print(f"SNR after:       {snr_after:.2f} dB  (target >= {targets['snr_improvement_db']} dB) "
          f"-> {pass_fail(snr_after, targets['snr_improvement_db'])}")
    print(f"SNR improvement: {snr_improvement:+.2f} dB  (informational, no target)")

    if stoi_value is not None:
        print(f"STOI:            {stoi_value:.4f}  (target >= {targets['stoi']}) "
              f"-> {pass_fail(stoi_value, targets['stoi'])}")
    else:
        print("STOI:            N/A")

    if pesq_value is not None:
        print(f"PESQ:            {pesq_value:.3f}  (target >= {targets['pesq']}) "
              f"-> {pass_fail(pesq_value, targets['pesq'])}")
    else:
        print("PESQ:            N/A")

    if latency_ms is not None:
        print(f"Latency:         {latency_ms:.2f} ms/frame  (target <= {targets['latency_ms']} ms) "
              f"-> {pass_fail(latency_ms, targets['latency_ms'], higher_is_better=False)}")
        print("  NOTE: total end-to-end time divided by frame count, a single-run")
        print("  approximation - not a certified latency figure.")
    else:
        print("Latency:         N/A")

    return {
        "snr_before_db": snr_before,
        "snr_after_db": snr_after,
        "snr_improvement_db": snr_improvement,
        "stoi": stoi_value,
        "pesq": pesq_value,
        "latency_ms": latency_ms,
    }


def save_comparison_plot(before_signal, after_signal, sample_rate, output_path,
                          before_label="Before", after_label="After"):
    n = min(len(before_signal), len(after_signal))
    t = np.arange(n) / sample_rate

    fig, axes = plt.subplots(2, 2, figsize=(12, 6))

    axes[0, 0].plot(t, before_signal[:n], linewidth=0.5)
    axes[0, 0].set_title(before_label)
    axes[0, 0].set_xlabel("Time (s)")

    axes[0, 1].plot(t, after_signal[:n], linewidth=0.5, color="green")
    axes[0, 1].set_title(after_label)
    axes[0, 1].set_xlabel("Time (s)")

    axes[1, 0].specgram(before_signal[:n], Fs=sample_rate)
    axes[1, 0].set_title(f"{before_label} - spectrogram")

    axes[1, 1].specgram(after_signal[:n], Fs=sample_rate)
    axes[1, 1].set_title(f"{after_label} - spectrogram")

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def run_file_mode(args, config, config_path):
    sample_rate = int(config["audio"]["sample_rate"])
    targets = config["evaluation"]["targets"]
    has_clean = args.clean is not None

    print(f"Primary (noisy):       {args.primary}")
    print(f"Reference:              {args.reference}")
    print(f"Clean (ground truth):  {args.clean if has_clean else 'NOT PROVIDED - metrics skipped'}")
    print(f"NLMS:                  {'ON' if args.nlms else 'OFF'}")
    print(f"Engine:                {'ONNX (chunked)' if args.onnx else 'PyTorch DeepFilterNet3'}")
    if args.onnx:
        print(f"Chunk size:             {args.chunk_seconds}s")
    print()
    print("Loading model and running pipeline...")

    start = time.perf_counter()
    if args.onnx:
        enhanced = enhance_audio_file_onnx(args.primary, args.reference, config_path=config_path,
                                            onnx_dir=args.onnx_dir, chunk_seconds=args.chunk_seconds,
                                            use_nlms=args.nlms)
    else:
        enhanced = enhance_audio_file(args.primary, args.reference, config_path=config_path,
                                       use_nlms=args.nlms)
    elapsed = time.perf_counter() - start

    noisy_signal = load_audio_file(args.primary, config_path)
    num_frames = count_frames(noisy_signal, config_path)

    metrics = None
    if has_clean:
        clean_signal = load_audio_file(args.clean, config_path)
        metrics = compute_metrics(clean_signal, noisy_signal, enhanced, sample_rate,
                                   elapsed, num_frames, targets)
    else:
        latency_ms = (elapsed / num_frames) * 1000.0 if num_frames > 0 else None
        print()
        print("=" * 70)
        print("LIVE DEMO RESULT (no clean reference - SNR/STOI/PESQ skipped)")
        print("=" * 70)
        if latency_ms is not None:
            print(f"Latency: {latency_ms:.2f} ms/frame  (target <= {targets['latency_ms']} ms) "
                  f"-> {pass_fail(latency_ms, targets['latency_ms'], higher_is_better=False)}")
        print("Listen to the before/after file to judge quality directly.")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    base = os.path.splitext(os.path.basename(args.primary))[0]
    suffix = "_nlms" if args.nlms else ""
    suffix += "_onnx" if args.onnx else ""

    enhanced_path = os.path.join(OUTPUT_DIR, f"{base}_enhanced{suffix}.wav")
    sf.write(enhanced_path, enhanced, sample_rate)
    print(f"\nEnhanced audio saved to: {enhanced_path}")

    before_after_audio = build_before_after_audio(noisy_signal, enhanced, sample_rate)
    before_after_path = os.path.join(OUTPUT_DIR, f"{base}_before_after{suffix}.wav")
    sf.write(before_after_path, before_after_audio, sample_rate)
    print(f"Before/after audio (one file, before then after) saved to: {before_after_path}")

    plot_path = os.path.join(OUTPUT_DIR, f"{base}_comparison{suffix}.png")
    save_comparison_plot(noisy_signal, enhanced, sample_rate, plot_path,
                          before_label="Before (noisy)", after_label="After (enhanced)")
    print(f"Before/after comparison plot saved to: {plot_path}")

    return metrics


def run_mic_mode(args, config, config_path):
    import sounddevice as sd

    sample_rate = int(config["audio"]["sample_rate"])

    print("=" * 70)
    print("MIC MODE - single mic, silent reference (no physical second mic yet)")
    print(f"NLMS: {'ON (no-op with a silent reference)' if args.nlms else 'OFF'}")
    print(f"Engine: {'ONNX (chunked)' if args.onnx else 'PyTorch DeepFilterNet3'}")
    print("No clean reference exists for live speech, so SNR/STOI/PESQ are")
    print("not shown here - only before/after audio and waveform.")
    print("=" * 70)

    duration_seconds = args.duration
    print(f"\nRecording {duration_seconds}s from the default input device...")
    recording = sd.rec(int(duration_seconds * sample_rate), samplerate=sample_rate,
                        channels=1, dtype="float32")
    sd.wait()
    primary_signal = recording[:, 0]
    reference_signal = np.zeros_like(primary_signal)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    raw_path = os.path.join(OUTPUT_DIR, "mic_input.wav")
    sf.write(raw_path, primary_signal, sample_rate)

    ref_path = os.path.join(OUTPUT_DIR, "mic_reference_silence.wav")
    sf.write(ref_path, reference_signal, sample_rate)

    print("Running model stage...")
    if args.onnx:
        model_output, _ = enhance_onnx_stage(raw_path, ref_path, config_path=config_path,
                                              onnx_dir=args.onnx_dir, chunk_seconds=args.chunk_seconds)
    else:
        model_output, _ = enhance_dtln_stage(raw_path, ref_path, config_path=config_path)
    enhanced = apply_nlms(model_output, reference_signal) if args.nlms else model_output

    enhanced_path = os.path.join(OUTPUT_DIR, "mic_enhanced.wav")
    sf.write(enhanced_path, enhanced, sample_rate)
    print(f"Enhanced audio saved to: {enhanced_path}")

    before_after_audio = build_before_after_audio(primary_signal, enhanced, sample_rate)
    before_after_path = os.path.join(OUTPUT_DIR, "mic_before_after.wav")
    sf.write(before_after_path, before_after_audio, sample_rate)
    print(f"Before/after audio (one file, before then after) saved to: {before_after_path}")

    plot_path = os.path.join(OUTPUT_DIR, "mic_comparison.png")
    save_comparison_plot(primary_signal, enhanced, sample_rate, plot_path,
                          before_label="Before (raw mic)", after_label="After (enhanced)")
    print(f"Before/after comparison plot saved to: {plot_path}")

    print("\nPlaying back before/after audio...")
    sd.play(before_after_audio, sample_rate)
    sd.wait()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Live/file demo for the DeepFilterNet3 (+ optional NLMS) pipeline."
    )
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--mic", action="store_true",
                         help="Use live mic capture instead of file input "
                              "(secondary fallback - see module docstring).")
    parser.add_argument("--nlms", action="store_true",
                         help="Run NLMS after the model stage. OFF by default - "
                              "see module docstring for why.")
    parser.add_argument("--onnx", action="store_true",
                         help="Use the ONNX chunked wrapper (src/df_onnx_dsp.py) instead "
                              "of the torch DeepFilterNet3 path. This is the Pi-deployment "
                              "engine - no Rust/torch dependency.")
    parser.add_argument("--onnx-dir", default="models/onnx_export",
                         help="Folder containing enc.onnx/erb_dec.onnx/df_dec.onnx "
                              "(--onnx mode only).")
    parser.add_argument("--chunk-seconds", type=float, default=2.0,
                         help="Chunk size in seconds for --onnx mode. GRU state resets "
                              "at each chunk boundary.")
    parser.add_argument("--primary", default=None,
                         help="Path to noisy primary-mic wav file (file mode).")
    parser.add_argument("--reference", default=None,
                         help="Path to reference-mic wav file (file mode). With no "
                              "real second mic yet, pass the SAME path as --primary.")
    parser.add_argument("--clean", default=None,
                         help="Path to clean ground-truth wav file (file mode, "
                              "required for SNR/STOI/PESQ).")
    parser.add_argument("--duration", type=float, default=5.0,
                         help="Recording duration in seconds (mic mode only).")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.mic:
        run_mic_mode(args, config, args.config)
    else:
        if not (args.primary and args.reference):
            parser.error("File mode requires at least --primary and --reference. "
                          "--clean is optional (adds SNR/STOI/PESQ if a real ground-truth "
                          "file exists). Use --mic for the live capture fallback.")
        run_file_mode(args, config, args.config)