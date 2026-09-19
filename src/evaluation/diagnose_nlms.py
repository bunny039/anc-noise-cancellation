"""
Diagnostic (instrumented): tests NLMS behavior on the held-out
synthetic_defence_test set.

Two families of modes:

1. NLMS-ALONE modes (--sweep, --step-sizes): run NLMS directly on the raw
   noisy primary mic and reference mic signals, bypassing DTLN entirely.
   Used to isolate NLMS's own stability/epsilon-floor behavior from DTLN.

2. ADAPTIVE SEARCH mode (--adaptive-search): runs the real DTLN + NLMS
   pipeline (via src.pipeline.enhance_dtln_stage, which includes the
   chunked-DTLN-state-reset fix for the long-sequence degradation bug),
   then per file, searches for the best NLMS step_size for THAT file.

   The search is bidirectional and does not stop early just because
   --target-snr has been reached, since a file whose DTLN-stage SNR
   already exceeds the target can still be actively degraded by NLMS -
   "output is above target" and "NLMS is helping this file" are not the
   same condition, and treating the former as a stop signal was masking
   real degradation (confirmed: files starting near 19-20dB were
   getting worse with every attempt, but the search stopped as soon as
   the declining value was still technically above 15dB).

   Algorithm: try --start-step-size first. Try one shrink (divide by
   --shrink-factor); if that improves on the start, keep shrinking in
   that direction. If the shrink made things worse, switch direction
   and expand instead (multiply by --shrink-factor) from the start
   value, since the true optimum may sit above --start-step-size (this
   matters most for heavily-noisy files, where the earlier NLMS-alone
   sweep showed the best step_size can be larger than 0.005). Whichever
   direction is chosen, keep moving that way, tracking the best SNR
   seen, until a new attempt is WORSE than the best so far (the curve is
   an inverted U, so this means the peak has been passed) or
   --max-attempts is reached. --target-snr is used only to LABEL the
   final result as hit_target=True/False for reporting - it never stops
   the search early.

   Bucketing is by raw_snr - the file's measured pre-DTLN SNR (clean vs.
   the untouched noisy mic signal) - NOT by post-DTLN SNR. Bucketing by
   post-DTLN SNR (the earlier behavior) conflates "how hard was this file
   originally" with "how well did DTLN already do on it," which makes it
   impossible to tell dataset difficulty spread apart from a genuine
   per-file DTLN problem. raw_snr is the file's true nominal difficulty,
   independent of anything DTLN or NLMS did to it. dtln_gain and
   nlms_gain then separately show each stage's own contribution.

   Noise-category breakdown (optional) is read from mix_log.csv, written
   by prepare_synthetic_defence_test.py alongside the clean/noisy/
   reference triplets. If that file is missing, category breakdown is
   silently skipped rather than guessed from filenames (VoiceBank
   filenames carry only speaker+utterance id, no category info).

Does NOT modify nlms.py or apply_nlms - this file's NLMS-ALONE modes use a
parallel copy of the same per-sample loop for instrumentation. The
adaptive-search mode calls apply_nlms directly (production code) since it
runs the real pipeline stage rather than a hand-instrumented copy.
"""

import argparse
import csv
import os
import sys

import numpy as np

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../..")
)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.evaluation.metrics import load_config, load_audio_mono, compute_snr_db
from src.model.nlms import _load_nlms_config, apply_nlms
from src.model.dtln import load_pretrained_model
from src.pipeline import enhance_dtln_stage


CLEAN_DIR = "data/processed/synthetic_defence_test/clean"
NOISY_DIR = "data/processed/synthetic_defence_test/noisy"
REFERENCE_DIR = "data/processed/synthetic_defence_test/reference"
DEFAULT_MIX_LOG_PATH = "data/processed/synthetic_defence_test/mix_log.csv"


def compute_power_basis(reference_signal, basis="mean", percentile=20):
    """
    The floor (epsilon_effective) needs a number representing "typical
    quiet power" for this file. mean(ref**2) is the obvious choice, but
    for impulsive noise (short loud bursts, mostly silence) the mean is
    dragged upward by the rare bursts - it overestimates what "quiet"
    actually looks like for exactly the files where that matters most.
    A low percentile of the per-sample power is robust to that: bursts
    are a minority of samples, so they don't move a low percentile much,
    and the result tracks the silent stretches' actual power instead.
    """
    squared = reference_signal ** 2
    if basis == "mean":
        return float(np.mean(squared))
    elif basis == "percentile":
        return float(np.percentile(squared, percentile))
    else:
        raise ValueError(f"Unknown basis: {basis!r}, expected 'mean' or 'percentile'")


