"""
Pure numpy + onnxruntime DSP wrapper for DeepFilterNet3 inference.
Replaces libdf (Rust) STFT, ERB filterbank, feature normalization, and
deep-filter coefficient fusion with a from-scratch numpy port, so
inference has no Rust dependency (works on aarch64 with only
onnxruntime's prebuilt wheels). Wraps the ORIGINAL non-streaming ONNX
exports (enc.onnx, erb_dec.onnx, df_dec.onnx). Every constant and
formula below was read directly from libDF/src/lib.rs,
libDF/src/transforms.rs, df/modules.py, df/multiframe.py, and
df/deepfilternet3.py, not assumed. Config values match config.ini:
sr=48000, fft_size=960, hop_size=480, nb_erb=32, nb_df=96, norm_tau=1,
df_order=5, df_lookahead=2, conv_lookahead=2.
FIX 1 (2026-09-02): istft_synthesis now divides each frame's spectrum
by wnorm before irfft. stft_analysis multiplies every frame by wnorm
(1/960 for this config) as part of DF's feature-normalization
convention, but nothing was inverting that scaling on the way back to
audio, so every enhanced sample came out exactly fft_size times too
quiet (measured peak-amplitude ratio was 960.0, matching
fft_size**2/(2*hop_size) = 960 exactly for this config).
FIX 2 (2026-09-02): enhance_chunk now drops the first
(fft_size - hop_size) samples of the istft output before trimming to
orig_len. stft_analysis prepends that many zero samples as framing
lead-in, which shifts every reconstructed sample forward by that same
amount relative to the true input timeline. Measured cross-correlation
lag (480 samples at 48kHz) matched fft_size - hop_size exactly for
this config, confirming this as the source rather than a guess.
"""

import numpy as np
import onnxruntime as ort


SR = 48000
FFT_SIZE = 960
HOP_SIZE = 480
NB_ERB = 32
NB_DF = 96
DF_ORDER = 5
DF_LOOKAHEAD = 2
CONV_LOOKAHEAD = 2
NORM_TAU = 1.0

ERB_WIDTHS = np.array(
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 7, 7, 8, 10, 12, 13, 15,
     18, 20, 24, 28, 31, 37, 42, 50, 56, 67],
    dtype=np.int64,
)

MEAN_NORM_INIT = (-60.0, -90.0)
UNIT_NORM_INIT = (0.001, 0.0001)


def build_vorbis_window(fft_size):
    window_size_h = fft_size // 2
    n = np.arange(fft_size, dtype=np.float64)
    s = np.sin(0.5 * np.pi * (n + 0.5) / window_size_h)
    w = np.sin(0.5 * np.pi * s * s)
    return w.astype(np.float32)


def compute_wnorm(fft_size, hop_size):
    return 1.0 / (float(fft_size) ** 2 / (2.0 * hop_size))


def compute_norm_alpha(sr, hop_size, tau):
    dt = hop_size / sr
    a = np.exp(-dt / tau)
    precision = 3
    rounded = 1.0
    while rounded >= 1.0:
        rounded = round(float(a), precision)
        precision += 1
    return rounded


def build_erb_inv_fb(widths):
    n_bands = len(widths)
    n_freqs = int(np.sum(widths))
    b_pts = np.cumsum(np.concatenate(([0], widths))).astype(int)[:-1]
    fb = np.zeros((n_freqs, n_bands), dtype=np.float32)
    for i, (b, w) in enumerate(zip(b_pts.tolist(), widths.tolist())):
        fb[b:b + w, i] = 1.0
    return fb.T.copy()


