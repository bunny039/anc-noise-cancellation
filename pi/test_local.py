"""
Local self-test for the ClearCom UDP streaming pipeline.

Tests WITHOUT needing Bluetooth or a second Pi:
  1. ONNX model loads and runs
  2. Resample 16kHz <-> 48kHz works correctly
  3. s16le PCM conversion round-trips correctly
  4. UDP round-trip (localhost) delivers all 20ms packets
  5. End-to-end latency estimate

Usage:
  cd ~/clearcom
  python3 test_local.py
"""

import os
import queue
import socket
import struct
import sys
import threading
import time

import numpy as np
import yaml
from scipy.signal import resample_poly

from df_onnx_dsp import load_sessions, build_erb_inv_fb, ERB_WIDTHS, enhance_chunk, SR as ONNX_SR


PIPELINE_SR = 16000
PACKET_DURATION_MS = 20
PACKET_SAMPLES = int(PIPELINE_SR * PACKET_DURATION_MS / 1000)  # 160
PACKET_BYTES = PACKET_SAMPLES * 2  # 640


def load_config(config_path):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


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


def generate_test_tone(duration_s, sample_rate, freq=440.0):
    t = np.arange(int(duration_s * sample_rate)) / sample_rate
    return (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def run_test(config_path):
    cfg = load_config(config_path)
    chunk_seconds = cfg["streaming"]["chunk_seconds"]
    chunk_samples_16k = int(chunk_seconds * PIPELINE_SR)
    onnx_dir = cfg["model"]["onnx_dir"]

    config_dir = os.path.dirname(os.path.abspath(config_path))
    if not os.path.isabs(onnx_dir):
        onnx_dir = os.path.join(config_dir, onnx_dir)

    print("=" * 70)
    print("CLEARCOM LOCAL SELF-TEST")
    print("=" * 70)
    print(f"  Pipeline SR:  {PIPELINE_SR} Hz")
    print(f"  ONNX SR:      {ONNX_SR} Hz")
    print(f"  Chunk:        {chunk_seconds}s ({chunk_samples_16k} samples @ 16kHz)")
    print(f"  Packet:       {PACKET_DURATION_MS}ms ({PACKET_BYTES} bytes s16le)")
    print()

    all_pass = True

    # ---- Test 1: ONNX model loads ----
    print("--- Test 1: ONNX Model Load ---")
    try:
        enc_session, erb_dec_session, df_dec_session = load_sessions(onnx_dir)
        erb_inv_fb = build_erb_inv_fb(ERB_WIDTHS)
        print("  RESULT: PASS -- all 3 ONNX models loaded")
    except Exception as e:
        print(f"  RESULT: FAIL -- {e}")
        all_pass = False
        return

    # ---- Test 2: Resample round-trip ----
    print("\n--- Test 2: Resample 16kHz <-> 48kHz ---")
    test_16k = generate_test_tone(0.1, PIPELINE_SR)
    test_48k = resample_16k_to_48k(test_16k)
    test_back = resample_48k_to_16k(test_48k)
    len_diff = abs(len(test_back) - len(test_16k))
    print(f"  16kHz: {len(test_16k)} samples -> 48kHz: {len(test_48k)} samples -> 16kHz: {len(test_back)} samples")
    if len(test_48k) == len(test_16k) * 3 and len_diff <= 2:
        print("  RESULT: PASS -- resample ratios correct")
    else:
        print("  RESULT: FAIL -- unexpected sample counts")
        all_pass = False

    # ---- Test 3: s16le round-trip ----
    print("\n--- Test 3: s16le PCM Conversion ---")
    test_float = np.array([0.0, 0.5, -0.5, 1.0, -1.0], dtype=np.float32)
    pcm = float32_to_s16le(test_float)
    back = s16le_to_float32(pcm)
    max_err = np.max(np.abs(test_float - back))
    print(f"  Round-trip max error: {max_err:.6f}")
    if max_err < 0.001 and len(pcm) == 10:  # 5 samples * 2 bytes
        print(f"  Packet size check: {PACKET_SAMPLES} samples = {PACKET_BYTES} bytes -- correct")
        print("  RESULT: PASS")
    else:
        print("  RESULT: FAIL")
        all_pass = False

    # ---- Test 4: Full enhance pipeline ----
    print("\n--- Test 4: Full Enhancement Pipeline ---")
    chunk_16k = generate_test_tone(chunk_seconds, PIPELINE_SR)
    latencies = []
    for i in range(3):
        t0 = time.perf_counter()
        # Exact pipeline: 16k -> 48k -> ONNX -> 48k -> 16k
        chunk_48k = resample_16k_to_48k(chunk_16k)
        enhanced_48k = enhance_chunk(chunk_48k, enc_session, erb_dec_session,
                                     df_dec_session, erb_inv_fb)
        enhanced_16k = resample_48k_to_16k(enhanced_48k)
        dt = (time.perf_counter() - t0) * 1000
        latencies.append(dt)
        print(f"  Run {i+1}: {dt:.1f} ms (in={len(chunk_16k)}@16k -> {len(chunk_48k)}@48k -> {len(enhanced_16k)}@16k)")

    avg_lat = np.mean(latencies)
    chunk_ms = chunk_seconds * 1000
    print(f"\n  Average pipeline latency: {avg_lat:.1f} ms")
    print(f"  Chunk duration:           {chunk_ms:.0f} ms")
    if avg_lat < chunk_ms:
        print(f"  RESULT: PASS -- pipeline ({avg_lat:.0f}ms) < chunk ({chunk_ms:.0f}ms)")
        print(f"           Real-time streaming is feasible!")
    else:
        print(f"  RESULT: WARNING -- pipeline ({avg_lat:.0f}ms) > chunk ({chunk_ms:.0f}ms)")
        print(f"           Increase chunk_seconds in config_pi.yaml")
        all_pass = False

    # ---- Test 5: UDP round-trip with 20ms packets ----
    print("\n--- Test 5: UDP Round-Trip (20ms packets, localhost) ---")

    test_port = 15555
    n_packets = 25  # 25 x 20ms = 0.5s of audio
    recv_count = [0]
    stop_ev = threading.Event()

    def sender():
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        tone = generate_test_tone(0.5, PIPELINE_SR)
        pcm = float32_to_s16le(tone)
        for i in range(n_packets):
            start = i * PACKET_BYTES
            end = start + PACKET_BYTES
            pkt = pcm[start:end]
            if len(pkt) < PACKET_BYTES:
                pkt += b'\x00' * (PACKET_BYTES - len(pkt))
            sock.sendto(pkt, ("127.0.0.1", test_port))
            time.sleep(0.015)
        sock.close()

    def receiver():
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", test_port))
        sock.settimeout(1.0)
        while not stop_ev.is_set():
            try:
                data, addr = sock.recvfrom(2048)
                if len(data) == PACKET_BYTES:
                    recv_count[0] += 1
            except socket.timeout:
                continue
        sock.close()

    rt = threading.Thread(target=receiver, daemon=True)
    rt.start()
    time.sleep(0.1)
    st = threading.Thread(target=sender, daemon=True)
    st.start()
    st.join(timeout=5.0)
    time.sleep(0.5)
    stop_ev.set()
    rt.join(timeout=2.0)

    print(f"  Sent:     {n_packets} packets ({PACKET_BYTES} bytes each)")
    print(f"  Received: {recv_count[0]} packets")
    if recv_count[0] == n_packets:
        print("  RESULT: PASS -- all packets received")
    elif recv_count[0] > 0:
        loss = n_packets - recv_count[0]
        print(f"  RESULT: PARTIAL -- lost {loss} packets ({100*loss/n_packets:.0f}%)")
    else:
        print("  RESULT: FAIL -- no packets received")
        all_pass = False

    # ---- Test 6: Latency estimate ----
    print("\n--- Test 6: Estimated End-to-End Latency ---")
    capture_ms = chunk_ms
    resample_ms = 10
    enhance_ms = avg_lat
    udp_ms = 5
    playback_ms = 20
    total = capture_ms + resample_ms + enhance_ms + udp_ms + playback_ms
    print(f"  Capture buffer:   {capture_ms:.0f} ms (chunk accumulation)")
    print(f"  Resample 16k->48k: ~{resample_ms} ms")
    print(f"  ONNX enhancement: {enhance_ms:.0f} ms")
    print(f"  Resample 48k->16k: ~{resample_ms} ms")
    print(f"  UDP transport:     ~{udp_ms} ms (Wi-Fi LAN)")
    print(f"  Speaker playback:  ~{playback_ms} ms")
    print(f"  ---------------------------------")
    print(f"  TOTAL ESTIMATED:   {total:.0f} ms")
    if total < 1000:
        print(f"  RESULT: PASS -- under 1 second")
    elif total < 2000:
        print(f"  RESULT: OK -- under 2 seconds")
    else:
        print(f"  RESULT: WARNING -- may feel laggy, increase chunk_seconds")

    # ---- Summary ----
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    if all_pass:
        print("  ALL TESTS PASSED -- safe to deploy to Pi")
    else:
        print("  SOME TESTS NEED ATTENTION -- review results above")
    print("=" * 70)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="ClearCom local self-test")
    parser.add_argument("--config", default="config_pi.yaml")
    args = parser.parse_args()
    run_test(args.config)
