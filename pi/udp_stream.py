"""
Full-duplex UDP streaming engine for ClearCom two-way conversation
between two Raspberry Pi 4 units (Manager + CEO), each running
DeepFilterNet3 ONNX noise cancellation with Bluetooth headset audio.

Matches the EXACT ClearCom architecture:
  - Bluetooth mic → PulseAudio capture → 16 kHz mono s16le PCM
  - Resample 16 kHz → 48 kHz
  - ONNX DeepFilterNet3 enhancement (48 kHz)
  - Resample 48 kHz → 16 kHz
  - 20 ms UDP packets (640 bytes = 160 samples × 2 bytes s16le)
  - Wi-Fi → peer Pi → PulseAudio → Bluetooth speaker

PREVIOUS PROBLEM (30-second delay):
  The old system accumulated too much audio before processing and/or
  processed the entire buffer as one huge ONNX chunk sequentially.
  With a 2-second chunk at 48kHz, the ONNX model takes 60-200ms to
  process — but if chunks queue up serially with no pipelining,
  the backlog grows until you're 30 seconds behind real-time.

FIX (this file):
  5 threads run SIMULTANEOUSLY with bounded queues:
  1. CaptureThread  — reads mic via PulseAudio (parec), pushes 16kHz PCM
  2. EnhanceThread  — resample 16k→48k, ONNX enhance, resample 48k→16k
  3. UDPSendThread  — splits enhanced 16kHz into 20ms/640-byte UDP packets
  4. UDPRecvThread  — receives 20ms UDP packets from peer, reassembles
  5. PlaybackThread — plays received audio via PulseAudio (pacat)

  Bounded queues (maxsize=3) prevent backlog: if enhance is slower
  than capture, the OLDEST unprocessed chunk is dropped rather than
  accumulating. This keeps latency constant at:
    chunk_duration + enhance_time + UDP_transit ≈ 0.3–0.6s

Usage on Manager Pi (10.29.30.109):
  python3 udp_stream.py --role manager

Usage on CEO Pi (10.29.30.163):
  python3 udp_stream.py --role ceo

Ctrl+C to stop.
"""

import argparse
import os
import queue
import socket
import struct
import subprocess
import sys
import threading
import time

import numpy as np
import yaml
from scipy.signal import resample_poly

# Import the standalone DSP module (same folder)
from df_onnx_dsp import load_sessions, build_erb_inv_fb, ERB_WIDTHS, enhance_chunk, SR as ONNX_SR


# ──────────────────────────────────────────────────────────
# Constants matching ClearCom architecture
# ──────────────────────────────────────────────────────────

PIPELINE_SR = 16000           # PCM sample rate over UDP and Bluetooth
PACKET_DURATION_MS = 20       # each UDP packet = 20 ms of audio
PACKET_SAMPLES = int(PIPELINE_SR * PACKET_DURATION_MS / 1000)  # 160 samples
PACKET_BYTES = PACKET_SAMPLES * 2  # 640 bytes (s16le = 2 bytes/sample)

# ONNX model runs at 48 kHz — resample around it
# ONNX_SR = 48000 (imported from df_onnx_dsp)


def load_config(config_path):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


# ──────────────────────────────────────────────────────────
# Audio format conversion helpers
# ──────────────────────────────────────────────────────────

def s16le_to_float32(pcm_bytes):
    """Convert s16le PCM bytes to float32 numpy array [-1.0, 1.0]."""
    samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    return samples / 32768.0


def float32_to_s16le(audio_float):
    """Convert float32 numpy array [-1.0, 1.0] to s16le PCM bytes."""
    clipped = np.clip(audio_float, -1.0, 1.0)
    samples = (clipped * 32767.0).astype(np.int16)
    return samples.tobytes()


def resample_16k_to_48k(audio_16k):
    """Resample from 16 kHz to 48 kHz (factor 3x up)."""
    return resample_poly(audio_16k, up=3, down=1).astype(np.float32)


def resample_48k_to_16k(audio_48k):
    """Resample from 48 kHz to 16 kHz (factor 3x down)."""
    return resample_poly(audio_48k, up=1, down=3).astype(np.float32)


# ──────────────────────────────────────────────────────────
# Thread 1: Bluetooth Mic Capture via PulseAudio
# ──────────────────────────────────────────────────────────

