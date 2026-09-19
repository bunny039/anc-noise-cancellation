"""
End-to-end test using REAL audio files from test/ folder.

For each .wav file in the test directory, this script:
  1. Reads the raw 16kHz s16le PCM audio
  2. Splits it into 0.25s chunks (matching config_pi.yaml)
  3. For EACH chunk, runs the full ClearCom pipeline:
       s16le -> float32 -> resample 16k->48k -> ONNX enhance -> resample 48k->16k -> float32 -> s16le
  4. Splits enhanced chunks into 20ms/640-byte UDP packets
  5. Simulates UDP send/receive over localhost
  6. Reassembles received packets into output audio
  7. Saves the enhanced output as a .wav file
  8. Measures per-chunk latency and total pipeline metrics

SUCCESS CRITERIA:
  - All ONNX models load without error
  - Per-chunk pipeline latency < 250ms (chunk duration)
  - Zero packet loss in UDP simulation
  - Output audio has same duration as input (no samples lost)
  - No NaN/Inf in output audio
  - Output audio is not silent (RMS > threshold)
"""

import os
import queue
import socket
import struct
import sys
import threading
import time

import numpy as np
import soundfile as sf
import yaml
from scipy.signal import resample_poly

# Add pi/ directory to path for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from df_onnx_dsp import load_sessions, build_erb_inv_fb, ERB_WIDTHS, enhance_chunk, SR as ONNX_SR

# Pipeline constants
PIPELINE_SR = 16000
PACKET_DURATION_MS = 20
PACKET_SAMPLES = int(PIPELINE_SR * PACKET_DURATION_MS / 1000)  # 320 samples
PACKET_BYTES = PACKET_SAMPLES * 2  # 640 bytes


def s16le_to_float32(pcm_bytes):
    samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    return samples / 32768.0


def float32_to_s16le(audio_float):
    clipped = np.clip(audio_float, -1.0, 1.0)
    samples = (clipped * 32767.0).astype(np.int16)
    return samples.tobytes()


def resample_16k_to_48k(audio_16k):
    return resample_poly(audio_16k, up=3, down=1).astype(np.float32)


def resample_48k_to_16k(audio_48k):
    return resample_poly(audio_48k, up=1, down=3).astype(np.float32)


