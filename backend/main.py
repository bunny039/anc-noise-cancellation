"""
backend/main.py
FastAPI backend for the Defence Speech Enhancement System.
Wraps the existing ONNX pipeline (src/df_onnx_dsp.py / src/pipeline.py).
"""

import os, sys, uuid, time, asyncio, io, json
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ── path fix so we can import src/ from repo root ─────────────────────────
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

ONNX_DIR = ROOT / "models" / "onnx_export"
UPLOAD_DIR = ROOT / "backend" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Defence Speech Enhancement API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory job store (replace with Redis/DB for production) ─────────────
jobs: dict[str, dict] = {}

ONNX_SR = 48000  # DeepFilterNet3 native rate


def load_onnx_sessions():
    """Load ONNX sessions (cached)."""
    import onnxruntime as ort
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    enc   = ort.InferenceSession(str(ONNX_DIR / "enc.onnx"),     opts, providers=["CPUExecutionProvider"])
    erb   = ort.InferenceSession(str(ONNX_DIR / "erb_dec.onnx"),  opts, providers=["CPUExecutionProvider"])
    df    = ort.InferenceSession(str(ONNX_DIR / "df_dec.onnx"),   opts, providers=["CPUExecutionProvider"])
    return enc, erb, df


_sessions = None
_erb_inv_fb = None


def get_sessions():
    global _sessions, _erb_inv_fb
    if _sessions is None:
        from src.df_onnx_dsp import build_erb_inv_fb, ERB_WIDTHS
        _sessions = load_onnx_sessions()
        _erb_inv_fb = build_erb_inv_fb(ERB_WIDTHS)
    return _sessions, _erb_inv_fb


