"""
Dataset preparation: verifies the manually-downloaded VoiceBank-DEMAND set
and builds synthetic defence-noise mixtures (clean speech + freesound
defence-noise clips) at the SNR levels in configs/config.yaml. Everything
is resampled to config sample_rate once, here, so every downstream file
gets consistently-rate audio.

COMMIT NOTE: commit once this has been run against your real data/raw/ and
you've spot-checked a few files in data/processed/synthetic/ by ear - this
is the first file that touches your actual downloaded data, not just
synthetic self-tests.
"""

import os
import numpy as np
import soundfile as sf
import librosa
import yaml


def _load_config(config_path="configs/config.yaml"):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def _load_mono(path, target_sample_rate):
    audio, sample_rate = sf.read(path, dtype="float32")
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    if sample_rate != target_sample_rate:
        audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=target_sample_rate)
    return audio.astype(np.float32)


def verify_voicebank_demand(config_path="configs/config.yaml"):
    config = _load_config(config_path)
    vb = config["datasets"]["voicebank_demand"]

    required_dirs = [vb["clean_train_dir"], vb["noisy_train_dir"],
                      vb["clean_test_dir"], vb["noisy_test_dir"]]
    for directory in required_dirs:
        if not os.path.isdir(directory):
            raise FileNotFoundError(
                f"VoiceBank-DEMAND folder not found: {directory}. Download "
                f"from https://datashare.ed.ac.uk/handle/10283/2791 and "
                f"place it there before running this script."
            )

    clean_train_files = set(os.listdir(vb["clean_train_dir"]))
    noisy_train_files = set(os.listdir(vb["noisy_train_dir"]))
    if clean_train_files != noisy_train_files:
        raise ValueError(
            f"Train filenames mismatch between clean and noisy folders. "
            f"In clean only: {len(clean_train_files - noisy_train_files)}, "
            f"in noisy only: {len(noisy_train_files - clean_train_files)}."
        )

    clean_test_files = set(os.listdir(vb["clean_test_dir"]))
    noisy_test_files = set(os.listdir(vb["noisy_test_dir"]))
    if clean_test_files != noisy_test_files:
        raise ValueError("Test filenames mismatch between clean and noisy folders.")

    print(f"VoiceBank-DEMAND verified: {len(clean_train_files)} train pairs, "
          f"{len(clean_test_files)} test pairs.")
    return sorted(clean_train_files), sorted(clean_test_files)


def _mix_at_snr(clean, noise, snr_db):
    if len(noise) < len(clean):
        noise = np.tile(noise, int(np.ceil(len(clean) / len(noise))))
    noise = noise[:len(clean)]

    clean_power = np.mean(clean ** 2)
    noise_power = np.mean(noise ** 2)
    if noise_power == 0:
        raise ValueError("Noise clip is silent, cannot compute SNR mix")

    target_noise_power = clean_power / (10 ** (snr_db / 10))
    scale = np.sqrt(target_noise_power / noise_power)
    return clean + scale * noise


