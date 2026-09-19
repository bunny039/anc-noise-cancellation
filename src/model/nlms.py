"""
Normalized Least Mean Squares (NLMS) adaptive filter.

This is the classical DSP stage that runs AFTER DTLN in the pipeline.
Given a primary signal (DTLN output, still carrying some residual noise)
and a reference signal (something correlated with that residual noise,
e.g. a secondary mic channel or a noise estimate), NLMS adaptively learns
a filter that predicts the noise component in the primary signal from the
reference signal, then subtracts it out. Unlike plain LMS, NLMS normalizes
its step size by the instantaneous power of the reference signal, so it
adapts at a consistent rate whether the input is quiet speech or a loud
burst (gunshot, engine, wind) instead of needing one fixed step size that
compromises between stability and speed.
"""

import os
import numpy as np
import yaml


def _load_nlms_config():
    """
    Load filter_length, step_size, epsilon from configs/config.yaml.

    Path is computed relative to this file (__file__), not the current
    working directory, so this works no matter where the caller is run
    from (Cursor, a script in demo/, a test runner, etc).
    """
    this_dir = os.path.dirname(os.path.abspath(__file__))
    # src/model/nlms.py -> repo_root/configs/config.yaml
    config_path = os.path.join(this_dir, "..", "..", "configs", "config.yaml")
    config_path = os.path.normpath(config_path)

    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    nlms_cfg = config["nlms"]
    filter_length = int(nlms_cfg["filter_length"])
    step_size = float(nlms_cfg["step_size"])
    epsilon = float(nlms_cfg.get("epsilon", 1e-8))
    return filter_length, step_size, epsilon


def apply_nlms(primary_signal, reference_signal, filter_length=None,
               step_size=None, epsilon=None, relative_epsilon=1e-3):
    """
    Run NLMS adaptive filtering.

    primary_signal:   1D numpy array, the signal to be cleaned
                       (in the real pipeline: DTLN's output).
    reference_signal: 1D numpy array, same length as primary_signal,
                       correlated with the noise present in primary_signal.
    filter_length, step_size, epsilon: override values. If any is left as
                       None, all three are read from configs/config.yaml.
    relative_epsilon: NEW. The normalization floor (epsilon) is sized
                       relative to THIS reference signal's own average
                       power, not treated as a universal constant.

                       Why this matters: epsilon exists only to stop
                       norm_factor (the per-sample reference-buffer
                       energy used to normalize the step size) from
                       collapsing toward zero during near-silent
                       reference stretches. A fixed epsilon has to be
                       calibrated to SOME expected signal scale - but
                       impulsive noise (gunfire, explosions: loud bursts
                       separated by near-silence) at different target
                       SNRs gets scaled to wildly different absolute
                       power levels. A constant tuned safe for one scale
                       can sit right at the edge of another file's quiet
                       stretches, letting the normalization gain
                       (step_size / norm_factor) spike and the filter
                       diverge - confirmed empirically: files where the
                       instantaneous buffer power dropped near a FIXED
                       1e-8 floor reliably produced catastrophic (-20 to
                       -50dB) results, while files whose quiet stretches
                       stayed well above it converged cleanly.

                       Fix: epsilon_effective = max(epsilon,
                       relative_epsilon * mean(reference_signal ** 2)),
                       computed ONCE from the whole file before the loop.
                       Sizing it to this specific file's own average
                       power (rather than smoothing sample-by-sample,
                       which has its own initialization pitfalls) means
                       "near silent" is judged relative to how loud this
                       clip normally is, not against an arbitrary global
                       constant. relative_epsilon=1e-3 means: don't let
                       the floor imply an implied gain steeper than
                       1000x the level this file's average reference
                       power would give you.

    Returns: filtered_signal, a 1D numpy array the same length as
             primary_signal (the error signal after adaptive noise removal).
    """
    if filter_length is None or step_size is None or epsilon is None:
        cfg_filter_length, cfg_step_size, cfg_epsilon = _load_nlms_config()
        filter_length = filter_length if filter_length is not None else cfg_filter_length
        step_size = step_size if step_size is not None else cfg_step_size
        epsilon = epsilon if epsilon is not None else cfg_epsilon

    primary_signal = np.asarray(primary_signal, dtype=np.float64)
    reference_signal = np.asarray(reference_signal, dtype=np.float64)

    if primary_signal.shape != reference_signal.shape:
        raise ValueError(
            f"primary_signal and reference_signal must have the same shape, "
            f"got {primary_signal.shape} and {reference_signal.shape}"
        )

    # Size the normalization floor to THIS file's own reference power,
    # computed once up front (offline - we already have the whole signal
    # in memory, this isn't true sample-by-sample streaming yet).
    ref_power_estimate = float(np.mean(reference_signal ** 2))
    epsilon_effective = max(epsilon, relative_epsilon * ref_power_estimate)

    num_samples = primary_signal.shape[0]
    weights = np.zeros(filter_length, dtype=np.float64)
    ref_buffer = np.zeros(filter_length, dtype=np.float64)
    filtered_signal = np.zeros(num_samples, dtype=np.float64)

    for n in range(num_samples):
        # Shift newest reference sample into the buffer (most recent first)
        ref_buffer[1:] = ref_buffer[:-1]
        ref_buffer[0] = reference_signal[n]

        predicted_noise = np.dot(weights, ref_buffer)
        error = primary_signal[n] - predicted_noise
        filtered_signal[n] = error

        # Normalization: step size scaled by instantaneous reference power.
        # epsilon_effective (file-relative, not a hardcoded constant) avoids
        # both division-by-zero AND the gain-spike-on-quiet-stretch failure
        # mode this fix addresses.
        norm_factor = np.dot(ref_buffer, ref_buffer) + epsilon_effective
        weights += (step_size / norm_factor) * error * ref_buffer

    return filtered_signal


