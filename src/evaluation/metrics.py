"""
Evaluation script: runs enhance_audio_file() from src/pipeline.py over a
folder of clean/noisy pairs and reports SNR improvement, STOI, and PESQ
against the targets in configs/config.yaml (evaluation.targets).

FLAG (important, affects how to read these numbers): enhance_audio_file()
takes a primary_mic_path AND reference_mic_path. Since you do not have real
dual-mic recordings yet, this script passes the SAME noisy file as both.
NLMS uses the reference mic to cancel noise correlated between the two
mics - with an identical reference, there is no independent noise signal
for NLMS to subtract, so NLMS will do close to nothing here (best case) or
mildly distort the signal (worst case). Any SNR/STOI/PESQ number below
therefore reflects mostly the DeepFilterNet3 stage, not a true dual-mic
NLMS benefit. This is expected at the current (single-mic, no hardware)
prototype stage - not a bug - but do not present these numbers as proof
NLMS works until you have two genuinely different mic signals to test with.

Expects data/processed/synthetic_defence_test/clean/<name>.wav and
data/processed/synthetic_defence_test/noisy/<name>.wav to have matching
filenames, matching the structure already confirmed on disk.

COMMIT NOTE: initial metrics.py, replaces STUB. Computes SNR improvement,
STOI, PESQ over the synthetic test set using the DeepFilterNet3 pipeline.
"""

import glob
import os

import numpy as np
import yaml
from pesq import pesq
from pystoi import stoi

from src.audio.io import load_audio_file
from src.pipeline import enhance_audio_file


def _snr_db(clean, estimate):
    min_len = min(len(clean), len(estimate))
    clean = clean[:min_len]
    estimate = estimate[:min_len]
    noise = clean - estimate
    signal_power = np.sum(clean ** 2)
    noise_power = np.sum(noise ** 2)
    if noise_power == 0:
        return float("inf")
    return 10 * np.log10(signal_power / noise_power)


def _load_targets(config_path):
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)
    return config["evaluation"]["targets"], int(config["audio"]["sample_rate"])


def evaluate_test_set(
    clean_dir: str = "data/processed/synthetic_defence_test/clean",
    noisy_dir: str = "data/processed/synthetic_defence_test/noisy",
    config_path: str = "configs/config.yaml",
    max_files: int = None,
):
    targets, sample_rate = _load_targets(config_path)
    noisy_files = sorted(glob.glob(os.path.join(noisy_dir, "*.wav")))
    if max_files is not None:
        noisy_files = noisy_files[:max_files]

    if len(noisy_files) == 0:
        raise FileNotFoundError(f"No .wav files found in {noisy_dir}")

    snr_before_list = []
    snr_after_list = []
    stoi_list = []
    pesq_list = []
    skipped = []

    for noisy_path in noisy_files:
        filename = os.path.basename(noisy_path)
        clean_path = os.path.join(clean_dir, filename)

        if not os.path.isfile(clean_path):
            skipped.append(filename)
            continue

        clean_signal = load_audio_file(clean_path, config_path)
        noisy_signal = load_audio_file(noisy_path, config_path)

        try:
            enhanced_signal = enhance_audio_file(noisy_path, noisy_path, config_path)
        except Exception as exc:
            print(f"SKIP {filename}: enhancement failed: {exc}")
            skipped.append(filename)
            continue

        min_len = min(len(clean_signal), len(noisy_signal), len(enhanced_signal))
        clean_signal = clean_signal[:min_len]
        noisy_signal = noisy_signal[:min_len]
        enhanced_signal = enhanced_signal[:min_len]

        snr_before = _snr_db(clean_signal, noisy_signal)
        snr_after = _snr_db(clean_signal, enhanced_signal)
        stoi_score = stoi(clean_signal, enhanced_signal, sample_rate, extended=False)
        pesq_score = pesq(sample_rate, clean_signal, enhanced_signal, "wb")

        snr_before_list.append(snr_before)
        snr_after_list.append(snr_after)
        stoi_list.append(stoi_score)
        pesq_list.append(pesq_score)

        print(f"{filename}: SNR {snr_before:.2f} -> {snr_after:.2f} dB "
              f"(+{snr_after - snr_before:.2f}), STOI {stoi_score:.3f}, PESQ {pesq_score:.3f}")

    if skipped:
        print(f"\nSkipped {len(skipped)} file(s) (no clean match or enhancement error): {skipped}")

    if len(snr_after_list) == 0:
        raise RuntimeError("No files were successfully evaluated")

    mean_snr_improvement = float(np.mean([a - b for a, b in zip(snr_after_list, snr_before_list)]))
    mean_stoi = float(np.mean(stoi_list))
    mean_pesq = float(np.mean(pesq_list))

    print("\n--- Summary ---")
    print(f"Files evaluated: {len(snr_after_list)}")
    print(f"Mean SNR improvement: {mean_snr_improvement:.2f} dB (target: {targets['snr_improvement_db']})")
    print(f"Mean STOI: {mean_stoi:.3f} (target: {targets['stoi']})")
    print(f"Mean PESQ: {mean_pesq:.3f} (target: {targets['pesq']})")

    return {
        "mean_snr_improvement_db": mean_snr_improvement,
        "mean_stoi": mean_stoi,
        "mean_pesq": mean_pesq,
        "num_files": len(snr_after_list),
        "skipped": skipped,
    }


if __name__ == "__main__":
    evaluate_test_set(max_files=20)