def apply_nlms_debug(primary_signal, reference_signal, filter_length, step_size, epsilon,
                      relative_epsilon=1e-3, basis="mean", percentile=20):
    """
    Same update rule as apply_nlms in src/model/nlms.py - deliberately
    duplicated rather than imported, so instrumentation code never risks
    changing production behavior. MUST be kept in sync with apply_nlms's
    actual math by hand.

    Returns the filtered signal plus a stats dict:
      - min_norm_factor: smallest (ref_buffer power + epsilon_effective)
        seen. Close to epsilon_effective => the filter was running on
        near-silent reference data at some point in this file.
      - max_weight_norm: largest ||weights|| reached anywhere during the
        run - can reflect a transient spike the filter later recovered
        from, so it's a "how bad did it get" number, not "where did it
        end up."
      - final_weight_norm: ||weights|| at the END of the file. The ideal
        solution here is weights=[1,0,...,0] (norm 1), since reference is
        an exact copy of the injected noise. This is the number that
        actually answers "did it converge," as opposed to max_weight_norm
        which only tells you how unstable it got along the way.
      - epsilon_dominant_pct: % of samples where epsilon_effective was
        >= 10% of norm_factor, i.e. the floor was actually doing
        regularizing work rather than being negligible next to real
        signal power.
      - epsilon_effective: the per-file floor actually used.
    """
    primary_signal = np.asarray(primary_signal, dtype=np.float64)
    reference_signal = np.asarray(reference_signal, dtype=np.float64)

    ref_power_estimate = compute_power_basis(reference_signal, basis=basis, percentile=percentile)
    epsilon_effective = max(epsilon, relative_epsilon * ref_power_estimate)

    num_samples = primary_signal.shape[0]
    weights = np.zeros(filter_length, dtype=np.float64)
    ref_buffer = np.zeros(filter_length, dtype=np.float64)
    filtered_signal = np.zeros(num_samples, dtype=np.float64)

    min_norm_factor = np.inf
    max_weight_norm = 0.0
    epsilon_dominant_count = 0

    for n in range(num_samples):
        ref_buffer[1:] = ref_buffer[:-1]
        ref_buffer[0] = reference_signal[n]

        predicted_noise = np.dot(weights, ref_buffer)
        error = primary_signal[n] - predicted_noise
        filtered_signal[n] = error

        raw_power = np.dot(ref_buffer, ref_buffer)
        norm_factor = raw_power + epsilon_effective
        weights += (step_size / norm_factor) * error * ref_buffer

        if norm_factor < min_norm_factor:
            min_norm_factor = norm_factor
        weight_norm = np.linalg.norm(weights)
        if weight_norm > max_weight_norm:
            max_weight_norm = weight_norm
        if epsilon_effective >= 0.1 * norm_factor:
            epsilon_dominant_count += 1

    stats = {
        "min_norm_factor": min_norm_factor,
        "max_weight_norm": max_weight_norm,
        "final_weight_norm": float(np.linalg.norm(weights)),
        "epsilon_dominant_pct": 100.0 * epsilon_dominant_count / num_samples,
        "epsilon_effective": epsilon_effective,
    }
    return filtered_signal, stats


def find_matched_triplets():
    clean_files = {f for f in os.listdir(CLEAN_DIR) if f.lower().endswith(".wav")}
    noisy_files = {f for f in os.listdir(NOISY_DIR) if f.lower().endswith(".wav")}
    reference_files = {f for f in os.listdir(REFERENCE_DIR) if f.lower().endswith(".wav")}
    matched = sorted(clean_files & noisy_files & reference_files)
    if not matched:
        raise ValueError("No matching clean/noisy/reference triplets found.")
    return matched


