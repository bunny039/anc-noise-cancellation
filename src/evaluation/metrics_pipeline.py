"""
Evaluation of the FULL pipeline (DTLN + NLMS) via src/pipeline.py's
enhance_audio_file(), as opposed to metrics.py which tests DTLN alone.

Requires the reference-mic signal produced by
data/prepare_synthetic_defence_test.py (run that first, or re-run it if
your existing data/processed/synthetic_defence_test/ has no reference/
folder - it was added after the first version of that script). Only the
synthetic_defence_test set has a reference mic; VoiceBank-DEMAND does not
and cannot be used here.

LATENCY CAVEAT: enhance_audio_file() reloads the DTLN model from disk on
every call, so every file pays the TF graph-tracing warm-up cost again
(the same one-time cost that inflated metrics.py's early latency numbers
before that script excluded it). The "avg total time per file" reported
here is informational only and NOT compared against the 30ms/frame
target - it measures reload+warmup+inference+NLMS for a single-shot call,
not steady-state streaming speed. For the real per-frame latency number,
keep using metrics.py's steady-state DTLN figure; NLMS itself (a 32-tap
adaptive filter) is computationally negligible next to the LSTM stack and
does not meaningfully change per-frame speed.

Metrics: SNR before, SNR after, SNR improvement, STOI, PESQ - same
gating logic as metrics.py (SNR after >= evaluation.targets
.snr_improvement_db is the primary pass/fail).

Writes evaluation_results_pipeline.csv.

Use --max-files 30 for a first pass - full-pipeline calls are slower per
file than metrics.py's DTLN-only loop, see latency caveat above.
"""

import argparse
import csv
import os
import sys
import time

import numpy as np
from pesq import pesq
from pystoi import stoi

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../..")
)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.evaluation.metrics import (
    load_config,
    load_audio_mono,
    compute_snr_db,
    pass_fail,
)
from src.audio.framing import frame_signal
from src.pipeline import enhance_audio_file


SYNTHETIC_DEFENCE_CLEAN_DIR = "data/processed/synthetic_defence_test/clean"
SYNTHETIC_DEFENCE_NOISY_DIR = "data/processed/synthetic_defence_test/noisy"
SYNTHETIC_DEFENCE_REFERENCE_DIR = (
    "data/processed/synthetic_defence_test/reference"
)

CHECKPOINTS = {
    "phase1_baseline":
        "models_phase1_baseline/phase1_baseline.weights.h5",

    "phase2_finetune":
        "models_phase2_finetune/phase2_finetune.weights.h5",
}


def find_matched_triplets(clean_dir, noisy_dir, reference_dir):
    if not os.path.isdir(clean_dir):
        raise FileNotFoundError(
            f"Clean directory not found:\n{clean_dir}"
        )

    if not os.path.isdir(noisy_dir):
        raise FileNotFoundError(
            f"Noisy (primary mic) directory not found:\n{noisy_dir}"
        )

    if not os.path.isdir(reference_dir):
        raise FileNotFoundError(
            f"Reference mic directory not found:\n{reference_dir}\n\n"
            f"Re-run data/prepare_synthetic_defence_test.py - the "
            f"reference/ folder is required for full-pipeline (NLMS) "
            f"evaluation."
        )

    clean_files = {
        f for f in os.listdir(clean_dir) if f.lower().endswith(".wav")
    }

    noisy_files = {
        f for f in os.listdir(noisy_dir) if f.lower().endswith(".wav")
    }

    reference_files = {
        f for f in os.listdir(reference_dir) if f.lower().endswith(".wav")
    }

    matched = sorted(clean_files & noisy_files & reference_files)

    if not matched:
        raise ValueError(
            "No matching clean/noisy/reference triplets found."
        )

    return matched