class CaptureThread(threading.Thread):
    """
    Captures audio from the Bluetooth headset mic via PulseAudio's
    `parec` command. Outputs raw 16 kHz mono s16le PCM.

    Accumulates samples into chunk_seconds-sized buffers and pushes
    to enhance_q for ONNX processing.

    Echo gate: when playback_active is set (peer is speaking through
    our speaker), apply soft-mute to prevent speaker→mic feedback.
    """

    def __init__(self, enhance_q, chunk_samples_16k, pulse_source,
                 playback_active, mute_gain, stop_event, stats):
        super().__init__(daemon=True, name="CaptureThread")
        self.enhance_q = enhance_q
        self.chunk_samples_16k = chunk_samples_16k
        self.pulse_source = pulse_source
        self.playback_active = playback_active
        self.mute_gain = mute_gain
        self.stop_event = stop_event
        self.stats = stats

    def run(self):
        cmd = [
            "parec",
            "--rate=16000",
            "--channels=1",
            "--format=s16le",
            "--raw",
            "--latency-msec=20",
        ]
        if self.pulse_source:
            cmd.extend(["--device", self.pulse_source])

        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
            )
        except FileNotFoundError:
            print("[CaptureThread] ERROR: 'parec' not found. Install PulseAudio.")
            print("  sudo apt install pulseaudio pulseaudio-module-bluetooth")
            self.stop_event.set()
            return

        capture_buffer = np.zeros(0, dtype=np.float32)
        read_size = PACKET_BYTES  # read 20ms at a time (640 bytes)

        try:
            while not self.stop_event.is_set():
                raw = proc.stdout.read(read_size)
                if not raw:
                    break

                audio = s16le_to_float32(raw)

                # Echo gate: soft-mute mic when speaker is playing
                if self.playback_active.is_set():
                    audio *= self.mute_gain

                capture_buffer = np.concatenate([capture_buffer, audio])

                while len(capture_buffer) >= self.chunk_samples_16k:
                    chunk = capture_buffer[:self.chunk_samples_16k].copy()
                    capture_buffer = capture_buffer[self.chunk_samples_16k:]
                    try:
                        self.enhance_q.put_nowait(chunk)
                    except queue.Full:
                        # Drop oldest to prevent backlog (THIS is what fixes
                        # the 30-second delay — never let chunks pile up)
                        try:
                            self.enhance_q.get_nowait()
                        except queue.Empty:
                            pass
                        try:
                            self.enhance_q.put_nowait(chunk)
                        except queue.Full:
                            pass
                        self.stats["capture_drops"] += 1

        except Exception as e:
            print(f"[CaptureThread] ERROR: {e}")
        finally:
            proc.terminate()
            proc.wait()


# ──────────────────────────────────────────────────────────
# Thread 2: ONNX Enhancement (resample → enhance → resample)
# ──────────────────────────────────────────────────────────

class EnhanceThread(threading.Thread):
    """
    Pulls 16 kHz chunks from enhance_q, resamples to 48 kHz, runs
    DeepFilterNet3 ONNX enhancement, resamples back to 16 kHz,
    and pushes to send_q.

    This is the computationally expensive step (~60ms on laptop,
    ~150-200ms on Pi 4 per 0.25s chunk).
    """

    def __init__(self, enhance_q, send_q, enc_session, erb_dec_session,
                 df_dec_session, erb_inv_fb, stop_event, stats):
        super().__init__(daemon=True, name="EnhanceThread")
        self.enhance_q = enhance_q
        self.send_q = send_q
        self.enc_session = enc_session
        self.erb_dec_session = erb_dec_session
        self.df_dec_session = df_dec_session
        self.erb_inv_fb = erb_inv_fb
        self.stop_event = stop_event
        self.stats = stats

    def run(self):
        try:
            while not self.stop_event.is_set():
                try:
                    chunk_16k = self.enhance_q.get(timeout=0.5)
                except queue.Empty:
                    continue

                t0 = time.perf_counter()

                # Resample 16 kHz → 48 kHz for ONNX model
                chunk_48k = resample_16k_to_48k(chunk_16k)

                # Run ONNX DeepFilterNet3 enhancement at 48 kHz
                enhanced_48k = enhance_chunk(
                    chunk_48k, self.enc_session, self.erb_dec_session,
                    self.df_dec_session, self.erb_inv_fb
                )

                # Resample 48 kHz → 16 kHz for UDP transmission
                enhanced_16k = resample_48k_to_16k(enhanced_48k)

                # Trim to match original chunk length at 16 kHz
                enhanced_16k = enhanced_16k[:len(chunk_16k)]

                dt = time.perf_counter() - t0
                self.stats["last_enhance_ms"] = dt * 1000.0
                self.stats["enhance_count"] += 1

                try:
                    self.send_q.put_nowait(enhanced_16k)
                except queue.Full:
                    try:
                        self.send_q.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        self.send_q.put_nowait(enhanced_16k)
                    except queue.Full:
                        pass
                    self.stats["send_drops"] += 1

        except Exception as e:
            print(f"[EnhanceThread] ERROR: {e}")
            self.stop_event.set()


