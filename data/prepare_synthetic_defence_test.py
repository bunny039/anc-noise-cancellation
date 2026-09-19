"""
Builds a held-out defence-noise test set that neither Phase 1 nor Phase 2
has ever seen during training.

Uses data/raw/clean_testset_wav (the official VoiceBank-DEMAND test
speakers, never used in any training phase) as the clean speech source,
mixed fresh with defence noise clips from configs/config.yaml's
datasets.synthetic_test.defence_noise_dir at random SNR levels from
datasets.synthetic.snr_levels_db.

This is intentionally separate from data/prepare_dataset.py's
build_synthetic_defence_set(), which produced the TRAINING synthetic set
already consumed by Phase 2 fine-tuning. Do not evaluate Phase 2 against
that training set; it is data leakage.

TRAIN/TEST NOISE SEPARATION: the noise source pool used here
(datasets.synthetic_test.defence_noise_dir) MUST be a disjoint set of
files from datasets.synthetic.defence_noise_dir (used by
build_synthetic_defence_set()). An earlier version of this project used
the SAME config key (datasets.synthetic.defence_noise_dir) for both
training and test noise sourcing - confirmed via direct file-list
comparison that all 29 noise clips were shared between train and test,
meaning every prior evaluation on this test set measured partial
memorization, not generalization. Fixed by splitting the original 29
clips into data/raw/defence_noise_train and data/raw/defence_noise_test
(see data/split_defence_noise.py) and reading from the test-only pool
here via a separate config section.

Produces THREE outputs per file, simulating a dual-mic headset capture:
- clean/    ground truth speech, amplitude-consistent with what is
            actually embedded in noisy/ (see clipping note below)
- noisy/    primary mic: clean speech + defence noise (this is what a
            single-mic system, or DTLN alone, would receive)
- reference/ reference mic: the same noise instance used in noisy/, with
            no speech - this is what NLMS needs to cancel correlated
            ambient noise. Idealized (zero speech leakage into the
            reference channel); real hardware will have imperfect
            isolation, flagged for the Raspberry Pi migration doc later.

Clipping note: when clean+noise would exceed +/-1.0, the mix is scaled
down to fit. The clean file saved to disk is scaled by the SAME factor
so it stays numerically consistent with the speech actually present in
noisy/ (noisy == clean + reference, always, exactly). An earlier version
of this script did not apply this correction to the saved clean file,
which would have biased SNR measurements on any file where clipping
triggered - this version fixes that.

Output: data/processed/synthetic_defence_test/{clean,noisy,reference},
plus a mix_log.csv recording noise category, SNR level, and whether
clipping/rescaling occurred per file.

Accepted noise file extensions: wav, flac, mp3, ogg, aiff, aif.

COMMIT NOTE: commit after confirming the output file counts, that a
couple of the noisy files sound like real mixed audio, that reference
files sound like noise-only (no audible speech), and that mix_log.csv's
noise_file column contains ZERO overlap with the training noise pool
(data/raw/defence_noise_train).
"""

import argparse
import csv
import os
import random

import librosa
import numpy as np
import soundfile as sf
import yaml


ALLOWED_NOISE_EXTENSIONS = {
    ".wav", ".flac", ".mp3", ".ogg", ".aiff", ".aif"
}

CLEAN_SOURCE_DIR = "data/raw/clean_testset_wav"
OUTPUT_DIR = "data/processed/synthetic_defence_test"


def load_config(config_path="configs/config.yaml"):
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    if "audio" not in config or "sample_rate" not in config["audio"]:
        raise KeyError(
            "configs/config.yaml is missing audio.sample_rate."
        )

    if "datasets" not in config or "synthetic" not in config["datasets"]:
        raise KeyError(
            "configs/config.yaml is missing datasets.synthetic."
        )

    synth_cfg = config["datasets"]["synthetic"]

    if "snr_levels_db" not in synth_cfg:
        raise KeyError(
            "configs/config.yaml is missing "
            "datasets.synthetic.snr_levels_db."
        )

    if "synthetic_test" not in config["datasets"]:
        raise KeyError(
            "configs/config.yaml is missing datasets.synthetic_test. "
            "This section must point to a noise pool DISJOINT from "
            "datasets.synthetic.defence_noise_dir, or the test set will "
            "leak training noise clips again."
        )

    test_cfg = config["datasets"]["synthetic_test"]

    if "defence_noise_dir" not in test_cfg:
        raise KeyError(
            "configs/config.yaml is missing "
            "datasets.synthetic_test.defence_noise_dir."
        )

    return config