def load_noise_categories(mix_log_path):
    """
    Reads filename -> noise_category from mix_log.csv (written by
    prepare_synthetic_defence_test.py). Returns None (not an empty dict)
    if the file doesn't exist, so callers can tell "no data" apart from
    "data exists but this file wasn't in it" - the two need different
    handling downstream.
    """
    if not os.path.isfile(mix_log_path):
        print(f"No mix log found at {mix_log_path} - noise-category breakdown skipped.")
        return None

    categories = {}
    with open(mix_log_path, "r", newline="") as f:
        reader = csv.DictReader(f)
        if "filename" not in reader.fieldnames or "noise_category" not in reader.fieldnames:
            print(f"{mix_log_path} is missing filename/noise_category columns - "
                  f"noise-category breakdown skipped.")
            return None
        for row in reader:
            categories[row["filename"]] = row["noise_category"]

    return categories


def bucket_snr(snr_before, bucket_width=5.0):
    """
    Buckets a file by its nominal input SNR level. The synthetic test set
    is generated at fixed target SNRs (multiples of bucket_width - e.g.
    -5/0/5/10/15 dB), so rounding the *measured* pre-NLMS SNR to the
    nearest multiple recovers which nominal level a file belongs to.
    """
    return bucket_width * round(snr_before / bucket_width)


def _try_step_size(dtln_output, reference_signal, filter_length, epsilon,
                    relative_epsilon, step_size, clean_signal):
    output = apply_nlms(
        dtln_output, reference_signal, filter_length=filter_length,
        step_size=step_size, epsilon=epsilon, relative_epsilon=relative_epsilon
    )
    n = min(len(clean_signal), len(output))
    return compute_snr_db(clean_signal[:n], output[:n])


def adaptive_step_size_search(dtln_output, reference_signal, filter_length, epsilon,
                               relative_epsilon, start_step_size, shrink_factor,
                               target_snr_db, clean_signal, max_attempts=12):
    attempt = 1
    start_snr = _try_step_size(dtln_output, reference_signal, filter_length, epsilon,
                                relative_epsilon, start_step_size, clean_signal)
    best = {
        "step_size": start_step_size,
        "snr_after": start_snr,
        "attempts": attempt,
        "hit_target": start_snr >= target_snr_db,
    }

    if attempt >= max_attempts:
        return best

    attempt += 1
    shrunk_step = start_step_size / shrink_factor
    shrunk_snr = _try_step_size(dtln_output, reference_signal, filter_length, epsilon,
                                 relative_epsilon, shrunk_step, clean_signal)

    if shrunk_snr > best["snr_after"]:
        direction_factor = 1.0 / shrink_factor
        best = {
            "step_size": shrunk_step,
            "snr_after": shrunk_snr,
            "attempts": attempt,
            "hit_target": shrunk_snr >= target_snr_db,
        }
        current_step = shrunk_step * direction_factor
    else:
        direction_factor = shrink_factor
        current_step = start_step_size * direction_factor

    while attempt < max_attempts:
        attempt += 1
        snr_after = _try_step_size(dtln_output, reference_signal, filter_length, epsilon,
                                    relative_epsilon, current_step, clean_signal)
        if snr_after > best["snr_after"]:
            best = {
                "step_size": current_step,
                "snr_after": snr_after,
                "attempts": attempt,
                "hit_target": snr_after >= target_snr_db,
            }
            current_step = current_step * direction_factor
        else:
            break

    return best


def _print_gain_row(label, entries):
    """
    entries: list of (raw_snr, dtln_snr, final_snr, dtln_gain, nlms_gain,
    total_gain, step_size, attempts, hit_target) tuples. Shared by the
    raw_snr-bucket table and the noise-category table so the two stay in
    the same format.
    """
    n = len(entries)
    avg_raw = float(np.mean([e[0] for e in entries]))
    avg_dtln = float(np.mean([e[1] for e in entries]))
    avg_final = float(np.mean([e[2] for e in entries]))
    avg_dtln_gain = float(np.mean([e[3] for e in entries]))
    avg_nlms_gain = float(np.mean([e[4] for e in entries]))
    avg_total_gain = float(np.mean([e[5] for e in entries]))
    avg_step_size = float(np.mean([e[6] for e in entries]))
    avg_attempts = float(np.mean([e[7] for e in entries]))
    hit_count = sum(1 for e in entries if e[8])
    print(f"  {label:<14} (n={n:<2}):  "
          f"avg_raw={avg_raw:6.2f}dB  avg_dtln={avg_dtln:6.2f}dB  avg_final={avg_final:6.2f}dB  "
          f"dtln_gain={avg_dtln_gain:+6.2f}dB  nlms_gain={avg_nlms_gain:+6.2f}dB  "
          f"total_gain={avg_total_gain:+6.2f}dB  "
          f"hit_target={hit_count}/{n}  "
          f"avg_step_size_used={avg_step_size:.5f}  avg_attempts={avg_attempts:.1f}")
    return hit_count, n