def stft_analysis(audio, window, wnorm, fft_size, hop_size):
    audio = np.asarray(audio, dtype=np.float32)
    lead = fft_size - hop_size
    padded = np.concatenate([np.zeros(lead, dtype=np.float32), audio])
    n_frames = max(0, 1 + (len(padded) - fft_size) // hop_size)
    freq_size = fft_size // 2 + 1
    spec = np.zeros((n_frames, freq_size), dtype=np.complex64)
    for t in range(n_frames):
        start = t * hop_size
        frame = padded[start:start + fft_size] * window
        spec[t] = np.fft.rfft(frame, n=fft_size) * wnorm
    return spec


def istft_synthesis(spec, window, wnorm, fft_size, hop_size):
    n_frames = spec.shape[0]
    mem_len = fft_size - hop_size
    synthesis_mem = np.zeros(mem_len, dtype=np.float32)
    out = np.zeros(n_frames * hop_size, dtype=np.float32)
    inv_wnorm = 1.0 / wnorm
    for t in range(n_frames):
        x = np.fft.irfft(spec[t] * inv_wnorm, n=fft_size).astype(np.float32)
        x = x * window
        x_first = x[:hop_size]
        x_second = x[hop_size:]
        out[t * hop_size:(t + 1) * hop_size] = x_first + synthesis_mem
        synthesis_mem = x_second.copy()
    return out


def compute_erb_energy_db(spec_frame, widths):
    n_bands = len(widths)
    out = np.zeros(n_bands, dtype=np.float32)
    idx = 0
    for i, w in enumerate(widths):
        seg = spec_frame[idx:idx + w]
        out[i] = np.mean(seg.real ** 2 + seg.imag ** 2)
        idx += w
    out = 10.0 * np.log10(out + 1e-10)
    return out


def compute_feat_erb(spec, widths, alpha):
    n_frames = spec.shape[0]
    n_bands = len(widths)
    state = np.linspace(MEAN_NORM_INIT[0], MEAN_NORM_INIT[1], n_bands).astype(np.float32)
    feat = np.zeros((n_frames, n_bands), dtype=np.float32)
    for t in range(n_frames):
        e_db = compute_erb_energy_db(spec[t], widths)
        state = e_db * (1.0 - alpha) + state * alpha
        feat[t] = (e_db - state) / 40.0
    return feat


def compute_feat_spec(spec, nb_df, alpha):
    n_frames = spec.shape[0]
    state = np.linspace(UNIT_NORM_INIT[0], UNIT_NORM_INIT[1], nb_df).astype(np.float32)
    feat = np.zeros((n_frames, nb_df), dtype=np.complex64)
    for t in range(n_frames):
        x = spec[t, :nb_df]
        mag = np.abs(x)
        state = mag * (1.0 - alpha) + state * alpha
        feat[t] = x / np.sqrt(state)
    return feat


def apply_conv_lookahead_shift(feat, lookahead):
    if lookahead <= 0:
        return feat
    shifted = feat[lookahead:]
    pad = np.zeros((lookahead,) + feat.shape[1:], dtype=feat.dtype)
    return np.concatenate([shifted, pad], axis=0)


def run_encoder(session, feat_erb, feat_spec_real):
    feat_erb_in = feat_erb[np.newaxis, np.newaxis, :, :].astype(np.float32)
    feat_spec_in = np.transpose(feat_spec_real, (2, 0, 1))[np.newaxis, :, :, :].astype(np.float32)
    input_names = [i.name for i in session.get_inputs()]
    outputs = session.run(None, {
        input_names[0]: feat_erb_in,
        input_names[1]: feat_spec_in,
    })
    output_names = [o.name for o in session.get_outputs()]
    return dict(zip(output_names, outputs))


def run_erb_decoder(session, emb, e3, e2, e1, e0):
    input_names = [i.name for i in session.get_inputs()]
    outputs = session.run(None, {
        input_names[0]: emb.astype(np.float32),
        input_names[1]: e3.astype(np.float32),
        input_names[2]: e2.astype(np.float32),
        input_names[3]: e1.astype(np.float32),
        input_names[4]: e0.astype(np.float32),
    })
    output_names = [o.name for o in session.get_outputs()]
    return dict(zip(output_names, outputs))


def run_df_decoder(session, emb, c0):
    input_names = [i.name for i in session.get_inputs()]
    outputs = session.run(None, {
        input_names[0]: emb.astype(np.float32),
        input_names[1]: c0.astype(np.float32),
    })
    output_names = [o.name for o in session.get_outputs()]
    return dict(zip(output_names, outputs))


def reshape_df_coefs(coefs, df_order):
    b, t, f, o2 = coefs.shape
    coefs = coefs.reshape(b, t, f, df_order, 2)
    coefs = np.transpose(coefs, (0, 3, 1, 2, 4))
    return coefs


def apply_mask(spec_full, m, erb_inv_fb):
    mask_full = m[0, 0] @ erb_inv_fb
    return spec_full * mask_full


def apply_df_fusion(spec_full, df_coefs, nb_df, df_order, df_lookahead):
    t_len = spec_full.shape[0]
    pad_before = df_order - 1 - df_lookahead
    pad_after = df_lookahead
    spec_bins = spec_full[:, :nb_df]
    padded = np.concatenate([
        np.zeros((pad_before, nb_df), dtype=spec_bins.dtype),
        spec_bins,
        np.zeros((pad_after, nb_df), dtype=spec_bins.dtype),
    ], axis=0)
    out = np.zeros((t_len, nb_df), dtype=np.complex64)
    for n in range(df_order):
        tap = padded[n:n + t_len, :]
        coef_n = df_coefs[0, n, :, :, 0] + 1j * df_coefs[0, n, :, :, 1]
        out += tap * coef_n
    spec_out = spec_full.copy()
    spec_out[:, :nb_df] = out
    return spec_out


def load_sessions(export_dir):
    enc = ort.InferenceSession(f"{export_dir}/enc.onnx", providers=["CPUExecutionProvider"])
    erb_dec = ort.InferenceSession(f"{export_dir}/erb_dec.onnx", providers=["CPUExecutionProvider"])
    df_dec = ort.InferenceSession(f"{export_dir}/df_dec.onnx", providers=["CPUExecutionProvider"])
    return enc, erb_dec, df_dec


def enhance_chunk(audio, enc_session, erb_dec_session, df_dec_session, erb_inv_fb):
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

    enc_out = run_encoder(enc_session, feat_erb, feat_spec_real)
    e0, e1, e2, e3 = enc_out["e0"], enc_out["e1"], enc_out["e2"], enc_out["e3"]
    emb, c0 = enc_out["emb"], enc_out["c0"]

    erb_out = run_erb_decoder(erb_dec_session, emb, e3, e2, e1, e0)
    m = erb_out["m"]

    df_out = run_df_decoder(df_dec_session, emb, c0)
    df_coefs = reshape_df_coefs(df_out["coefs"], DF_ORDER)

    spec_m = apply_mask(spec_full, m, erb_inv_fb)
    spec_e = apply_df_fusion(spec_full, df_coefs, NB_DF, DF_ORDER, DF_LOOKAHEAD)
    spec_final = spec_e.copy()
    spec_final[:, NB_DF:] = spec_m[:, NB_DF:]

    enhanced = istft_synthesis(spec_final, window, wnorm, FFT_SIZE, HOP_SIZE)
    lead = FFT_SIZE - HOP_SIZE
    enhanced = enhanced[lead:]
    enhanced = enhanced[:orig_len]
    return enhanced

"""
...
FIX 2 (2026-09-02): enhance_chunk now drops the first
(fft_size - hop_size) samples of the istft output before trimming to
orig_len. stft_analysis prepends that many zero samples as framing
lead-in, which shifts every reconstructed sample forward by that same
amount relative to the true input timeline. Measured cross-correlation
lag (480 samples at 48kHz) matched fft_size - hop_size exactly for
this config, confirming this as the source rather than a guess.
ADDITION (2026-09-02): enhance_chunked() splits a full audio buffer
into independent chunk_seconds-length buffers and runs enhance_chunk()
on each one separately, concatenating results. GRU state resets to
zero at every chunk boundary (these ONNX exports have no exposed
hidden-state I/O), matching the earlier decision to use chunked
offline processing instead of true frame-by-frame streaming after the
streaming export was found to break temporal convolutions. This is
the intended real-time approximation for Pi: read chunk_seconds of
audio from the mic buffer, enhance it as one call, play/save it,
repeat.
"""

def enhance_chunked(audio, enc_session, erb_dec_session, df_dec_session, erb_inv_fb,
                     chunk_seconds=2.0, sr=SR):
    audio = np.asarray(audio, dtype=np.float32)
    chunk_len = int(chunk_seconds * sr)
    if chunk_len <= 0:
        raise ValueError("chunk_seconds must produce a positive sample length")

    total_len = len(audio)
    if total_len == 0:
        return np.zeros(0, dtype=np.float32)

    outputs = []
    start = 0
    while start < total_len:
        end = min(start + chunk_len, total_len)
        chunk = audio[start:end]
        enhanced_chunk = enhance_chunk(chunk, enc_session, erb_dec_session, df_dec_session, erb_inv_fb)
        outputs.append(enhanced_chunk)
        start = end

    return np.concatenate(outputs)