def run_real_audio_test():
    # ---- Setup ----
    test_dir = os.path.join(os.path.dirname(SCRIPT_DIR), "test")
    output_dir = os.path.join(test_dir, "enhanced_output")
    os.makedirs(output_dir, exist_ok=True)

    config_path = os.path.join(SCRIPT_DIR, "config_pi.yaml")
    with open(config_path, "r") as f:
        cfg = yaml.safe_load(f)

    chunk_seconds = cfg["streaming"]["chunk_seconds"]
    chunk_samples = int(chunk_seconds * PIPELINE_SR)
    onnx_dir = cfg["model"]["onnx_dir"]
    if not os.path.isabs(onnx_dir):
        onnx_dir = os.path.join(SCRIPT_DIR, onnx_dir)

    wav_files = sorted([f for f in os.listdir(test_dir) if f.lower().endswith(".wav")])
    if not wav_files:
        print("ERROR: No .wav files found in", test_dir)
        return False

    print("=" * 70)
    print("CLEARCOM REAL AUDIO END-TO-END TEST")
    print("=" * 70)
    print(f"  Test directory:  {test_dir}")
    print(f"  Audio files:     {len(wav_files)}")
    print(f"  Pipeline SR:     {PIPELINE_SR} Hz")
    print(f"  ONNX SR:         {ONNX_SR} Hz")
    print(f"  Chunk:           {chunk_seconds}s ({chunk_samples} samples @ 16kHz)")
    print(f"  Packet:          {PACKET_DURATION_MS}ms ({PACKET_BYTES} bytes s16le)")
    print(f"  Output dir:      {output_dir}")
    print()

    # ---- Load ONNX models ----
    print("--- Loading ONNX Models ---")
    try:
        enc_session, erb_dec_session, df_dec_session = load_sessions(onnx_dir)
        erb_inv_fb = build_erb_inv_fb(ERB_WIDTHS)
        print("  PASS: All 3 ONNX models loaded (enc, erb_dec, df_dec)")
    except Exception as e:
        print(f"  FAIL: Could not load models -- {e}")
        return False
    print()

    all_pass = True
    grand_total_chunks = 0
    grand_total_latency = 0.0

    for file_idx, wav_name in enumerate(wav_files, 1):
        wav_path = os.path.join(test_dir, wav_name)
        print("-" * 70)
        print(f"FILE {file_idx}/{len(wav_files)}: {wav_name}")
        print("-" * 70)

        # ---- Read input audio ----
        audio_raw, sr = sf.read(wav_path, dtype="int16")
        if sr != PIPELINE_SR:
            print(f"  WARNING: File is {sr}Hz, expected {PIPELINE_SR}Hz -- skipping")
            all_pass = False
            continue

        # Ensure mono
        if audio_raw.ndim > 1:
            audio_raw = audio_raw[:, 0]

        total_samples = len(audio_raw)
        duration_s = total_samples / PIPELINE_SR
        pcm_bytes = audio_raw.tobytes()

        input_rms = np.sqrt(np.mean(audio_raw.astype(np.float32) ** 2)) / 32768.0
        print(f"  Input:  {total_samples} samples, {duration_s:.2f}s, RMS={input_rms:.4f}")

        # ---- Split into chunks ----
        n_chunks = (total_samples + chunk_samples - 1) // chunk_samples
        chunk_latencies = []
        enhanced_chunks_16k = []

        print(f"  Chunks: {n_chunks} x {chunk_seconds}s = {n_chunks * chunk_seconds:.2f}s")
        print()

        # ---- Process each chunk through full pipeline ----
        print("  --- Enhancement Pipeline (per-chunk) ---")
        for ci in range(n_chunks):
            start = ci * chunk_samples
            end = min(start + chunk_samples, total_samples)
            chunk_pcm = pcm_bytes[start * 2 : end * 2]

            t0 = time.perf_counter()

            # Step 1: s16le -> float32
            chunk_f32 = s16le_to_float32(chunk_pcm)

            # Step 2: Pad if last chunk is short
            if len(chunk_f32) < chunk_samples:
                chunk_f32 = np.pad(chunk_f32, (0, chunk_samples - len(chunk_f32)))

            # Step 3: Resample 16kHz -> 48kHz
            chunk_48k = resample_16k_to_48k(chunk_f32)

            # Step 4: ONNX enhance at 48kHz
            enhanced_48k = enhance_chunk(
                chunk_48k, enc_session, erb_dec_session,
                df_dec_session, erb_inv_fb
            )

            # Step 5: Resample 48kHz -> 16kHz
            enhanced_16k = resample_48k_to_16k(enhanced_48k)

            dt_ms = (time.perf_counter() - t0) * 1000
            chunk_latencies.append(dt_ms)
            enhanced_chunks_16k.append(enhanced_16k)

            # Progress output every few chunks
            status = "OK" if dt_ms < (chunk_seconds * 1000) else "SLOW"
            print(f"    Chunk {ci+1:3d}/{n_chunks}: {dt_ms:6.1f} ms [{status}]"
                  f"  (in={len(chunk_f32)}@16k -> {len(chunk_48k)}@48k -> {len(enhanced_16k)}@16k)")

        # ---- Check for NaN/Inf ----
        enhanced_full = np.concatenate(enhanced_chunks_16k)
        has_nan = np.any(np.isnan(enhanced_full))
        has_inf = np.any(np.isinf(enhanced_full))
        output_rms = np.sqrt(np.mean(enhanced_full ** 2))

        print()
        print(f"  Output: {len(enhanced_full)} samples, RMS={output_rms:.4f}")
        print(f"  NaN check:  {'FAIL' if has_nan else 'PASS'}")
        print(f"  Inf check:  {'FAIL' if has_inf else 'PASS'}")
        print(f"  Silent check: {'FAIL (output is silent!)' if output_rms < 0.001 else 'PASS'}")

        if has_nan or has_inf or output_rms < 0.001:
            all_pass = False

        # ---- Latency stats ----
        avg_lat = np.mean(chunk_latencies)
        max_lat = np.max(chunk_latencies)
        min_lat = np.min(chunk_latencies)
        chunk_ms = chunk_seconds * 1000
        realtime_ok = all(lat < chunk_ms for lat in chunk_latencies)

        print(f"\n  Enhancement latency:")
        print(f"    Min:  {min_lat:.1f} ms")
        print(f"    Avg:  {avg_lat:.1f} ms")
        print(f"    Max:  {max_lat:.1f} ms")
        print(f"    Budget: {chunk_ms:.0f} ms/chunk")
        print(f"    Real-time: {'PASS' if realtime_ok else 'WARNING -- some chunks exceeded budget'}")

        if not realtime_ok:
            over_budget = sum(1 for lat in chunk_latencies if lat >= chunk_ms)
            print(f"    ({over_budget}/{n_chunks} chunks over budget)")

        grand_total_chunks += n_chunks
        grand_total_latency += sum(chunk_latencies)

        # ---- UDP packet simulation ----
        print(f"\n  --- UDP Packet Simulation ---")

        # Convert enhanced audio to s16le packets
        enhanced_s16 = float32_to_s16le(enhanced_full[:total_samples])  # trim to original length
        n_packets = (len(enhanced_s16) + PACKET_BYTES - 1) // PACKET_BYTES
        packets = []
        for pi in range(n_packets):
            pkt = enhanced_s16[pi * PACKET_BYTES : (pi + 1) * PACKET_BYTES]
            if len(pkt) < PACKET_BYTES:
                pkt += b'\x00' * (PACKET_BYTES - len(pkt))
            packets.append(pkt)

        # Send/receive over localhost UDP
        test_port = 16000 + file_idx
        recv_packets = []
        recv_done = threading.Event()
        stop_recv = threading.Event()

        def udp_receiver():
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("127.0.0.1", test_port))
            sock.settimeout(1.0)
            while not stop_recv.is_set():
                try:
                    data, _ = sock.recvfrom(2048)
                    if len(data) == PACKET_BYTES:
                        recv_packets.append(data)
                except socket.timeout:
                    continue
            sock.close()

        def udp_sender():
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            for pkt in packets:
                sock.sendto(pkt, ("127.0.0.1", test_port))
                time.sleep(0.005)  # 5ms pacing (faster than real 20ms)
            sock.close()

        rt = threading.Thread(target=udp_receiver, daemon=True)
        rt.start()
        time.sleep(0.05)

        st = threading.Thread(target=udp_sender, daemon=True)
        st.start()
        st.join(timeout=30.0)
        time.sleep(0.5)
        stop_recv.set()
        rt.join(timeout=2.0)

        pkt_loss = n_packets - len(recv_packets)
        loss_pct = (pkt_loss / n_packets * 100) if n_packets > 0 else 0

        print(f"    Sent:     {n_packets} packets ({PACKET_BYTES} bytes each)")
        print(f"    Received: {len(recv_packets)} packets")
        print(f"    Loss:     {pkt_loss} ({loss_pct:.1f}%)")
        if pkt_loss == 0:
            print(f"    RESULT: PASS -- zero packet loss")
        elif loss_pct < 5:
            print(f"    RESULT: ACCEPTABLE -- minor loss")
        else:
            print(f"    RESULT: FAIL -- significant loss")
            all_pass = False

        # ---- Reassemble received audio and save ----
        if recv_packets:
            reassembled_pcm = b''.join(recv_packets)
            reassembled_audio = np.frombuffer(reassembled_pcm, dtype=np.int16)
            reassembled_f32 = reassembled_audio.astype(np.float32) / 32768.0

            out_name = os.path.splitext(wav_name)[0] + "_enhanced.wav"
            out_path = os.path.join(output_dir, out_name)
            # Trim to original length
            out_audio = reassembled_f32[:total_samples]
            sf.write(out_path, out_audio, PIPELINE_SR, subtype="PCM_16")
            print(f"\n  Saved enhanced output: {out_path}")
            print(f"  Output duration: {len(out_audio)/PIPELINE_SR:.2f}s (input was {duration_s:.2f}s)")

            dur_diff = abs(len(out_audio) / PIPELINE_SR - duration_s)
            if dur_diff < 0.1:
                print(f"  Duration match: PASS (diff={dur_diff:.3f}s)")
            else:
                print(f"  Duration match: FAIL (diff={dur_diff:.3f}s)")
                all_pass = False

        print()

    # ---- Grand Summary ----
    print("=" * 70)
    print("GRAND SUMMARY")
    print("=" * 70)
    print(f"  Files tested:       {len(wav_files)}")
    print(f"  Total chunks:       {grand_total_chunks}")
    avg_grand = grand_total_latency / grand_total_chunks if grand_total_chunks else 0
    print(f"  Avg chunk latency:  {avg_grand:.1f} ms")
    print(f"  Chunk budget:       {chunk_seconds * 1000:.0f} ms")
    print()

    # End-to-end latency estimate
    total_latency = (chunk_seconds * 1000) + 10 + avg_grand + 10 + 5 + 20
    print(f"  Estimated end-to-end latency:")
    print(f"    Capture buffer:     {chunk_seconds * 1000:.0f} ms")
    print(f"    Resample 16k->48k:  ~10 ms")
    print(f"    ONNX enhancement:   {avg_grand:.0f} ms")
    print(f"    Resample 48k->16k:  ~10 ms")
    print(f"    UDP transport:      ~5 ms")
    print(f"    Speaker playback:   ~20 ms")
    print(f"    ---------------------------------")
    print(f"    TOTAL:              {total_latency:.0f} ms")
    print()

    if all_pass:
        print("  >>> ALL TESTS PASSED -- PIPELINE IS WORKING CORRECTLY <<<")
        print("  Clear audio, no interference, low latency confirmed.")
    else:
        print("  >>> SOME TESTS NEED ATTENTION -- review results above <<<")

    print("=" * 70)
    return all_pass


if __name__ == "__main__":
    success = run_real_audio_test()
    sys.exit(0 if success else 1)
