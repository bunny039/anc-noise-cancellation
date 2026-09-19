"""verify_combined_onnx.py
Run the same random inputs through the individual ONNX models (enc, erb_dec,
df_dec) and the combined model, then compare outputs to confirm they match.

Requires: onnxruntime, numpy
"""

import os
import numpy as np
import onnxruntime as ort


def main():
    export_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "models", "onnx_export")
    )

    enc_path = os.path.join(export_dir, "enc.onnx")
    erb_path = os.path.join(export_dir, "erb_dec.onnx")
    df_path  = os.path.join(export_dir, "df_dec.onnx")
    combined_path = os.path.join(export_dir, "combined.onnx")

    for p in [enc_path, erb_path, df_path, combined_path]:
        if not os.path.isfile(p):
            print(f"ERROR: missing {p}")
            return

    # ── Create sessions ──────────────────────────────────────────────
    opts = ort.SessionOptions()
    opts.log_severity_level = 3          # suppress warnings
    enc_sess = ort.InferenceSession(enc_path, opts)
    erb_sess = ort.InferenceSession(erb_path, opts)
    df_sess  = ort.InferenceSession(df_path, opts)
    comb_sess = ort.InferenceSession(combined_path, opts)

    # ── Build dummy inputs (batch=1, S=10 frames) ───────────────────
    S = 10
    np.random.seed(42)
    feat_erb  = np.random.randn(1, 1, S, 32).astype(np.float32)
    feat_spec = np.random.randn(1, 2, S, 96).astype(np.float32)

    inputs = {"feat_erb": feat_erb, "feat_spec": feat_spec}

    # ── Run individual pipeline ──────────────────────────────────────
    enc_out_names = [o.name for o in enc_sess.get_outputs()]
    enc_results   = enc_sess.run(enc_out_names, inputs)
    enc_dict      = dict(zip(enc_out_names, enc_results))

    # ERB decoder expects: emb, e3, e2, e1, e0
    erb_inputs = {
        "emb": enc_dict["emb"],
        "e3":  enc_dict["e3"],
        "e2":  enc_dict["e2"],
        "e1":  enc_dict["e1"],
        "e0":  enc_dict["e0"],
    }
    erb_out_names = [o.name for o in erb_sess.get_outputs()]
    erb_results   = erb_sess.run(erb_out_names, erb_inputs)
    erb_dict      = dict(zip(erb_out_names, erb_results))

    # DF decoder expects: emb, c0
    df_inputs = {
        "emb": enc_dict["emb"],
        "c0":  enc_dict["c0"],
    }
    df_out_names = [o.name for o in df_sess.get_outputs()]
    df_results   = df_sess.run(df_out_names, df_inputs)
    df_dict      = dict(zip(df_out_names, df_results))

    print("--- Individual pipeline results ---")
    print(f"  lsnr  shape: {enc_dict['lsnr'].shape}")
    print(f"  m     shape: {erb_dict['m'].shape}")
    print(f"  coefs shape: {df_dict['coefs'].shape}")

    # -- Run combined model -----------------------------------------------
    comb_out_names = [o.name for o in comb_sess.get_outputs()]
    comb_results   = comb_sess.run(comb_out_names, inputs)
    comb_dict      = dict(zip(comb_out_names, comb_results))

    print("\n--- Combined model results ---")
    for name, arr in comb_dict.items():
        print(f"  {name:10s} shape: {arr.shape}")

    # -- Compare ----------------------------------------------------------
    # Mapping: combined output name -> individual output name + array
    comparisons = [
        ("lsnr",     "lsnr",  enc_dict["lsnr"]),
        ("erb_m",    "m",     erb_dict["m"]),
        ("df_coefs", "coefs", df_dict["coefs"]),
    ]

    print("\n--- Comparison ---")
    all_ok = True
    for comb_name, ind_name, ind_arr in comparisons:
        comb_arr = comb_dict[comb_name]
        match = np.allclose(comb_arr, ind_arr, atol=1e-5, rtol=1e-4)
        max_diff = np.max(np.abs(comb_arr - ind_arr))
        status = "PASS" if match else "FAIL"
        print(f"  {comb_name:10s} vs {ind_name:6s}  {status}  (max diff = {max_diff:.2e})")
        if not match:
            all_ok = False

    print()
    if all_ok:
        print("All outputs match — combined model is working correctly!")
    else:
        print("WARNING: Some outputs differ. Check the model merging logic.")


if __name__ == "__main__":
    main()