def build_synthetic_defence_set(clean_filenames, config_path="configs/config.yaml"):
    config = _load_config(config_path)
    sample_rate = config["audio"]["sample_rate"]
    vb = config["datasets"]["voicebank_demand"]
    syn = config["datasets"]["synthetic"]

    defence_noise_dir = syn["defence_noise_dir"]
    output_dir = syn["output_dir"]
    snr_levels = syn["snr_levels_db"]
    max_files = syn.get("max_files")

    if not os.path.isdir(defence_noise_dir):
        raise FileNotFoundError(f"Defence noise folder not found: {defence_noise_dir}")

    categories = [d for d in os.listdir(defence_noise_dir)
                  if os.path.isdir(os.path.join(defence_noise_dir, d))]
    if not categories:
        raise FileNotFoundError(f"No noise category subfolders found in {defence_noise_dir}")

    noise_clips_by_category = {}
    for category in categories:
        category_dir = os.path.join(defence_noise_dir, category)
        clip_paths = [os.path.join(category_dir, f) for f in os.listdir(category_dir)
                      if f.lower().endswith((".wav", ".flac", ".mp3", ".ogg",".aiff", ".aif"))]
        if not clip_paths:
            raise FileNotFoundError(f"No audio clips found in {category_dir}")
        noise_clips_by_category[category] = clip_paths

    print(f"Found {len(categories)} defence noise categories: {categories}")

    clean_output_dir = os.path.join(output_dir, "clean")
    noisy_output_dir = os.path.join(output_dir, "noisy")
    os.makedirs(clean_output_dir, exist_ok=True)
    os.makedirs(noisy_output_dir, exist_ok=True)

    if max_files is not None:
        clean_filenames = clean_filenames[:max_files]

    rng = np.random.default_rng(0)
    mixture_count = 0

    for filename in clean_filenames:
        clean_path = os.path.join(vb["clean_train_dir"], filename)
        clean_audio = _load_mono(clean_path, sample_rate)

        category = rng.choice(categories)
        noise_path = rng.choice(noise_clips_by_category[category])
        noise_audio = _load_mono(noise_path, sample_rate)
        snr_db = rng.choice(snr_levels)

        mixture = _mix_at_snr(clean_audio, noise_audio, snr_db)

        out_name = f"{os.path.splitext(filename)[0]}_{category}_{snr_db}dB.wav"
        sf.write(os.path.join(clean_output_dir, out_name), clean_audio, sample_rate)
        sf.write(os.path.join(noisy_output_dir, out_name), mixture, sample_rate)
        mixture_count += 1

    print(f"Wrote {mixture_count} synthetic clean/noisy pairs to {output_dir}")
    return mixture_count


def prepare_voicebank_for_training(config_path="configs/config.yaml"):
    config = _load_config(config_path)
    sample_rate = config["audio"]["sample_rate"]
    vb = config["datasets"]["voicebank_demand"]
    val_speaker_ids = set(
        config["training"]["phase1_baseline"]["validation_speaker_ids"]
    )

    clean_train_dir = vb["clean_train_dir"]
    noisy_train_dir = vb["noisy_train_dir"]
    all_filenames = sorted(os.listdir(clean_train_dir))

    def speaker_id(filename):
        return filename.split("_")[0]

    val_filenames = [f for f in all_filenames if speaker_id(f) in val_speaker_ids]
    train_filenames = [f for f in all_filenames if speaker_id(f) not in val_speaker_ids]

    found_val_speakers = {speaker_id(f) for f in val_filenames}
    missing = val_speaker_ids - found_val_speakers
    if missing:
        raise ValueError(
            f"Configured validation_speaker_ids not found in {clean_train_dir}: "
            f"{missing}. Update training.phase1_baseline.validation_speaker_ids "
            f"in configs/config.yaml to speaker IDs that actually exist there."
        )

    output_dir = "data/processed/voicebank_demand"
    splits = {
        "clean_train": (clean_train_dir, train_filenames),
        "noisy_train": (noisy_train_dir, train_filenames),
        "clean_val": (clean_train_dir, val_filenames),
        "noisy_val": (noisy_train_dir, val_filenames),
    }

    for split_name, (source_dir, filenames) in splits.items():
        split_dir = os.path.join(output_dir, split_name)
        os.makedirs(split_dir, exist_ok=True)
        for filename in filenames:
            audio = _load_mono(os.path.join(source_dir, filename), sample_rate)
            sf.write(os.path.join(split_dir, filename), audio, sample_rate)
        print(f"{split_name}: wrote {len(filenames)} files to {split_dir}")

    return len(train_filenames), len(val_filenames)


if __name__ == "__main__":
    clean_train_files, clean_test_files = verify_voicebank_demand()
    prepare_voicebank_for_training()
    build_synthetic_defence_set(clean_train_files)