from pathlib import Path
import random
import wave
import numpy as np
import soundfile as sf

# ============================================================
# Defence Speech Enhancement Dataset Generator
# ============================================================

ROOT = Path(__file__).resolve().parent.parent

SPEECH_DIR = ROOT / "dataset" / "env_nosie_speech"
ENV_NOISE_DIR = ROOT / "dataset" / "env_noise"
MILITARY_NOISE_DIR = ROOT / "data" / "raw" / "defence_noise_train"

OUTPUT_DIR = ROOT / "data" / "processed" / "defence_custom"

SAMPLE_RATE = 16000
CHUNK_SECONDS = 3.0
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_SECONDS)

# SNRs used for training
SNRS = [-5, 0, 5, 10, 15]

# Number of mixtures generated from each clean speech file
MIXES_PER_SPEECH = 100

RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)


def load_audio(path):
    audio, sr = sf.read(path, dtype="float32")

    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)

    if sr != SAMPLE_RATE:
        raise ValueError(
            f"{path.name}: expected {SAMPLE_RATE} Hz, found {sr} Hz"
        )

    return audio


def rms(audio):
    return np.sqrt(np.mean(audio ** 2) + 1e-12)


def make_length(audio, length):
    if len(audio) >= length:
        start = random.randint(0, len(audio) - length)
        return audio[start:start + length]

    repeats = int(np.ceil(length / len(audio)))
    audio = np.tile(audio, repeats)
    return audio[:length]


def mix_at_snr(clean, noise, snr_db):
    clean_rms = rms(clean)
    noise_rms = rms(noise)

    if noise_rms < 1e-8:
        return clean.copy()

    target_noise_rms = clean_rms / (10 ** (snr_db / 20.0))
    noise = noise * (target_noise_rms / noise_rms)

    noisy = clean + noise

    # Prevent clipping while preserving relative levels
    peak = np.max(np.abs(noisy))

    if peak > 0.99:
        noisy = noisy / peak * 0.99
        clean = clean / peak * 0.99

    return noisy.astype(np.float32), clean.astype(np.float32)


def collect_wavs(directory):
    return sorted(directory.rglob("*.wav"))


def main():
    clean_files = collect_wavs(SPEECH_DIR)
    env_noise_files = collect_wavs(ENV_NOISE_DIR)
    military_noise_files = collect_wavs(MILITARY_NOISE_DIR)

    print(f"Clean speech files     : {len(clean_files)}")
    print(f"Environment noise files: {len(env_noise_files)}")
    print(f"Military noise files   : {len(military_noise_files)}")

    if not clean_files:
        raise RuntimeError("No clean speech files found.")

    if not env_noise_files:
        raise RuntimeError("No environment noise files found.")

    if not military_noise_files:
        raise RuntimeError("No military noise files found.")

    all_noise_files = env_noise_files + military_noise_files

    clean_out = OUTPUT_DIR / "clean"
    noisy_out = OUTPUT_DIR / "noisy"

    clean_out.mkdir(parents=True, exist_ok=True)
    noisy_out.mkdir(parents=True, exist_ok=True)

    total = len(clean_files) * MIXES_PER_SPEECH

    print(f"Mixtures to generate   : {total}")
    print(f"SNR levels              : {SNRS}")
    print()

    counter = 0

    for speech_index, speech_path in enumerate(clean_files):

        speech = load_audio(speech_path)

        # Break long speech into random 3-second chunks
        for mix_index in range(MIXES_PER_SPEECH):

            clean_chunk = make_length(speech, CHUNK_SAMPLES)

            noise_path = random.choice(all_noise_files)
            noise = load_audio(noise_path)
            noise_chunk = make_length(noise, CHUNK_SAMPLES)

            snr_db = random.choice(SNRS)

            noisy_chunk, clean_chunk = mix_at_snr(
                clean_chunk,
                noise_chunk,
                snr_db
            )

            filename = (
                f"speech{speech_index:02d}_"
                f"mix{mix_index:03d}_"
                f"snr{snr_db:+d}.wav"
            )

            sf.write(
                noisy_out / filename,
                noisy_chunk,
                SAMPLE_RATE,
                subtype="PCM_16"
            )

            sf.write(
                clean_out / filename,
                clean_chunk,
                SAMPLE_RATE,
                subtype="PCM_16"
            )

            counter += 1

        print(
            f"[{speech_index + 1}/{len(clean_files)}] "
            f"{speech_path.name}"
        )

    print()
    print("Dataset generation complete.")
    print(f"Generated mixtures: {counter}")
    print(f"Clean directory   : {clean_out}")
    print(f"Noisy directory   : {noisy_out}")


if __name__ == "__main__":
    main()