def discover_noise_files(defence_noise_dir):
    if not os.path.isdir(defence_noise_dir):
        raise FileNotFoundError(
            f"Defence noise directory not found:\n{defence_noise_dir}"
        )

    index = []

    for category in sorted(os.listdir(defence_noise_dir)):
        category_path = os.path.join(defence_noise_dir, category)

        if not os.path.isdir(category_path):
            continue

        for fname in sorted(os.listdir(category_path)):
            ext = os.path.splitext(fname)[1].lower()

            if ext in ALLOWED_NOISE_EXTENSIONS:
                index.append(
                    (category, os.path.join(category_path, fname))
                )

    if not index:
        raise FileNotFoundError(
            f"No noise files with extensions "
            f"{sorted(ALLOWED_NOISE_EXTENSIONS)} found under "
            f"{defence_noise_dir}"
        )

    return index


def load_noise_audio(path, target_sample_rate):
    signal, _ = librosa.load(
        path,
        sr=target_sample_rate,
        mono=True
    )

    return signal.astype(np.float32)


def fit_noise_length(noise, target_len, rng):
    if len(noise) == 0:
        return np.zeros(target_len, dtype=np.float32)

    if len(noise) >= target_len:
        max_start = len(noise) - target_len
        start = rng.randint(0, max_start) if max_start > 0 else 0
        return noise[start:start + target_len]

    repeats = int(np.ceil(target_len / len(noise)))
    tiled = np.tile(noise, repeats)

    max_start = len(tiled) - target_len
    start = rng.randint(0, max_start) if max_start > 0 else 0

    return tiled[start:start + target_len]


def mix_at_snr(clean, noise, snr_db):
    """
    Returns (primary_mic_signal, reference_mic_signal, clean_for_saving).

    primary_mic_signal == clean_for_saving + reference_mic_signal, exactly,
    even when peak normalization triggers - this keeps the saved clean
    file numerically consistent with the speech actually embedded in the
    noisy file.
    """

    signal_power = np.mean(clean.astype(np.float64) ** 2)
    noise_power = np.mean(noise.astype(np.float64) ** 2)

    if noise_power < 1e-12:
        return (
            clean.copy(),
            np.zeros_like(clean),
            clean.copy()
        )

    target_noise_power = signal_power / (10.0 ** (snr_db / 10.0))
    scale = np.sqrt(target_noise_power / noise_power)

    scaled_noise = scale * noise.astype(np.float64)
    scaled_clean = clean.astype(np.float64)

    mixed = scaled_clean + scaled_noise

    peak = np.max(np.abs(mixed))

    clipped = False

    if peak > 1.0:
        norm = 1.0 / peak
        mixed = mixed * norm
        scaled_noise = scaled_noise * norm
        scaled_clean = scaled_clean * norm
        clipped = True

    return (
        mixed.astype(np.float32),
        scaled_noise.astype(np.float32),
        scaled_clean.astype(np.float32)
    ), clipped