def resample(audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    if orig_sr == target_sr:
        return audio
    return resample_poly(audio, target_sr, orig_sr).astype(np.float32)


def compute_snr(clean: np.ndarray, noisy: np.ndarray) -> float:
    noise = noisy - clean
    signal_power = np.mean(clean ** 2) + 1e-10
    noise_power  = np.mean(noise ** 2) + 1e-10
    return float(10 * np.log10(signal_power / noise_power))


def compute_si_sdr(reference: np.ndarray, estimate: np.ndarray) -> float:
    reference = reference - np.mean(reference)
    estimate  = estimate  - np.mean(estimate)
    dot = np.dot(reference, estimate)
    ref_pow = np.dot(reference, reference) + 1e-8
    projection = (dot / ref_pow) * reference
    noise = estimate - projection
    return float(10 * np.log10(np.dot(projection, projection) / (np.dot(noise, noise) + 1e-8)))


def audio_to_waveform_data(audio: np.ndarray, max_points: int = 2000) -> list[dict]:
    """Downsample to max_points for JSON transfer."""
    step = max(1, len(audio) // max_points)
    samples = audio[::step]
    t = np.linspace(0, len(audio) / ONNX_SR, len(samples))
    return [{"t": round(float(t[i]), 4), "v": round(float(samples[i]), 5)} for i in range(len(samples))]


def compute_fft(audio: np.ndarray, sr: int, n_fft: int = 2048) -> list[dict]:
    """Return magnitude spectrum up to Nyquist."""
    if len(audio) < n_fft:
        audio = np.pad(audio, (0, n_fft - len(audio)))
    window = np.hanning(n_fft)
    spec = np.abs(np.fft.rfft(audio[:n_fft] * window))
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    db = 20 * np.log10(spec + 1e-8)
    # Limit to 8 kHz for readability
    mask = freqs <= 8000
    return [{"f": round(float(freqs[i]), 1), "db": round(float(db[i]), 2)}
            for i in range(len(freqs)) if mask[i]]


def compute_spectrogram(audio: np.ndarray, sr: int,
                         n_fft: int = 512, hop: int = 128,
                         max_frames: int = 200, max_freqs: int = 64) -> dict:
    """STFT spectrogram → 2-D array for canvas rendering."""
    window = np.hanning(n_fft)
    frames = []
    for i in range(0, len(audio) - n_fft, hop):
        frame = audio[i:i + n_fft] * window
        mag = np.abs(np.fft.rfft(frame))
        frames.append(mag)
    if not frames:
        return {"data": [], "n_frames": 0, "n_freqs": 0}

    S = np.array(frames)  # (T, F)
    S_db = 20 * np.log10(S + 1e-8)

    # Downsample time and freq axes
    t_step = max(1, S_db.shape[0] // max_frames)
    f_step = max(1, S_db.shape[1] // max_freqs)
    S_small = S_db[::t_step, ::f_step]

    S_norm = (S_small - S_db.min()) / (S_db.max() - S_db.min() + 1e-8)
    return {
        "data": S_norm.tolist(),
        "n_frames": S_small.shape[0],
        "n_freqs": S_small.shape[1],
        "db_min": float(S_db.min()),
        "db_max": float(S_db.max()),
    }


async def run_enhancement(job_id: str, input_path: str, input_sr: int, use_nlms: bool):
    """Background enhancement task."""
    jobs[job_id]["status"] = "PREPROCESSING"
    jobs[job_id]["pipeline"] = {
        "INPUT_AUDIO": "complete",
        "PREPROCESSING": "active",
        "NOISE_ANALYSIS": "waiting",
        "DEEPFILTERNET3": "waiting",
        "POST_PROCESSING": "waiting",
        "ENHANCED_SPEECH": "waiting",
    }
    await asyncio.sleep(0.3)

    # Load audio
    audio_raw, _ = sf.read(input_path, dtype="float32")
    if audio_raw.ndim > 1:
        audio_raw = audio_raw.mean(axis=1)

    # Resample to ONNX_SR (48 kHz)
    audio_48k = resample(audio_raw, input_sr, ONNX_SR)

    jobs[job_id]["pipeline"]["PREPROCESSING"] = "complete"
    jobs[job_id]["pipeline"]["NOISE_ANALYSIS"] = "active"
    jobs[job_id]["status"] = "ANALYZING"
    await asyncio.sleep(0.2)

    # Compute input FFT for noise profile
    input_fft = compute_fft(audio_48k, ONNX_SR)
    # Rough input SNR estimate (vs silence baseline)
    rms = float(np.sqrt(np.mean(audio_48k ** 2)))
    peak_freq_idx = int(np.argmax([d["db"] for d in input_fft]))
    dominant_freq = float(input_fft[peak_freq_idx]["f"]) if input_fft else 0.0

    jobs[job_id]["pipeline"]["NOISE_ANALYSIS"] = "complete"
    jobs[job_id]["pipeline"]["DEEPFILTERNET3"] = "active"
    jobs[job_id]["status"] = "PROCESSING"
    await asyncio.sleep(0.1)

    # ── Run ONNX enhancement ─────────────────────────────────────────────
    try:
        sessions, erb_inv_fb = get_sessions()
        enc_sess, erb_sess, df_sess = sessions

        from src.df_onnx_dsp import enhance_chunked
        t0 = time.perf_counter()
        enhanced_48k = enhance_chunked(
            audio_48k, enc_sess, erb_sess, df_sess, erb_inv_fb,
            chunk_seconds=2.0, sr=ONNX_SR,
        )
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)
    except Exception as e:
        jobs[job_id]["status"] = "ERROR"
        jobs[job_id]["error"] = str(e)
        return

    jobs[job_id]["pipeline"]["DEEPFILTERNET3"] = "complete"
    jobs[job_id]["pipeline"]["POST_PROCESSING"] = "active"
    await asyncio.sleep(0.15)

    # Post-process (optional NLMS — disabled by default)
    enhanced_out = enhanced_48k

    # Save enhanced audio
    enhanced_path = str(UPLOAD_DIR / f"{job_id}_enhanced.wav")
    sf.write(enhanced_path, enhanced_out, ONNX_SR)

    jobs[job_id]["pipeline"]["POST_PROCESSING"] = "complete"
    jobs[job_id]["pipeline"]["ENHANCED_SPEECH"] = "complete"

    # ── Compute waveform + spectrum data ─────────────────────────────────
    noisy_waveform   = audio_to_waveform_data(audio_48k)
    enhanced_waveform = audio_to_waveform_data(enhanced_out)
    noisy_fft        = compute_fft(audio_48k, ONNX_SR)
    enhanced_fft     = compute_fft(enhanced_out, ONNX_SR)
    noisy_spec       = compute_spectrogram(audio_48k, ONNX_SR)
    enhanced_spec    = compute_spectrogram(enhanced_out, ONNX_SR)

    # ── Metrics (without clean reference) ────────────────────────────────
    rtf = round(latency_ms / 1000 / (len(audio_48k) / ONNX_SR), 3)
    metrics = {
        "input_snr":      "N/A",
        "output_snr":     "N/A",
        "snr_improvement":"N/A",
        "si_sdr":         "N/A",
        "si_sdr_improvement": "N/A",
        "stoi":           "N/A",
        "pesq":           "N/A",
        "latency_ms":     latency_ms,
        "rtf":            rtf,
        "note":           "Clean reference unavailable — upload a reference for full metrics.",
        "rms_input":      round(float(np.sqrt(np.mean(audio_48k ** 2))), 5),
        "rms_output":     round(float(np.sqrt(np.mean(enhanced_out ** 2))), 5),
        "peak_input":     round(float(np.max(np.abs(audio_48k))), 5),
        "peak_output":    round(float(np.max(np.abs(enhanced_out))), 5),
        "dominant_freq_hz": dominant_freq,
    }

    # ── Store results ─────────────────────────────────────────────────────
    jobs[job_id].update({
        "status": "COMPLETE",
        "enhanced_path": enhanced_path,
        "duration_s": round(len(audio_48k) / ONNX_SR, 2),
        "sample_rate": ONNX_SR,
        "noisy_waveform": noisy_waveform,
        "enhanced_waveform": enhanced_waveform,
        "noisy_fft": noisy_fft,
        "enhanced_fft": enhanced_fft,
        "noisy_spectrogram": noisy_spec,
        "enhanced_spectrogram": enhanced_spec,
        "metrics": metrics,
    })


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "model": "DeepFilterNet3", "inference": "ONNX"}


@app.post("/api/upload")
async def upload_audio(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in {".wav", ".flac", ".mp3"}:
        raise HTTPException(400, "Only .wav, .flac, .mp3 are supported")

    session_id = str(uuid.uuid4())
    save_path = UPLOAD_DIR / f"{session_id}{ext}"

    content = await file.read()
    save_path.write_bytes(content)

    # Read metadata
    audio, sr = sf.read(str(save_path), dtype="float32")
    channels = 1 if audio.ndim == 1 else audio.shape[1]
    duration = round(len(audio) / sr if audio.ndim == 1 else len(audio) / sr, 2)

    warnings = []
    if sr != ONNX_SR:
        warnings.append(f"Audio will be resampled from {sr} Hz to {ONNX_SR} Hz")
    if channels > 1:
        warnings.append("Stereo input detected — converting to mono")

    jobs[session_id] = {
        "status": "READY",
        "input_path": str(save_path),
        "input_sr": sr,
        "input_channels": channels,
        "duration_s": duration,
        "original_filename": file.filename,
        "pipeline": {
            "INPUT_AUDIO": "complete",
            "PREPROCESSING": "waiting",
            "NOISE_ANALYSIS": "waiting",
            "DEEPFILTERNET3": "waiting",
            "POST_PROCESSING": "waiting",
            "ENHANCED_SPEECH": "waiting",
        }
    }

    return {
        "session_id": session_id,
        "filename": file.filename,
        "duration_s": duration,
        "sample_rate": sr,
        "channels": channels,
        "warnings": warnings,
    }


@app.post("/api/enhance")
async def enhance(body: dict, background_tasks: BackgroundTasks):
    session_id = body.get("session_id")
    use_nlms   = body.get("use_nlms", False)

    if not session_id or session_id not in jobs:
        raise HTTPException(404, "Session not found — upload audio first")

    job = jobs[session_id]
    if job["status"] not in ("READY", "COMPLETE", "ERROR"):
        raise HTTPException(409, f"Job already in state: {job['status']}")

    background_tasks.add_task(
        run_enhancement,
        session_id,
        job["input_path"],
        job["input_sr"],
        use_nlms,
    )

    return {"job_id": session_id, "status": "PROCESSING"}


@app.get("/api/results/{job_id}")
async def get_results(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = dict(jobs[job_id])
    # Don't leak file paths
    job.pop("input_path", None)
    job.pop("enhanced_path", None)
    return job


@app.get("/api/metrics/{job_id}")
async def get_metrics(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    if "metrics" not in job:
        raise HTTPException(202, "Metrics not yet available")
    return job["metrics"]


@app.get("/api/audio/{job_id}/{audio_type}")
async def get_audio(job_id: str, audio_type: str):
    """Stream audio bytes. audio_type: 'noisy' | 'enhanced'"""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]

    if audio_type == "noisy":
        path = job.get("input_path")
    elif audio_type == "enhanced":
        path = job.get("enhanced_path")
    else:
        raise HTTPException(400, "audio_type must be 'noisy' or 'enhanced'")

    if not path or not Path(path).exists():
        raise HTTPException(404, "Audio file not found")

    def iter_file():
        with open(path, "rb") as f:
            yield from f

    return StreamingResponse(iter_file(), media_type="audio/wav",
                              headers={"Accept-Ranges": "bytes"})


@app.get("/api/status")
async def system_status():
    """Live system status for the status panel."""
    onnx_loaded = _sessions is not None
    return {
        "model": "DeepFilterNet3",
        "model_format": "ONNX",
        "device": "CPU",
        "sample_rate": ONNX_SR,
        "channels": "Mono",
        "chunk_seconds": 2.0,
        "backend": "CONNECTED",
        "onnx_loaded": onnx_loaded,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