def evaluate_pipeline_checkpoint(
    checkpoint_name,
    checkpoint_path,
    filenames,
    config,
    config_path,
    clean_dir,
    noisy_dir,
    reference_dir
):

    if not os.path.isfile(checkpoint_path):
        raise FileNotFoundError(
            f"\nCheckpoint not found:\n{checkpoint_path}"
        )

    sample_rate = int(config["audio"]["sample_rate"])
    targets = config["evaluation"]["targets"]
    snr_after_target = targets["snr_improvement_db"]

    print()
    print("=" * 70)
    print(f"CHECKPOINT: {checkpoint_name} (FULL PIPELINE: DTLN + NLMS)")
    print(f"PATH: {checkpoint_path}")
    print("=" * 70)
    print(f"Files evaluated: {len(filenames)}")

    snr_before_values = []
    snr_after_values = []
    snr_improvements = []
    stoi_scores = []
    pesq_scores = []
    total_time_values = []

    stoi_failures = 0
    pesq_failures = 0

    for index, filename in enumerate(filenames, start=1):

        clean_path = os.path.join(clean_dir, filename)
        noisy_path = os.path.join(noisy_dir, filename)
        reference_path = os.path.join(reference_dir, filename)

        print()
        print(f"[{index}/{len(filenames)}] {filename}")

        try:
            clean_signal = load_audio_mono(clean_path, sample_rate)
            noisy_signal = load_audio_mono(noisy_path, sample_rate)

            frame_start = time.perf_counter()

            enhanced_signal = enhance_audio_file(
                noisy_path,
                reference_path,
                config_path=config_path,
                model_weights_path=checkpoint_path
            )

            total_elapsed = time.perf_counter() - frame_start

            frame_count = frame_signal(
                noisy_signal,
                config_path
            ).shape[0]

            n = min(
                len(clean_signal),
                len(noisy_signal),
                len(enhanced_signal)
            )

            if n <= 0:
                print("  WARNING: empty enhanced signal")
                continue

            clean_eval = clean_signal[:n]
            noisy_eval = noisy_signal[:n]
            enhanced_eval = enhanced_signal[:n]

            snr_before = compute_snr_db(clean_eval, noisy_eval)
            snr_after = compute_snr_db(clean_eval, enhanced_eval)
            snr_improvement = snr_after - snr_before

            snr_before_values.append(snr_before)
            snr_after_values.append(snr_after)
            snr_improvements.append(snr_improvement)
            total_time_values.append(total_elapsed)

            print(f"  SNR before:       {snr_before:.2f} dB")
            print(f"  SNR after:        {snr_after:.2f} dB")
            print(f"  SNR improvement:  {snr_improvement:.2f} dB")
            print(f"  Frames:           {frame_count}")
            print(
                f"  Total time (incl. model reload+warmup, "
                f"informational): {total_elapsed:.4f} sec"
            )

            try:
                stoi_value = stoi(
                    clean_eval, enhanced_eval, sample_rate, extended=False
                )
                stoi_scores.append(float(stoi_value))
                print(f"  STOI:              {stoi_value:.4f}")
            except Exception as exc:
                stoi_failures += 1
                print(f"  STOI failed: {exc}")

            try:
                pesq_value = pesq(
                    sample_rate, clean_eval, enhanced_eval, "wb"
                )
                pesq_scores.append(float(pesq_value))
                print(f"  PESQ:              {pesq_value:.3f}")
            except Exception as exc:
                pesq_failures += 1
                print(f"  PESQ failed: {exc}")

        except Exception as exc:
            print(f"  ERROR evaluating {filename}: {exc}")

    result = {
        "checkpoint": checkpoint_name,
        "num_files": len(filenames),
        "snr_before_db":
            float(np.mean(snr_before_values)) if snr_before_values else None,
        "snr_after_db":
            float(np.mean(snr_after_values)) if snr_after_values else None,
        "snr_improvement_db":
            float(np.mean(snr_improvements)) if snr_improvements else None,
        "stoi": float(np.mean(stoi_scores)) if stoi_scores else None,
        "stoi_failures": stoi_failures,
        "pesq": float(np.mean(pesq_scores)) if pesq_scores else None,
        "pesq_failures": pesq_failures,
        "avg_total_time_sec_informational":
            float(np.mean(total_time_values)) if total_time_values else None,
    }

    print()
    print("-" * 70)
    print(f"RESULT: {checkpoint_name} (FULL PIPELINE)")
    print("-" * 70)

    if result["snr_before_db"] is not None:
        print(f"SNR before:      {result['snr_before_db']:.2f} dB")

    if result["snr_after_db"] is not None:
        status = pass_fail(result["snr_after_db"], snr_after_target)
        print(
            f"SNR after:       {result['snr_after_db']:.2f} dB "
            f"(target >= {snr_after_target} dB) -> {status}"
        )

    if result["snr_improvement_db"] is not None:
        print(
            f"SNR improvement: {result['snr_improvement_db']:.2f} dB "
            f"(informational)"
        )

    if result["stoi"] is not None:
        status = pass_fail(result["stoi"], targets["stoi"])
        print(
            f"STOI: {result['stoi']:.4f} "
            f"(target >= {targets['stoi']}) -> {status}"
        )

    if result["pesq"] is not None:
        status = pass_fail(result["pesq"], targets["pesq"])
        print(
            f"PESQ: {result['pesq']:.3f} "
            f"(target >= {targets['pesq']}) -> {status}"
        )

    if result["avg_total_time_sec_informational"] is not None:
        print(
            f"Avg total time per file (informational, includes model "
            f"reload+warmup): "
            f"{result['avg_total_time_sec_informational']:.3f} sec"
        )

    if stoi_failures:
        print(f"STOI failures: {stoi_failures}")

    if pesq_failures:
        print(f"PESQ failures: {pesq_failures}")

    return result