def run_adaptive_search(config_path, max_files, checkpoint_path, filter_length,
                         epsilon, relative_epsilon, start_step_size, shrink_factor,
                         target_snr_db, max_attempts, snr_bucket_width, mix_log_path):
    config = load_config(config_path)
    sample_rate = int(config["audio"]["sample_rate"])

    print(f"Adaptive step-size search (DTLN + NLMS), start_step_size={start_step_size}, "
          f"shrink_factor={shrink_factor}, target={target_snr_db}dB, "
          f"relative_epsilon={relative_epsilon}, checkpoint={checkpoint_path}")
    print()

    filenames = find_matched_triplets()
    if max_files is not None:
        filenames = filenames[:max_files]

    categories = load_noise_categories(mix_log_path)

    model = load_pretrained_model(checkpoint_path)

    buckets = {}
    category_entries = {}
    for index, filename in enumerate(filenames, start=1):
        clean_path = os.path.join(CLEAN_DIR, filename)
        noisy_path = os.path.join(NOISY_DIR, filename)
        reference_path = os.path.join(REFERENCE_DIR, filename)

        try:
            dtln_output, reference_eval = enhance_dtln_stage(
                noisy_path, reference_path, config_path=config_path, model=model
            )
        except Exception as exc:
            print(f"[{index}/{len(filenames)}] {filename}  DTLN stage FAILED: {exc}")
            continue

        clean_signal = load_audio_mono(clean_path, sample_rate)
        noisy_signal = load_audio_mono(noisy_path, sample_rate)
        n = min(len(clean_signal), len(dtln_output), len(noisy_signal))
        clean_eval = clean_signal[:n]
        dtln_eval = dtln_output[:n]
        noisy_eval = noisy_signal[:n]
        reference_eval = reference_eval[:n]

        # raw_snr: clean vs. the untouched noisy mic signal, before DTLN or
        # NLMS touch anything. This is the file's true nominal difficulty -
        # what the dataset's snr_levels_db config actually refers to. Bucket
        # on THIS, not on anything DTLN has already shifted.
        raw_snr = compute_snr_db(clean_eval, noisy_eval)
        # dtln_snr: post-DTLN, pre-NLMS. Isolates DTLN's own contribution.
        dtln_snr = compute_snr_db(clean_eval, dtln_eval)

        best = adaptive_step_size_search(
            dtln_eval, reference_eval, filter_length, epsilon, relative_epsilon,
            start_step_size, shrink_factor, target_snr_db, clean_eval,
            max_attempts=max_attempts
        )
        final_snr = best["snr_after"]

        dtln_gain = dtln_snr - raw_snr    # DTLN's own contribution
        nlms_gain = final_snr - dtln_snr  # NLMS's own contribution (can be negative)
        total_gain = final_snr - raw_snr  # true end-to-end improvement vs. raw input

        entry = (raw_snr, dtln_snr, final_snr, dtln_gain, nlms_gain, total_gain,
                 best["step_size"], best["attempts"], best["hit_target"])

        bucket_key = bucket_snr(raw_snr, snr_bucket_width)
        buckets.setdefault(bucket_key, []).append(entry)

        category = categories.get(filename) if categories is not None else None
        if category is not None:
            category_entries.setdefault(category, []).append(entry)

        category_label = f"  category={category}" if category is not None else ""
        print(f"[{index}/{len(filenames)}] {filename}  "
              f"raw={raw_snr:.2f}dB  dtln={dtln_snr:.2f}dB  final={final_snr:.2f}dB  "
              f"dtln_gain={dtln_gain:+.2f}dB  nlms_gain={nlms_gain:+.2f}dB  "
              f"total_gain={total_gain:+.2f}dB  step_size_used={best['step_size']:.5f}  "
              f"attempts={best['attempts']}  hit_target={best['hit_target']}{category_label}")

    print()
    print("=" * 70)
    print("ADAPTIVE STEP-SIZE SEARCH RESULT (DTLN + NLMS) - BY RAW-SNR BUCKET")
    print("=" * 70)

    all_total_gains = []
    total_hit = 0
    total_n = 0
    for bucket_key in sorted(buckets):
        hit_count, n = _print_gain_row(f"raw~{bucket_key:.1f}dB", buckets[bucket_key])
        all_total_gains.extend(e[5] for e in buckets[bucket_key])
        total_hit += hit_count
        total_n += n

    if all_total_gains:
        print(f"  {'overall':>16}:  hit_target={total_hit}/{total_n}  "
              f"avg_total_gain={float(np.mean(all_total_gains)):6.2f}dB")

    if category_entries:
        print()
        print("=" * 70)
        print("ADAPTIVE STEP-SIZE SEARCH RESULT (DTLN + NLMS) - BY NOISE CATEGORY")
        print("=" * 70)
        for category in sorted(category_entries):
            _print_gain_row(category, category_entries[category])
    elif categories is not None:
        # mix_log.csv loaded fine but none of its filenames matched what we
        # evaluated - worth surfacing rather than silently printing nothing,
        # since it usually means a filename-format mismatch between the log
        # and the actual triplet directories.
        print()
        print("mix_log.csv loaded but no filenames matched the evaluated set - "
              "check for a filename mismatch between the log and the data dirs.")