if __name__ == "__main__":
    # Self-test on a synthetic signal: clean tone + noise, where the noise
    # is correlated with a reference (simulating a second mic channel
    # picking up mostly the same noise source).
    rng = np.random.default_rng(42)
    sample_rate = 16000
    duration_sec = 2.0
    t = np.arange(int(sample_rate * duration_sec)) / sample_rate

    clean = 0.5 * np.sin(2 * np.pi * 220 * t)          # synthetic "speech"
    noise_source = rng.normal(0, 1.0, size=t.shape)     # shared noise source

    # Primary mic: clean speech + noise passed through a simple unknown
    # acoustic path (a fixed FIR filter), simulating real-world coupling.
    # NOTE: mode="full" truncated to input length gives a CAUSAL convolution
    # (output[n] depends only on noise_source[0..n]). NLMS is a causal
    # filter, so the test signal must be causal too, or NLMS is being asked
    # to predict "future" noise it structurally cannot see.
    unknown_path = np.array([1.0, 0.5, 0.2])
    noise_at_primary = np.convolve(noise_source, unknown_path, mode="full")[:len(noise_source)]
    primary = clean + 0.8 * noise_at_primary

    # Reference mic: picks up mostly the raw noise source (e.g. facing away
    # from the speaker), only weakly correlated with the clean speech.
    reference = noise_source + 0.01 * clean

    def snr_db(signal, noise):
        return 10 * np.log10(np.sum(signal ** 2) / np.sum(noise ** 2))

    # Measure steady-state SNR (second half of the signal) since NLMS needs
    # some samples to converge; the first half is expected to be transient.
    steady_state = slice(len(t) // 2, len(t))

    snr_before = snr_db(clean[steady_state], (primary - clean)[steady_state])
    output = apply_nlms(primary, reference, filter_length=16, step_size=0.1,
                         epsilon=1e-8)
    snr_after = snr_db(clean[steady_state], (output - clean)[steady_state])

    print(f"Steady-state SNR before NLMS: {snr_before:.2f} dB")
    print(f"Steady-state SNR after NLMS:  {snr_after:.2f} dB")
    print(f"Improvement:                  {snr_after - snr_before:.2f} dB")
    print("(Confirm this still reports ~11dB improvement, matching the "
          "pre-fix self-test - the relative_epsilon change should not "
          "affect this case since noise_source has power ~1.0, far above "
          "where either the old or new epsilon ever mattered.)")

    # Also test config-driven path (reads configs/config.yaml relative to
    # this file's real location, not cwd).
    output_from_config = apply_nlms(primary, reference)
    print(f"Config-driven run produced output of shape {output_from_config.shape}, "
          f"first 3 samples: {output_from_config[:3]}")