def build_synthetic_defence_test_set(
    config,
    max_files=None,
    seed=42
):
    sample_rate = int(config["audio"]["sample_rate"])
    synth_cfg = config["datasets"]["synthetic"]
    test_cfg = config["datasets"]["synthetic_test"]
    defence_noise_dir = test_cfg["defence_noise_dir"]
    snr_levels_db = synth_cfg["snr_levels_db"]

    if not os.path.isdir(CLEAN_SOURCE_DIR):
        raise FileNotFoundError(
            f"Clean test source directory not found:\n{CLEAN_SOURCE_DIR}"
        )

    clean_output_dir = os.path.join(OUTPUT_DIR, "clean")
    noisy_output_dir = os.path.join(OUTPUT_DIR, "noisy")
    reference_output_dir = os.path.join(OUTPUT_DIR, "reference")

    os.makedirs(clean_output_dir, exist_ok=True)
    os.makedirs(noisy_output_dir, exist_ok=True)
    os.makedirs(reference_output_dir, exist_ok=True)

    noise_index = discover_noise_files(defence_noise_dir)

    print(
        f"Discovered {len(noise_index)} noise clips across "
        f"{len(set(c for c, _ in noise_index))} categories "
        f"(from {defence_noise_dir})."
    )

    clean_filenames = sorted(
        f for f in os.listdir(CLEAN_SOURCE_DIR)
        if f.lower().endswith(".wav")
    )

    if not clean_filenames:
        raise FileNotFoundError(
            f"No .wav files found in {CLEAN_SOURCE_DIR}"
        )

    if max_files is not None:
        clean_filenames = clean_filenames[:max_files]

    rng = random.Random(seed)

    log_rows = []
    clipped_count = 0

    print(f"Generating {len(clean_filenames)} held-out test mixes...")

    for index, filename in enumerate(clean_filenames, start=1):

        clean_path = os.path.join(CLEAN_SOURCE_DIR, filename)

        clean_signal, source_sr = sf.read(clean_path, dtype="float32")

        if clean_signal.ndim > 1:
            clean_signal = np.mean(clean_signal, axis=1)

        if source_sr != sample_rate:
            clean_signal = librosa.resample(
                clean_signal,
                orig_sr=source_sr,
                target_sr=sample_rate
            )

        clean_signal = clean_signal.astype(np.float32)

        category, noise_path = rng.choice(noise_index)

        noise_signal = load_noise_audio(noise_path, sample_rate)
        noise_signal = fit_noise_length(
            noise_signal,
            len(clean_signal),
            rng
        )

        snr_db = rng.choice(snr_levels_db)

        (primary_signal, reference_signal, clean_to_save), clipped = (
            mix_at_snr(clean_signal, noise_signal, snr_db)
        )

        if clipped:
            clipped_count += 1

        sf.write(
            os.path.join(clean_output_dir, filename),
            clean_to_save,
            sample_rate
        )

        sf.write(
            os.path.join(noisy_output_dir, filename),
            primary_signal,
            sample_rate
        )

        sf.write(
            os.path.join(reference_output_dir, filename),
            reference_signal,
            sample_rate
        )

        log_rows.append({
            "filename": filename,
            "noise_category": category,
            "noise_file": os.path.basename(noise_path),
            "snr_db": snr_db,
            "clipped": clipped,
        })

        if index % 50 == 0 or index == len(clean_filenames):
            print(f"  {index}/{len(clean_filenames)} done")

    log_path = os.path.join(OUTPUT_DIR, "mix_log.csv")

    with open(log_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(log_rows[0].keys()))
        writer.writeheader()
        for row in log_rows:
            writer.writerow(row)

    print()
    print(f"Done. {len(log_rows)} mixed pairs written to:")
    print(f"  {clean_output_dir}")
    print(f"  {noisy_output_dir}")
    print(f"  {reference_output_dir}")
    print(f"Mix log: {log_path}")
    print(
        f"Peak-normalization (clipping) triggered on "
        f"{clipped_count}/{len(log_rows)} files."
    )


if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description=(
            "Build a held-out synthetic defence-noise test set from "
            "the official VoiceBank-DEMAND test speakers."
        )
    )

    parser.add_argument(
        "--max-files",
        type=int,
        default=None,
        help="Generate only the first N clean test files."
    )

    parser.add_argument(
        "--config",
        default="configs/config.yaml",
        help="Path to config.yaml."
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducible noise/SNR selection."
    )

    args = parser.parse_args()

    config = load_config(args.config)

    build_synthetic_defence_test_set(
        config,
        max_files=args.max_files,
        seed=args.seed
    )