def run_diagnostic(config_path="configs/config.yaml", max_files=None,
                    relative_epsilons=(1e-3,), basis="mean", percentile=20,
                    step_sizes=None, snr_bucket_width=5.0):
    config = load_config(config_path)
    sample_rate = int(config["audio"]["sample_rate"])

    filter_length, step_size, epsilon = _load_nlms_config()
    print(f"Using filter_length={filter_length}, step_size={step_size}, epsilon={epsilon}, "
          f"power_basis={basis}" + (f"(p{percentile})" if basis == "percentile" else ""))
    if step_sizes is not None:
        print("(step_size above is just the config default - overridden by --step-sizes below)")
    print()

    filenames = find_matched_triplets()
    if max_files is not None:
        filenames = filenames[:max_files]

    loaded = []
    for filename in filenames:
        clean_signal = load_audio_mono(os.path.join(CLEAN_DIR, filename), sample_rate)
        noisy_signal = load_audio_mono(os.path.join(NOISY_DIR, filename), sample_rate)
        reference_signal = load_audio_mono(os.path.join(REFERENCE_DIR, filename), sample_rate)
        n = min(len(clean_signal), len(noisy_signal), len(reference_signal))
        loaded.append((filename, clean_signal[:n], noisy_signal[:n], reference_signal[:n]))

    if step_sizes is not None:
        if len(relative_epsilons) != 1:
            raise ValueError(
                "step_sizes sweep holds relative_epsilon fixed - pass exactly "
                "one value via --sweep (e.g. --sweep 0.3), not a list."
            )
        rel_eps = relative_epsilons[0]
        print(f"Sweeping step_size={step_sizes}, fixed relative_epsilon={rel_eps}, "
              f"power_basis={basis}" + (f"(p{percentile})" if basis == "percentile" else "") +
              f", SNR buckets of width {snr_bucket_width}dB")
        print()

        for step_size_value in step_sizes:
            buckets = {}

            for filename, clean_eval, noisy_eval, reference_eval in loaded:
                try:
                    nlms_output, stats = apply_nlms_debug(
                        noisy_eval, reference_eval, filter_length, step_size_value, epsilon,
                        relative_epsilon=rel_eps, basis=basis, percentile=percentile
                    )
                except Exception as exc:
                    print(f"{filename}  NLMS FAILED at step_size={step_size_value}: {exc}")
                    continue

                n2 = min(len(clean_eval), len(nlms_output))
                clean_eval2 = clean_eval[:n2]
                nlms_eval = nlms_output[:n2]
                noisy_eval2 = noisy_eval[:n2]

                snr_before = compute_snr_db(clean_eval2, noisy_eval2)
                snr_after = compute_snr_db(clean_eval2, nlms_eval)
                improvement = snr_after - snr_before

                bucket_key = bucket_snr(snr_before, snr_bucket_width)
                buckets.setdefault(bucket_key, []).append(
                    (snr_before, snr_after, improvement, stats["final_weight_norm"])
                )

            print(f"step_size={step_size_value}")
            all_improvements = []
            for bucket_key in sorted(buckets):
                entries = buckets[bucket_key]
                n = len(entries)
                avg_before = float(np.mean([e[0] for e in entries]))
                avg_after = float(np.mean([e[1] for e in entries]))
                avg_improvement = float(np.mean([e[2] for e in entries]))
                still_catastrophic = sum(1 for e in entries if e[2] < -10.0)
                avg_final_norm = float(np.mean([e[3] for e in entries]))
                worst_final_norm = float(max([e[3] for e in entries]))
                all_improvements.extend(e[2] for e in entries)
                print(f"  SNR~{bucket_key:5.1f}dB (n={n:<2}):  "
                      f"avg_before={avg_before:6.2f}dB  avg_after={avg_after:6.2f}dB  "
                      f"avg_improvement={avg_improvement:6.2f}dB  "
                      f"still_catastrophic(<-10dB)={still_catastrophic}/{n}  "
                      f"final_weight_norm avg={avg_final_norm:5.2f} worst={worst_final_norm:5.2f}  "
                      f"(ideal=1.00)")
            if all_improvements:
                print(f"  {'overall':>16}:  avg_improvement={float(np.mean(all_improvements)):6.2f}dB")
            print()
        return

    single_value_mode = len(relative_epsilons) == 1
    if single_value_mode:
        print(f"Testing NLMS alone (no DTLN) on {len(filenames)} files, "
              f"instrumented, relative_epsilon={relative_epsilons[0]}.")
        print()

    for rel_eps in relative_epsilons:
        snr_before_values = []
        snr_after_values = []
        catastrophic_count = 0

        for index, (filename, clean_eval, noisy_eval, reference_eval) in enumerate(loaded, start=1):
            try:
                nlms_output, stats = apply_nlms_debug(
                    noisy_eval, reference_eval, filter_length, step_size, epsilon,
                    relative_epsilon=rel_eps, basis=basis, percentile=percentile
                )
            except Exception as exc:
                print(f"[{index}/{len(loaded)}] {filename}  NLMS FAILED: {exc}")
                continue

            n2 = min(len(clean_eval), len(nlms_output))
            clean_eval2 = clean_eval[:n2]
            nlms_eval = nlms_output[:n2]
            noisy_eval2 = noisy_eval[:n2]

            snr_before = compute_snr_db(clean_eval2, noisy_eval2)
            snr_after = compute_snr_db(clean_eval2, nlms_eval)
            improvement = snr_after - snr_before

            snr_before_values.append(snr_before)
            snr_after_values.append(snr_after)
            if improvement < -10.0:
                catastrophic_count += 1

            if single_value_mode:
                print(
                    f"[{index}/{len(loaded)}] {filename}  "
                    f"before={snr_before:.2f}dB  after={snr_after:.2f}dB  "
                    f"improvement={improvement:.2f}dB  "
                    f"min_norm_factor={stats['min_norm_factor']:.3e}  "
                    f"max_weight_norm={stats['max_weight_norm']:.2f}  "
                    f"eps_dominant={stats['epsilon_dominant_pct']:.1f}%  "
                    f"eps_effective={stats['epsilon_effective']:.3e}"
                )

        if snr_before_values:
            avg_before = float(np.mean(snr_before_values))
            avg_after = float(np.mean(snr_after_values))
            print()
            if single_value_mode:
                print("=" * 70)
                print("NLMS-ONLY DIAGNOSTIC RESULT (no DTLN) - INSTRUMENTED")
                print("=" * 70)
            print(f"relative_epsilon={rel_eps:<8}  "
                  f"avg_before={avg_before:6.2f}dB  avg_after={avg_after:6.2f}dB  "
                  f"avg_improvement={avg_after - avg_before:6.2f}dB  "
                  f"files_still_catastrophic(<-10dB)={catastrophic_count}/{len(loaded)}")
        else:
            print(f"relative_epsilon={rel_eps}: no files evaluated successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Diagnostic: NLMS alone (no DTLN) sweeps, or the full "
                     "DTLN+NLMS adaptive step-size search, on real held-out data."
    )
    parser.add_argument("--max-files", type=int, default=None)
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument(
        "--sweep", default="1e-3",
        help="Comma-separated relative_epsilon values to test. Single value "
             "prints full per-file detail; multiple prints a compact summary "
             "per value. When --step-sizes is also given, this must be a "
             "single value - relative_epsilon held fixed while step_size sweeps. "
             "Not used by --adaptive-search (use --relative-epsilon instead)."
    )
    parser.add_argument(
        "--basis", default="mean", choices=["mean", "percentile"],
        help="How to estimate 'typical quiet power' for the epsilon floor."
    )
    parser.add_argument(
        "--percentile", type=float, default=20,
        help="Percentile of reference_signal**2 to use when --basis percentile. Default 20."
    )
    parser.add_argument(
        "--step-sizes", default=None,
        help="Comma-separated step_size values to sweep, e.g. '0.001,0.005,0.01'. "
             "Results broken down by SNR bucket. Requires --sweep to be a single value."
    )
    parser.add_argument(
        "--snr-bucket-width", type=float, default=5.0,
        help="Width in dB used to bucket files by measured pre-NLMS SNR. Default 5.0."
    )
    parser.add_argument(
        "--adaptive-search", action="store_true",
        help="Run the full DTLN+NLMS pipeline and search each file's NLMS "
             "step_size adaptively instead of a fixed sweep."
    )
    parser.add_argument(
        "--checkpoint", default="models_phase2_finetune/phase2_finetune.weights.h5",
        help="DTLN checkpoint path, used only with --adaptive-search."
    )
    parser.add_argument(
        "--relative-epsilon", type=float, default=0.3,
        help="relative_epsilon passed to apply_nlms in --adaptive-search mode. Default 0.3."
    )
    parser.add_argument(
        "--start-step-size", type=float, default=0.005,
        help="Initial step_size for the adaptive search. Default 0.005."
    )
    parser.add_argument(
        "--shrink-factor", type=float, default=2.0,
        help="Factor to divide step_size by on each shrink. Default 2.0."
    )
    parser.add_argument(
        "--target-snr", type=float, default=15.0,
        help="Target output SNR in dB, used only to label each file's best "
             "result as hit_target True/False for reporting. Does not stop "
             "the search early. Default 15.0."
    )
    parser.add_argument(
        "--max-attempts", type=int, default=12,
        help="Safety cap on shrink attempts per file. Default 12."
    )
    parser.add_argument(
        "--mix-log", default=DEFAULT_MIX_LOG_PATH,
        help="Path to mix_log.csv (filename,noise_category,noise_file,snr_db,clipped), "
             "used only with --adaptive-search for noise-category breakdown. "
             f"Default {DEFAULT_MIX_LOG_PATH}."
    )
    args = parser.parse_args()

    if args.adaptive_search:
        filter_length, _, epsilon = _load_nlms_config()
        run_adaptive_search(
            config_path=args.config, max_files=args.max_files,
            checkpoint_path=args.checkpoint, filter_length=filter_length,
            epsilon=epsilon, relative_epsilon=args.relative_epsilon,
            start_step_size=args.start_step_size, shrink_factor=args.shrink_factor,
            target_snr_db=args.target_snr, max_attempts=args.max_attempts,
            snr_bucket_width=args.snr_bucket_width, mix_log_path=args.mix_log
        )
    else:
        rel_eps_values = tuple(float(v) for v in args.sweep.split(","))
        step_size_values = None
        if args.step_sizes is not None:
            step_size_values = tuple(float(v) for v in args.step_sizes.split(","))

        run_diagnostic(config_path=args.config, max_files=args.max_files,
                        relative_epsilons=rel_eps_values, basis=args.basis,
                        percentile=args.percentile, step_sizes=step_size_values,
                        snr_bucket_width=args.snr_bucket_width)