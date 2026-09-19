"""
Audio input/output for the pipeline.

This file owns getting samples in and out. Framing (chunking into
model-ready windows) lives in framing.py, deliberately separate - see that
file for why.

COMMIT NOTE: commit after simulate_dual_mic_from_clean_noisy() is confirmed
to fix the negative-SNR evaluation bug (metrics.py used simulate_dual_mic on
the full noisy signal, so the reference channel carried almost the same
speech as the primary channel, and NLMS cancelled speech along with noise).

STEREO-DOWNMIX NOTE: load_audio_file() no longer blindly averages stereo
channels. A WhatsApp voice-note test file was genuinely stereo (2 different,
non-duplicate channels) and sounded bad after enhancement. Blind averaging
of two independent channels risks partial phase cancellation of the voice
at load time, before the model ever sees it - that is a plausible real
cause distinct from the DeepFilterNet3 stage itself. The fix below checks
channel similarity and only averages when it is safe to do so; otherwise it
picks the higher-energy channel instead of blending. This has NOT yet been
confirmed against the actual WhatsApp file - test that before trusting it.
"""

import yaml
import numpy as np
import soundfile as sf
import librosa
import sounddevice as sd
from pathlib import Path


def _load_config(config_path: str = "configs/config.yaml") -> dict:
    with open(config_path, "r") as config_file:
        return yaml.safe_load(config_file)


def _downmix_channels(audio_samples: np.ndarray, correlation_threshold: float = 0.95) -> np.ndarray:
    """
    Reduce a multi-channel signal to mono without risking phase
    cancellation of independent content.

    audio_samples is expected in (frames, channels) shape, as returned by
    soundfile.read(). If the channels are highly correlated (normalized
    cross-correlation at zero lag above correlation_threshold), they are
    treated as near-duplicates of the same source and averaged, which is
    the standard safe downmix. If they diverge more than that, they are
    treated as carrying independent content, and the channel with higher
    RMS energy is used directly instead of blending - blending independent
    channels can partially cancel the signal via phase differences.

    correlation_threshold is a heuristic, not a validated constant - it has
    not yet been checked against a real problematic stereo file.

    Returns a 1D mono array.
    """
    if audio_samples.ndim == 1:
        return audio_samples

    channel_one = audio_samples[:, 0]
    channel_two = audio_samples[:, 1]

    std_one = np.std(channel_one)
    std_two = np.std(channel_two)

    if std_one < 1e-9 or std_two < 1e-9:
        correlation = 0.0
    else:
        correlation = float(np.corrcoef(channel_one, channel_two)[0, 1])

    if correlation >= correlation_threshold:
        return np.mean(audio_samples, axis=1)

    rms_one = np.sqrt(np.mean(channel_one ** 2))
    rms_two = np.sqrt(np.mean(channel_two ** 2))
    chosen_channel = channel_one if rms_one >= rms_two else channel_two

    print(
        f"Stereo channels diverge (correlation={correlation:.3f}, "
        f"below {correlation_threshold}) - using higher-energy channel "
        f"instead of averaging to avoid phase cancellation."
    )

    return chosen_channel


def load_audio_file(file_path: str, config_path: str = "configs/config.yaml") -> np.ndarray:
    config = _load_config(config_path)
    target_sample_rate = config["audio"]["sample_rate"]

    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    audio_samples, original_sample_rate = sf.read(str(file_path), dtype="float32")

    if audio_samples.ndim > 1:
        audio_samples = _downmix_channels(audio_samples)

    if original_sample_rate != target_sample_rate:
        audio_samples = librosa.resample(
            audio_samples, orig_sr=original_sample_rate, target_sr=target_sample_rate
        )

    return audio_samples.astype(np.float32)


def save_audio_file(audio_samples: np.ndarray, file_path: str, config_path: str = "configs/config.yaml") -> None:
    config = _load_config(config_path)
    sample_rate = config["audio"]["sample_rate"]
    sf.write(str(file_path), audio_samples, sample_rate)


def record_from_mic(duration_seconds: float, config_path: str = "configs/config.yaml") -> np.ndarray:
    config = _load_config(config_path)
    sample_rate = config["audio"]["sample_rate"]
    channels = config["audio"]["channels"]

    print(f"Recording {duration_seconds}s of audio... speak now.")
    recorded_audio = sd.rec(
        int(duration_seconds * sample_rate),
        samplerate=sample_rate,
        channels=channels,
        dtype="float32",
    )
    sd.wait()
    return recorded_audio.flatten()


def play_audio(audio_samples: np.ndarray, config_path: str = "configs/config.yaml") -> None:
    config = _load_config(config_path)
    sample_rate = config["audio"]["sample_rate"]
    sd.play(audio_samples, samplerate=sample_rate)
    sd.wait()


def simulate_dual_mic(mono_audio: np.ndarray, delay_samples: int = 4, attenuation: float = 0.9) -> tuple:
    """
    Simulate a second microphone channel from a single mono input.

    IMPORTANT - this delays/attenuates the FULL mixed signal (speech+noise
    together) for both channels, so the reference ends up carrying almost
    the same speech as the primary, just shifted a few samples. That is
    fine for exercising a dual-input pipeline in software, but it is NOT a
    realistic noise-only reference. Do not use this for evaluation metrics
    where a real reference channel matters - use
    simulate_dual_mic_from_clean_noisy() there instead. This function
    remains the correct one for demo/live_demo.py, where there is no
    ground-truth clean signal to build a better reference from.

    Returns (mic_channel_1, mic_channel_2) - both same length as input.
    """
    mic_channel_1 = mono_audio.copy()

    mic_channel_2 = np.zeros_like(mono_audio)
    if delay_samples > 0:
        mic_channel_2[delay_samples:] = mono_audio[:-delay_samples] * attenuation
    else:
        mic_channel_2 = mono_audio * attenuation

    return mic_channel_1, mic_channel_2


def simulate_dual_mic_from_clean_noisy(clean_signal: np.ndarray, noisy_signal: np.ndarray,
                                        delay_samples: int = 4, attenuation: float = 0.9) -> tuple:
    """
    EVALUATION-ONLY dual-mic simulation that uses ground truth to build a
    realistic reference channel.

    simulate_dual_mic() delays/attenuates the full mixed signal for both
    channels, so the reference carries almost the same speech as the
    primary - NLMS then cancels speech along with noise, since it cannot
    tell them apart. That produced strongly negative evaluation SNR.

    Here, because this is a labeled test set, we can compute
    noise_only = noisy_signal - clean_signal and use THAT (delayed,
    attenuated) as the reference. This makes the reference correlate mainly
    with the noise NLMS needs to remove, and only weakly with the speech it
    needs to preserve - which is what real dual-mic placement is meant to
    achieve.

    NOT usable in demo/live_demo.py - there is no clean_signal for a live
    mic feed. That path keeps using simulate_dual_mic() and keeps its
    documented real-world limitation.

    Returns (mic_channel_1, mic_channel_2) - both same length as input.
    """
    if clean_signal.shape != noisy_signal.shape:
        raise ValueError(
            f"clean_signal and noisy_signal must have the same shape, "
            f"got {clean_signal.shape} and {noisy_signal.shape}"
        )

    noise_only = noisy_signal - clean_signal

    mic_channel_1 = noisy_signal.copy()

    mic_channel_2 = np.zeros_like(noisy_signal)
    if delay_samples > 0:
        mic_channel_2[delay_samples:] = noise_only[:-delay_samples] * attenuation
    else:
        mic_channel_2 = noise_only * attenuation

    return mic_channel_1, mic_channel_2