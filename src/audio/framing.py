"""
Frame/hop windowing logic.

See config.yaml: frame_size_ms=32, hop_size_ms=8. Sample counts are always
derived from these + sample_rate here  -  never hardcoded  -  so a sample-rate
change can't silently desync framing from the rest of the pipeline.
"""

import yaml
import numpy as np


def _load_config(config_path: str = "configs/config.yaml") -> dict:
    with open(config_path, "r") as config_file:
        return yaml.safe_load(config_file)


def get_frame_and_hop_samples(config_path: str = "configs/config.yaml") -> tuple:
    """
    Convert frame_size_ms / hop_size_ms from config into sample counts.

    Centralizing this conversion here (rather than recomputing ms->samples
    math in multiple files) means there's exactly one place that can get the
    conversion wrong, not five.
    """
    config = _load_config(config_path)
    sample_rate = config["audio"]["sample_rate"]
    frame_size_ms = config["audio"]["frame_size_ms"]
    hop_size_ms = config["audio"]["hop_size_ms"]

    frame_size_samples = int(sample_rate * frame_size_ms / 1000)
    hop_size_samples = int(sample_rate * hop_size_ms / 1000)
    return frame_size_samples, hop_size_samples


def frame_signal(audio_samples: np.ndarray, config_path: str = "configs/config.yaml") -> np.ndarray:
    """
    Split a continuous audio signal into overlapping frames.

    Returns a 2D array of shape (num_frames, frame_size_samples).
    Each row is one frame; consecutive rows overlap by (frame_size - hop_size)
    samples, per the frame/hop discussion  -  this overlap is what lets
    overlap_add() reconstruct a smooth signal later.
    """
    frame_size_samples, hop_size_samples = get_frame_and_hop_samples(config_path)

    num_samples = len(audio_samples)

    # How many full frames fit? Anything left over is a partial tail frame.
    # We handle the tail EXPLICITLY (zero-pad it) rather than silently
    # dropping it  -  dropping the tail would quietly lose the end of whatever
    # someone said.
    if num_samples < frame_size_samples:
        # Signal shorter than one frame: pad the whole thing to one frame.
        padded_audio = np.zeros(frame_size_samples, dtype=np.float32)
        padded_audio[:num_samples] = audio_samples
        return padded_audio.reshape(1, frame_size_samples)

    num_frames = 1 + (num_samples - frame_size_samples) // hop_size_samples

    # Check if there's leftover audio after the last full frame  -  if so,
    # we need one more (padded) frame to cover it, instead of dropping it.
    last_frame_end = (num_frames - 1) * hop_size_samples + frame_size_samples
    if last_frame_end < num_samples:
        num_frames += 1
        pad_length = (num_frames - 1) * hop_size_samples + frame_size_samples - num_samples
        audio_samples = np.concatenate([audio_samples, np.zeros(pad_length, dtype=np.float32)])

    frames = np.zeros((num_frames, frame_size_samples), dtype=np.float32)
    for frame_index in range(num_frames):
        start = frame_index * hop_size_samples
        frames[frame_index] = audio_samples[start:start + frame_size_samples]

    return frames


def overlap_add(frames: np.ndarray, config_path: str = "configs/config.yaml") -> np.ndarray:
    """
    Reconstruct a continuous signal from overlapping (enhanced) frames.

    This is the inverse of frame_signal(): where frame_signal() cuts
    overlapping windows out of one signal, overlap_add() sums overlapping
    windows back into one signal, adding regions where frames overlap.

    Without this, stitching frame_size-sized non-overlapping chunks back
    together would produce audible clicks at every frame boundary  -  see the
    frame-size-vs-hop-size discussion for why.
    """
    frame_size_samples, hop_size_samples = get_frame_and_hop_samples(config_path)
    num_frames = frames.shape[0]

    output_length = (num_frames - 1) * hop_size_samples + frame_size_samples
    output_signal = np.zeros(output_length, dtype=np.float32)

    # DTLN is trained with tf.signal.overlap_and_add: overlapping frames are
    # SUMMED, not averaged. Dividing by the overlap count (4x here) scaled the
    # reconstruction down by ~4 and produced strongly negative evaluation SNR,
    # because SNR treats that gain error as residual noise.
    for frame_index in range(num_frames):
        start = frame_index * hop_size_samples
        output_signal[start:start + frame_size_samples] += frames[frame_index]

    return output_signal
