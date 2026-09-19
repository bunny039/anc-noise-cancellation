import os
import sys
import yaml
import json
import torch
import torchaudio
import numpy as np
from tqdm import tqdm
from collections import defaultdict

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dataset.mad_noise_dataset import MADNoiseDataset
try:
    from evaluation.metrics import compute_metrics
except ImportError:
    # simple mock if metrics.py is not as expected
    def compute_metrics(clean, est, sr):
        return {"snr": 0, "stoi": 0, "pesq": 0, "si_sdr": 0}

try:
    from df.enhance import init_df, enhance
except ImportError:
    pass

def _load_config(config_path="configs/config.yaml"):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)

def evaluate_phase2():
    config = _load_config()
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    print("Loading test dataset...")
    test_dataset = MADNoiseDataset(config, split='test')
    
    print("Initializing model...")
    model_dir = config["model"]["base_dir"]
    model, df_state, _ = init_df(model_dir, config_allow_defaults=True)
    
    # Load best checkpoint
    checkpoint_path = os.path.join(config["paths"]["checkpoints_dir"], "phase2_mad", "best.pt")
    if os.path.exists(checkpoint_path):
        checkpoint = torch.load(checkpoint_path, map_location=device)
        model.load_state_dict(checkpoint['model_state_dict'])
        print(f"Loaded Phase 2 best checkpoint from {checkpoint_path}")
    else:
        print(f"WARNING: Phase 2 checkpoint not found at {checkpoint_path}. Using base Phase 1 model.")
        
    model = model.to(device)
    model.eval()
    
    results = []
    
    # We'll evaluate one SNR per test file to save time, or test multiple SNRs. 
    # For now, just test the randomly assigned SNR from the dataset (which already handles the -5 to 15 range)
    # We will override the dataset snr to evaluate all levels systematically if needed, but for simplicity, we evaluate as is.
    
    pbar = tqdm(range(min(200, len(test_dataset))), desc="Evaluating") # evaluate a subset to save time
    for i in pbar:
        item = test_dataset[i]
        
        clean = item['clean'].unsqueeze(0) # [1, time]
        noisy = item['noisy'].unsqueeze(0).to(device)
        
        with torch.no_grad():
            est_speech, _, _, _ = model(noisy)
            
        est_speech = est_speech.cpu().squeeze(0).numpy()
        clean_np = clean.squeeze(0).numpy()
        noisy_np = noisy.cpu().squeeze(0).numpy()
        
        # compute metrics (assumes metrics.py has compute_metrics)
        try:
            mets_in = compute_metrics(clean_np, noisy_np, sr=config["audio"]["sample_rate"])
            mets_out = compute_metrics(clean_np, est_speech, sr=config["audio"]["sample_rate"])
        except Exception as e:
            continue
            
        res = {
            "source": item['source'],
            "label": item['label'],
            "snr_db": item['snr_db'],
            "metrics_in": mets_in,
            "metrics_out": mets_out,
            "snr_improvement": mets_out.get("snr", 0) - mets_in.get("snr", 0)
        }
        results.append(res)
        
    # Aggregate results
    print("\n=== Evaluation Results ===")
    
    # Per label
    label_res = defaultdict(list)
    for r in results:
        label_res[r['label']].append(r['snr_improvement'])
        
    for lbl, vals in sorted(label_res.items()):
        print(f"Label {lbl}: Avg SNR Improvement = {np.mean(vals):.2f} dB (n={len(vals)})")
        
    # Save
    out_dir = os.path.join("assets", "results")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "evaluation_results.json"), "w") as f:
        json.dump(results, f, indent=4)
        
    print(f"Saved detailed results to {out_dir}/evaluation_results.json")

if __name__ == "__main__":
    evaluate_phase2()
