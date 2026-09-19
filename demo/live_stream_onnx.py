"""
True continuous streaming demo for the ONNX chunked wrapper: mic in ->
enhanced audio out, via a background worker thread and two sounddevice
callback streams (input + output) - unlike live_demo.py's mic mode,
which records for a fixed --duration, THEN processes, THEN plays back.

Output lags input by roughly chunk_seconds + per-chunk model runtime -
this is the "buffer arrives, gets processed, gets played" latency
inherent to the offline (non-streaming) ONNX exports (enc.onnx,
erb_dec.onnx, df_dec.onnx). There is no true frame-by-frame streaming
possible with these particular exports (see src/df_onnx_dsp.py's top
docstring - a lower-latency streaming export was tried and abandoned
because it broke temporal convolutions). GRU/internal model state resets
at every chunk boundary here, same as enhance_chunk() in
src/df_onnx_dsp.py - this file's threading model is what actually calls
enhance_chunk() in a loop, forever, instead of once over a fixed
pre-recorded buffer like eval_onnx_wrapper.py / live_demo.py do.

Runs mic capture and playback directly at the ONNX model's native SR
(48kHz, from src/df_onnx_dsp.py) to avoid resampling on every chunk in
the hot loop. Most USB mics/interfaces support 48kHz input directly; if
your Pi's mic only exposes e.g. 16kHz or 44.1kHz, sd.InputStream will
either fail to open or the OS will resample - confirm the mic's native
rate with the hardware side before relying on this on the Pi.

FIX (2026-09-03): first real run on Windows showed continuous
"input overflow"/"output underflow". Two causes, both fixed here:
(1) no blocksize/latency was given to InputStream/OutputStream, so
PortAudio picked very small default callback windows that Python
couldn't reliably service in time - now explicit blocksize=2048 and
latency="high" on both streams, trading a bit of extra latency for
much more slack per callback. (2) print() was called directly inside
the audio callbacks - blocking console I/O inside an audio callback
eats into the next callback's deadline and can cascade into permanent
overflow/underflow, which is what "still continue[d]" forever. Status
is now only counted in the callbacks and printed periodically from the
main thread instead. If overflow/underflow still appears after this
fix, try raising --chunk-seconds (more slack per model call) or running
outside a heavy IDE/terminal (console redraw itself can steal callback
time on some setups).

UNVALIDATED beyond the fix above: retest after pulling this version.

Ctrl+C to stop.
"""

import argparse
import os
import queue
import sys
import threading
import time

import numpy as np
import sounddevice as sd

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.df_onnx_dsp import load_sessions, build_erb_inv_fb, ERB_WIDTHS, enhance_chunk, SR

BLOCKSIZE = 2048
STREAM_LATENCY = "high"
STATUS_REPORT_INTERVAL_S = 2.0


def run_stream(onnx_dir, chunk_seconds, device_in, device_out):
    enc_session, erb_dec_session, df_dec_session = load_sessions(onnx_dir)
    erb_inv_fb = build_erb_inv_fb(ERB_WIDTHS)

    chunk_len = int(chunk_seconds * SR)

    capture_buffer = np.zeros(0, dtype=np.float32)
    process_queue = queue.Queue()
    playback_queue = queue.Queue()
    output_leftover = np.zeros(0, dtype=np.float32)
    stop_event = threading.Event()

    input_overflow_count = [0]
    output_underflow_count = [0]

    def input_callback(indata, frames, time_info, status):
        nonlocal capture_buffer
        if status:
            if status.input_overflow:
                input_overflow_count[0] += 1
        capture_buffer = np.concatenate([capture_buffer, indata[:, 0]])
        while len(capture_buffer) >= chunk_len:
            chunk = capture_buffer[:chunk_len].copy()
            capture_buffer = capture_buffer[chunk_len:]
            process_queue.put(chunk)

    def output_callback(outdata, frames, time_info, status):
        nonlocal output_leftover
        if status:
            if status.output_underflow:
                output_underflow_count[0] += 1
        out = np.zeros(frames, dtype=np.float32)
        filled = 0
        if len(output_leftover) > 0:
            n = min(len(output_leftover), frames)
            out[:n] = output_leftover[:n]
            output_leftover = output_leftover[n:]
            filled = n
        while filled < frames:
            try:
                block = playback_queue.get_nowait()
            except queue.Empty:
                break
            n = min(len(block), frames - filled)
            out[filled:filled + n] = block[:n]
            filled += n
            if n < len(block):
                output_leftover = block[n:]
        outdata[:, 0] = out

    def worker():
        while not stop_event.is_set():
            try:
                chunk = process_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            enhanced = enhance_chunk(chunk, enc_session, erb_dec_session, df_dec_session, erb_inv_fb)
            playback_queue.put(enhanced.astype(np.float32))

    def status_reporter():
        while not stop_event.is_set():
            time.sleep(STATUS_REPORT_INTERVAL_S)
            if input_overflow_count[0] or output_underflow_count[0]:
                print(f"[status] input overflows: {input_overflow_count[0]}, "
                      f"output underflows: {output_underflow_count[0]} "
                      f"(last {STATUS_REPORT_INTERVAL_S:.0f}s)")
                input_overflow_count[0] = 0
                output_underflow_count[0] = 0

    worker_thread = threading.Thread(target=worker, daemon=True)
    worker_thread.start()
    reporter_thread = threading.Thread(target=status_reporter, daemon=True)
    reporter_thread.start()

    print(f"Streaming at {SR} Hz, chunk_seconds={chunk_seconds} ({chunk_len} samples/chunk), "
          f"blocksize={BLOCKSIZE}, latency={STREAM_LATENCY}.")
    print("Speak into the mic. Use headphones to avoid feedback. Ctrl+C to stop.")

    with sd.InputStream(samplerate=SR, channels=1, dtype="float32",
                         blocksize=BLOCKSIZE, latency=STREAM_LATENCY,
                         callback=input_callback, device=device_in), \
         sd.OutputStream(samplerate=SR, channels=1, dtype="float32",
                          blocksize=BLOCKSIZE, latency=STREAM_LATENCY,
                          callback=output_callback, device=device_out):
        try:
            while True:
                sd.sleep(200)
        except KeyboardInterrupt:
            print("\nStopping...")
        finally:
            stop_event.set()
            worker_thread.join(timeout=2.0)
            reporter_thread.join(timeout=2.0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="True continuous mic-in -> ONNX-enhanced -> speaker-out streaming demo."
    )
    parser.add_argument("--onnx-dir", default="models/onnx_export",
                         help="Folder containing enc.onnx/erb_dec.onnx/df_dec.onnx.")
    parser.add_argument("--chunk-seconds", type=float, default=1.0,
                         help="Seconds of audio processed per model call. Smaller = "
                              "lower latency, larger = usually better enhancement "
                              "quality and more callback slack. GRU state resets "
                              "every chunk either way.")
    parser.add_argument("--device-in", default=None,
                         help="Input device index/name (see `python -m sounddevice`). "
                              "Default: system default input.")
    parser.add_argument("--device-out", default=None,
                         help="Output device index/name. Default: system default output.")
    args = parser.parse_args()

    run_stream(args.onnx_dir, args.chunk_seconds, args.device_in, args.device_out)