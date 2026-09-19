import os
import json
import matplotlib.pyplot as plt
import numpy as np

def visualize_results():
    out_dir = os.path.join("assets", "results")
    res_file = os.path.join(out_dir, "evaluation_results.json")
    hist_file = os.path.join("checkpoints", "phase2_mad", "training_history.json")
    
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. Plot Training History
    if os.path.exists(hist_file):
        with open(hist_file, "r") as f:
            history = json.load(f)
            
        plt.figure(figsize=(10, 5))
        epochs = range(1, len(history["train_loss"]) + 1)
        plt.plot(epochs, history["train_loss"], label='Train Loss')
        plt.plot(epochs, history["val_loss"], label='Val Loss')
        plt.title('Phase 2 MAD Fine-tuning Loss')
        plt.xlabel('Epochs')
        plt.ylabel('Multi-Res Spectral Loss')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.savefig(os.path.join(out_dir, "training_history.png"))
        plt.close()
        print(f"Saved {out_dir}/training_history.png")
        
    # 2. Plot Evaluation Results
    if os.path.exists(res_file):
        with open(res_file, "r") as f:
            results = json.load(f)
            
        if not results:
            print("Evaluation results empty. Skipping plots.")
            return
            
        # Group by SNR
        snr_groups = {}
        for r in results:
            snr = r["snr_db"]
            if snr not in snr_groups:
                snr_groups[snr] = []
            snr_groups[snr].append(r["snr_improvement"])
            
        snrs = sorted(snr_groups.keys())
        avg_improvements = [np.mean(snr_groups[s]) for s in snrs]
        
        plt.figure(figsize=(10, 5))
        plt.bar([str(s) for s in snrs], avg_improvements, color='skyblue')
        plt.title('SNR Improvement by Input SNR')
        plt.xlabel('Input SNR (dB)')
        plt.ylabel('Average SNR Improvement (dB)')
        for i, v in enumerate(avg_improvements):
            plt.text(i, v + 0.1, f"{v:.2f}", ha='center')
        plt.grid(axis='y', alpha=0.3)
        plt.savefig(os.path.join(out_dir, "snr_improvement_by_input_snr.png"))
        plt.close()
        print(f"Saved {out_dir}/snr_improvement_by_input_snr.png")
        
        # Group by Label
        label_groups = {}
        for r in results:
            lbl = r["label"]
            if lbl not in label_groups:
                label_groups[lbl] = []
            label_groups[lbl].append(r["snr_improvement"])
            
        labels = sorted(label_groups.keys())
        avg_lbl_improvements = [np.mean(label_groups[l]) for l in labels]
        
        plt.figure(figsize=(10, 5))
        plt.bar([f"Label {l}" for l in labels], avg_lbl_improvements, color='lightgreen')
        plt.title('SNR Improvement by MAD Noise Class')
        plt.xlabel('Noise Class')
        plt.ylabel('Average SNR Improvement (dB)')
        for i, v in enumerate(avg_lbl_improvements):
            plt.text(i, v + 0.1, f"{v:.2f}", ha='center')
        plt.grid(axis='y', alpha=0.3)
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig(os.path.join(out_dir, "snr_improvement_by_label.png"))
        plt.close()
        print(f"Saved {out_dir}/snr_improvement_by_label.png")
        
if __name__ == "__main__":
    visualize_results()