def run_pipeline_evaluation(
    config_path="configs/config.yaml",
    max_files=None
):

    print()
    print("=" * 70)
    print("FULL PIPELINE EVALUATION (DTLN + NLMS)")
    print("=" * 70)

    config = load_config(config_path)

    filenames = find_matched_triplets(
        SYNTHETIC_DEFENCE_CLEAN_DIR,
        SYNTHETIC_DEFENCE_NOISY_DIR,
        SYNTHETIC_DEFENCE_REFERENCE_DIR
    )

    total_available = len(filenames)

    if max_files is not None:
        filenames = filenames[:max_files]

    print(f"Matched triplets: {total_available}")
    print(f"Testing {len(filenames)} files.")

    results = []

    for checkpoint_name, checkpoint_path in CHECKPOINTS.items():

        if not os.path.isfile(checkpoint_path):
            print(f"Skipping {checkpoint_name}: checkpoint not found.")
            continue

        result = evaluate_pipeline_checkpoint(
            checkpoint_name,
            checkpoint_path,
            filenames,
            config,
            config_path,
            SYNTHETIC_DEFENCE_CLEAN_DIR,
            SYNTHETIC_DEFENCE_NOISY_DIR,
            SYNTHETIC_DEFENCE_REFERENCE_DIR
        )

        results.append(result)

    if not results:
        raise FileNotFoundError("No DTLN checkpoints were found.")

    output_path = "evaluation_results_pipeline.csv"

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        for result in results:
            writer.writerow(result)

    targets = config["evaluation"]["targets"]
    snr_after_target = targets["snr_improvement_db"]

    print()
    print("=" * 70)
    print("FINAL PIPELINE SUMMARY (DTLN + NLMS)")
    print("=" * 70)

    for result in results:
        print()
        print(f"--- {result['checkpoint']} ---")

        if result["snr_before_db"] is not None:
            print(f"SNR before      : {result['snr_before_db']:.2f} dB")

        if result["snr_after_db"] is not None:
            status = pass_fail(result["snr_after_db"], snr_after_target)
            print(
                f"SNR after       : {result['snr_after_db']:.2f} dB "
                f"-> {status}"
            )

        if result["snr_improvement_db"] is not None:
            print(
                f"SNR improvement : {result['snr_improvement_db']:.2f} dB "
                f"(informational)"
            )

        if result["stoi"] is not None:
            status = pass_fail(result["stoi"], targets["stoi"])
            print(f"STOI            : {result['stoi']:.4f} -> {status}")

        if result["pesq"] is not None:
            status = pass_fail(result["pesq"], targets["pesq"])
            print(f"PESQ            : {result['pesq']:.3f} -> {status}")

        if result["stoi_failures"]:
            print(f"STOI failures   : {result['stoi_failures']}")

        if result["pesq_failures"]:
            print(f"PESQ failures   : {result['pesq_failures']}")

    print()
    print("=" * 70)
    print(f"Results saved to: {output_path}")
    print("=" * 70)

    return results


if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description=(
            "Evaluate the FULL pipeline (DTLN + NLMS) on the held-out "
            "synthetic defence-noise test set."
        )
    )

    parser.add_argument(
        "--max-files",
        type=int,
        default=None,
        help="Evaluate only the first N triplets."
    )

    parser.add_argument(
        "--config",
        default="configs/config.yaml",
        help="Path to config.yaml."
    )

    args = parser.parse_args()

    run_pipeline_evaluation(
        config_path=args.config,
        max_files=args.max_files
    )