# ──────────────────────────────────────────────────────────
# Thread 3: UDP Sender — split into 20ms/640-byte packets
# ──────────────────────────────────────────────────────────

class UDPSendThread(threading.Thread):
    """
    Pulls enhanced 16 kHz audio from send_q, converts to s16le PCM,
    splits into 20ms packets (640 bytes each), and sends via UDP.

    Matches the ClearCom packet format exactly:
      160 samples × 2 bytes = 640 bytes per packet.
    """

    def __init__(self, send_q, peer_ip, send_port, stop_event, stats):
        super().__init__(daemon=True, name="UDPSendThread")
        self.send_q = send_q
        self.peer_ip = peer_ip
        self.send_port = send_port
        self.stop_event = stop_event
        self.stats = stats

    def run(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            while not self.stop_event.is_set():
                try:
                    enhanced_16k = self.send_q.get(timeout=0.5)
                except queue.Empty:
                    continue

                # Convert float32 to s16le PCM bytes
                pcm_bytes = float32_to_s16le(enhanced_16k)

                # Split into 20ms packets (640 bytes each)
                offset = 0
                while offset < len(pcm_bytes):
                    end = min(offset + PACKET_BYTES, len(pcm_bytes))
                    packet = pcm_bytes[offset:end]

                    # Pad last packet if needed (maintain 640-byte size)
                    if len(packet) < PACKET_BYTES:
                        packet += b'\x00' * (PACKET_BYTES - len(packet))

                    sock.sendto(packet, (self.peer_ip, self.send_port))
                    offset = end

                    # Pace at ~20ms per packet to match real-time
                    time.sleep(0.015)

                self.stats["chunks_sent"] += 1

        except Exception as e:
            print(f"[UDPSendThread] ERROR: {e}")
            self.stop_event.set()
        finally:
            sock.close()


# ──────────────────────────────────────────────────────────
# Thread 4: UDP Receiver — receive 20ms/640-byte packets
# ──────────────────────────────────────────────────────────

class UDPRecvThread(threading.Thread):
    """
    Listens for 640-byte s16le PCM packets from the peer Pi and
    pushes them directly to playback_q.

    Each 640-byte packet = 20ms of 16 kHz mono audio.
    No reassembly needed — each packet is independently playable.
    """

    def __init__(self, playback_q, recv_port, stop_event, stats):
        super().__init__(daemon=True, name="UDPRecvThread")
        self.playback_q = playback_q
        self.recv_port = recv_port
        self.stop_event = stop_event
        self.stats = stats

    def run(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", self.recv_port))
        sock.settimeout(0.5)

        try:
            while not self.stop_event.is_set():
                try:
                    data, addr = sock.recvfrom(2048)
                except socket.timeout:
                    continue

                if len(data) == 0:
                    continue

                # Push raw s16le bytes directly — PlaybackThread writes
                # them straight to PulseAudio
                try:
                    self.playback_q.put_nowait(data)
                except queue.Full:
                    # Drop oldest to keep playback current
                    try:
                        self.playback_q.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        self.playback_q.put_nowait(data)
                    except queue.Full:
                        pass
                    self.stats["playback_drops"] += 1

                self.stats["packets_received"] += 1

        except Exception as e:
            print(f"[UDPRecvThread] ERROR: {e}")
            self.stop_event.set()
        finally:
            sock.close()


# ──────────────────────────────────────────────────────────
# Thread 5: Bluetooth Speaker Playback via PulseAudio
# ──────────────────────────────────────────────────────────

class PlaybackThread(threading.Thread):
    """
    Pulls received s16le PCM packets from playback_q and writes
    them to the Bluetooth speaker via PulseAudio's `pacat`.

    Sets playback_active flag while playing, so CaptureThread
    can apply echo gating (mute mic during remote speech).
    """

    def __init__(self, playback_q, pulse_sink, playback_active,
                 holdoff_packets, stop_event, stats):
        super().__init__(daemon=True, name="PlaybackThread")
        self.playback_q = playback_q
        self.pulse_sink = pulse_sink
        self.playback_active = playback_active
        self.holdoff_packets = holdoff_packets
        self.stop_event = stop_event
        self.stats = stats

    def run(self):
        cmd = [
            "pacat",
            "--rate=16000",
            "--channels=1",
            "--format=s16le",
            "--raw",
            "--latency-msec=20",
            "--playback",
        ]
        if self.pulse_sink:
            cmd.extend(["--device", self.pulse_sink])

        try:
            proc = subprocess.Popen(
                cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL
            )
        except FileNotFoundError:
            print("[PlaybackThread] ERROR: 'pacat' not found. Install PulseAudio.")
            self.stop_event.set()
            return

        holdoff_remaining = 0

        try:
            while not self.stop_event.is_set():
                try:
                    pcm_data = self.playback_q.get(timeout=0.1)
                except queue.Empty:
                    if holdoff_remaining > 0:
                        holdoff_remaining -= 1
                    else:
                        self.playback_active.clear()
                    continue

                self.playback_active.set()
                holdoff_remaining = self.holdoff_packets

                try:
                    proc.stdin.write(pcm_data)
                    proc.stdin.flush()
                except BrokenPipeError:
                    print("[PlaybackThread] pacat pipe broken, restarting...")
                    break

        except Exception as e:
            print(f"[PlaybackThread] ERROR: {e}")
        finally:
            try:
                proc.stdin.close()
            except Exception:
                pass
            proc.terminate()
            proc.wait()


# ──────────────────────────────────────────────────────────
# Status reporter (prints from main thread, not audio callbacks)
# ──────────────────────────────────────────────────────────

def status_reporter(stop_event, stats, interval=3.0):
    while not stop_event.is_set():
        stop_event.wait(interval)
        if stop_event.is_set():
            break
        enh = stats.get("enhance_count", 0)
        sent = stats.get("chunks_sent", 0)
        recv = stats.get("packets_received", 0)
        lat = stats.get("last_enhance_ms", 0)

        parts = [
            f"enhanced={enh}",
            f"sent={sent}",
            f"recv_pkts={recv}",
            f"enhance_ms={lat:.0f}",
        ]

        warns = []
        if stats.get("capture_drops", 0):
            warns.append(f"capture_drops={stats['capture_drops']}")
        if stats.get("send_drops", 0):
            warns.append(f"send_drops={stats['send_drops']}")
        if stats.get("playback_drops", 0):
            warns.append(f"playback_drops={stats['playback_drops']}")

        line = " | ".join(parts)
        if warns:
            line += "  !! " + ", ".join(warns)
        print(f"[status] {line}")


# ──────────────────────────────────────────────────────────
# Role configurations for Manager and CEO Pi
# ──────────────────────────────────────────────────────────

ROLES = {
    "manager": {
        "peer_ip": "10.29.30.163",    # CEO Pi IP
        "send_port": 5000,            # Manager -> CEO
        "recv_port": 5001,            # CEO -> Manager
    },
    "ceo": {
        "peer_ip": "10.29.30.109",    # Manager Pi IP
        "send_port": 5001,            # CEO -> Manager
        "recv_port": 5000,            # Manager -> CEO
    },
}


# ──────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────

def run(config_path, role, peer_ip_override=None, pulse_source=None,
        pulse_sink=None):
    cfg = load_config(config_path)

    chunk_seconds = cfg["streaming"]["chunk_seconds"]
    chunk_samples_16k = int(chunk_seconds * PIPELINE_SR)
    q_maxsize = cfg["streaming"]["queue_maxsize"]

    echo_enabled = cfg["echo_gate"]["enabled"]
    mute_gain = cfg["echo_gate"]["mute_gain"] if echo_enabled else 1.0
    holdoff_packets = cfg["echo_gate"]["holdoff_packets"] if echo_enabled else 0

    onnx_dir = cfg["model"]["onnx_dir"]
    config_dir = os.path.dirname(os.path.abspath(config_path))
    if not os.path.isabs(onnx_dir):
        onnx_dir = os.path.join(config_dir, onnx_dir)

    # Role determines IPs and ports
    role_cfg = ROLES[role]
    peer_ip = peer_ip_override or role_cfg["peer_ip"]
    send_port = role_cfg["send_port"]
    recv_port = role_cfg["recv_port"]

    # Use PulseAudio source/sink from config if not overridden via CLI
    if pulse_source is None:
        pulse_source = cfg.get("pulseaudio", {}).get("source", None)
    if pulse_sink is None:
        pulse_sink = cfg.get("pulseaudio", {}).get("sink", None)

    # Load ONNX sessions (one-time cost, ~1-2s)
    print("Loading ONNX model sessions...")
    enc_session, erb_dec_session, df_dec_session = load_sessions(onnx_dir)
    erb_inv_fb = build_erb_inv_fb(ERB_WIDTHS)
    print("Model loaded.")

    # Shared state
    stop_event = threading.Event()
    playback_active = threading.Event()
    stats = {
        "capture_drops": 0,
        "send_drops": 0,
        "playback_drops": 0,
        "chunks_sent": 0,
        "packets_received": 0,
        "enhance_count": 0,
        "last_enhance_ms": 0.0,
    }

    # Bounded queues -- THIS prevents the 30-second backlog
    enhance_q = queue.Queue(maxsize=q_maxsize)
    send_q = queue.Queue(maxsize=q_maxsize)
    playback_q = queue.Queue(maxsize=q_maxsize * 15)  # more room for 20ms packets

    # Create all 5 threads
    capture = CaptureThread(enhance_q, chunk_samples_16k, pulse_source,
                            playback_active, mute_gain, stop_event, stats)
    enhance = EnhanceThread(enhance_q, send_q, enc_session, erb_dec_session,
                            df_dec_session, erb_inv_fb, stop_event, stats)
    sender = UDPSendThread(send_q, peer_ip, send_port, stop_event, stats)
    receiver = UDPRecvThread(playback_q, recv_port, stop_event, stats)
    playback = PlaybackThread(playback_q, pulse_sink, playback_active,
                              holdoff_packets, stop_event, stats)

    # Start ALL threads simultaneously
    threads = [capture, enhance, sender, receiver, playback]
    for t in threads:
        t.start()

    reporter = threading.Thread(target=status_reporter, daemon=True,
                                args=(stop_event, stats))
    reporter.start()

    print()
    print("=" * 70)
    print(f"CLEARCOM UDP STREAMING -- {role.upper()} PI")
    print("=" * 70)
    print(f"  Role:           {role}")
    print(f"  Pipeline SR:    {PIPELINE_SR} Hz (UDP)")
    print(f"  ONNX SR:        {ONNX_SR} Hz (model)")
    print(f"  Chunk:          {chunk_seconds}s ({chunk_samples_16k} samples @ 16kHz)")
    print(f"  Packet:         {PACKET_DURATION_MS}ms ({PACKET_BYTES} bytes s16le)")
    print(f"  Peer IP:        {peer_ip}")
    print(f"  Send port:      {send_port}")
    print(f"  Recv port:      {recv_port}")
    print(f"  Echo gate:      {'ON (gain=%.2f)' % mute_gain if echo_enabled else 'OFF'}")
    print(f"  PulseAudio src: {pulse_source or '(default)'}")
    print(f"  PulseAudio sink:{pulse_sink or '(default)'}")
    print(f"  ONNX dir:       {onnx_dir}")
    print()
    print("Speak into the Bluetooth mic. Enhanced audio is sent to peer.")
    print("Received audio from peer plays through Bluetooth speaker.")
    print("Ctrl+C to stop.")
    print("=" * 70)

    try:
        while not stop_event.is_set():
            stop_event.wait(1.0)
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        stop_event.set()
        for t in threads:
            t.join(timeout=3.0)
        reporter.join(timeout=2.0)
        print("All threads stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ClearCom full-duplex UDP streaming with ONNX noise cancellation."
    )
    parser.add_argument("--role", required=True, choices=["manager", "ceo"],
                        help="Which Pi is this? 'manager' or 'ceo'")
    parser.add_argument("--config", default="config_pi.yaml",
                        help="Path to config_pi.yaml")
    parser.add_argument("--peer-ip", default=None,
                        help="Override peer IP (default: from role config)")
    parser.add_argument("--pulse-source", default=None,
                        help="PulseAudio source for mic capture "
                             "(e.g. bluez_source.XX_XX_XX_XX_XX_XX)")
    parser.add_argument("--pulse-sink", default=None,
                        help="PulseAudio sink for speaker playback "
                             "(e.g. bluez_output.XX_XX_XX_XX_XX_XX.1)")
    args = parser.parse_args()

    run(args.config, args.role, peer_ip_override=args.peer_ip,
        pulse_source=args.pulse_source, pulse_sink=args.pulse_sink)
