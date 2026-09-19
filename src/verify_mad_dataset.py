import os
import yaml
from dataset.mad_noise_dataset import MADNoiseDataset

def _load_config(config_path="configs/config.yaml"):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)

def verify_dataset():
    config = _load_config()
    
    print("=== Verification of MAD Dataset ===")
    
    # 1. Clean speech dir
    clean_dir = config["datasets"]["voicebank_demand"]["clean_train_dir"]
    if not os.path.exists(clean_dir):
        print(f"[FAIL] Clean speech directory not found: {clean_dir}")
        print("       (Please ensure VoiceBank-DEMAND or equivalent is downloaded)")
    else:
        print(f"[PASS] Clean speech directory found: {clean_dir}")
        
    # 2. Check dataset splitting logic and leakage
    try:
        ds_train = MADNoiseDataset(config, split='train')
        ds_val = MADNoiseDataset(config, split='val')
        ds_test = MADNoiseDataset(config, split='test')
        
        train_sources = set(item['source'] for item in ds_train.all_noises)
        val_sources = set(item['source'] for item in ds_val.all_noises)
        test_sources = set(item['source'] for item in ds_test.all_noises)
        
        leakage_val = train_sources.intersection(val_sources)
        leakage_test = train_sources.intersection(test_sources)
        
        if leakage_val or leakage_test:
            print(f"[FAIL] Source leakage detected between splits!")
            if leakage_val:
                print(f"       Train/Val overlap: {leakage_val}")
            if leakage_test:
                print(f"       Train/Test overlap: {leakage_test}")
        else:
            print(f"[PASS] No source leakage between splits.")
            print(f"       Train sources: {len(train_sources)}, Val sources: {len(val_sources)}, Test sources: {len(test_sources)}")
            
        print(f"[PASS] Dataset instantiates successfully.")
        
        # 3. Test __getitem__
        if len(ds_train) > 0:
            sample = ds_train[0]
            print(f"[PASS] Successfully loaded sample. Shapes: Clean {sample['clean'].shape}, Noisy {sample['noisy'].shape}")
            
    except Exception as e:
        print(f"[FAIL] Exception during dataset validation: {e}")

if __name__ == "__main__":
    verify_dataset()
