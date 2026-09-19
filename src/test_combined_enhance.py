"""test_combined_enhance.py
Enhance the two WhatsApp audio files in dataset/my_test using the combined
ONNX model (combined.onnx) and save the enhanced results alongside them.
"""

import os
import sys
import numpy as np
import soundfile as sf
import onnxruntime as ort

# ── Add src/ to path so we can import the DSP helpers ────────────────
sys.path.insert(0, os.path.dirname(__file__))
from df_onnx_dsp import (
    SR, FFT_SIZE, HOP_SIZE, NB_ERB, NB_DF, DF_ORDER, DF_LOOKAHEAD,
    CONV_LOOKAHEAD, NORM_TAU, ERB_WIDTHS,
    build_vorbis_window, compute_wnorm, compute_norm_alpha,
    build_erb_inv_fb, stft_analysis, istft_synthesis,
    compute_feat_erb, compute_feat_spec, apply_conv_lookahead_shift,
    reshape_df_coefs, apply_mask, apply_df_fusion,
)


def enhance_chunk_combined(audio, combined_session, erb_inv_fb):
    """Enhance a chunk of audio using the single combined ONNX model."""
    orig_len = len(audio)
    window = build_vorbis_window(FFT_SIZE)
    wnorm = compute_wnorm(FFT_SIZE, HOP_SIZE)
    alpha = compute_norm_alpha(SR, HOP_SIZE, NORM_TAU)

    audio_padded = np.concatenate([
        np.asarray(audio, dtype=np.float32),
        np.zeros(FFT_SIZE, dtype=np.float32),
    ])

    spec_full = stft_analysis(audio_padded, window, wnorm, FFT_SIZE, HOP_SIZE)

    feat_erb = compute_feat_erb(spec_full, ERB_WIDTHS, alpha)
    feat_spec_complex = compute_feat_spec(spec_full, NB_DF, alpha)
    feat_spec_real = np.stack([feat_spec_complex.real, feat_spec_complex.imag], axis=-1)

    feat_erb = apply_conv_lookahead_shift(feat_erb, CONV_LOOKAHEAD)
    feat_spec_real = apply_conv_lookahead_shift(feat_spec_real, CONV_LOOKAHEAD)

    # Prepare inputs for combined model (same as encoder inputs)
    feat_erb_in = feat_erb[np.newaxis, np.newaxis, :, :].astype(np.float32)
    feat_spec_in = np.transpose(feat_spec_real, (2, 0, 1))[np.newaxis, :, :, :].astype(np.float32)

    # Single inference call on combined model
    outputs = combined_session.run(None, {
        "feat_erb": feat_erb_in,
        "feat_spec": feat_spec_in,
    })
    out_names = [o.name for o in combined_session.get_outputs()]
    out_dict = dict(zip(out_names, outputs))

    m = out_dict["erb_m"]
    df_coefs = reshape_df_coefs(out_dict["df_coefs"], DF_ORDER)

    spec_m = apply_mask(spec_full, m, erb_inv_fb)
    spec_e = apply_df_fusion(spec_full, df_coefs, NB_DF, DF_ORDER, DF_LOOKAHEAD)
    spec_final = spec_e.copy()
    spec_final[:, NB_DF:] = spec_m[:, NB_DF:]

    enhanced = istft_synthesis(spec_final, window, wnorm, FFT_SIZE, HOP_SIZE)
    lead = FFT_SIZE - HOP_SIZE
    enhanced = enhanced[lead:]
    enhanced = enhanced[:orig_len]
    return enhanced


def enhance_chunked_combined(audio, combined_session, erb_inv_fb,
                             chunk_seconds=2.0, sr=SR):
    """Process long audio in chunks using the combined model."""
    audio = np.asarray(audio, dtype=np.float32)
    chunk_len = int(chunk_seconds * sr)
    total_len = len(audio)
    if total_len == 0:
        return np.zeros(0, dtype=np.float32)

    outputs = []
    start = 0
    while start < total_len:
        end = min(start + chunk_len, total_len)
        chunk = audio[start:end]
        enhanced_chunk = enhance_chunk_combined(chunk, combined_session, erb_inv_fb)
        outputs.append(enhanced_chunk)
        start = end

    return np.concatenate(outputs)


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    combined_path = os.path.join(root, "models", "onnx_export", "combined.onnx")
    test_dir = os.path.join(root, "dataset", "my_test")

    # The two WhatsApp audio files
    files = [
        "WhatsApp Audio 2026-09-18 at 11.54.57 AM (1).wav",
        "WhatsApp Audio 2026-09-18 at 11.54.58 AM.wav",
    ]

    print(f"Loading combined model from {combined_path} ...")
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    combined_session = ort.InferenceSession(combined_path, opts,
                                            providers=["CPUExecutionProvider"])
    erb_inv_fb = build_erb_inv_fb(ERB_WIDTHS)

    for i, fname in enumerate(files, start=1):
        in_path = os.path.join(test_dir, fname)
        out_path = os.path.join(test_dir, f"WhatsApp_{i}_combined_enhanced.wav")

        if not os.path.isfile(in_path):
            print(f"  SKIP: {fname} not found")
            continue

        print(f"\nProcessing [{i}]: {fname}")
        audio, sr_in = sf.read(in_path, dtype="float32")

        # Convert to mono if stereo
        if audio.ndim > 1:
            audio = audio.mean(axis=1)

        # Resample to 48 kHz if needed
        if sr_in != SR:
            print(f"  Resampling {sr_in} -> {SR} Hz ...")
            import librosa
            audio = librosa.resample(audio, orig_sr=sr_in, target_sr=SR)

        print(f"  Input length: {len(audio)} samples ({len(audio)/SR:.2f}s)")

        enhanced = enhance_chunked_combined(audio, combined_session, erb_inv_fb)

        sf.write(out_path, enhanced, SR)
        print(f"  Saved: {out_path}")
        print(f"  Output length: {len(enhanced)} samples ({len(enhanced)/SR:.2f}s)")

    print("\nDone! Check the enhanced files in dataset/my_test/")


if __name__ == "__main__":
    main()
