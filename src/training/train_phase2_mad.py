import os
import sys
import yaml
import json
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dataset.mad_noise_dataset import MADNoiseDataset
from training.losses import MultiResSpecLoss

try:
    from df.enhance import init_df
except ImportError:
    print("WARNING: deepfilternet package not found. Please pip install deepfilternet.")
    print("Mocking init_df for now to avoid crash.")
    def init_df(*args, **kwargs):
        return torch.nn.Module(), None, None

def _load_config(config_path="configs/config.yaml"):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)

def train_phase2():
    config = _load_config()
    
    # 1. Setup environment
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    seed = config["training"]["phase2_finetune"].get("seed", 42)
    torch.manual_seed(seed)
    
    # 2. Init DeepFilterNet model
    model_dir = config["model"]["base_dir"]
    try:
        model, df_state, _ = init_df(model_dir, config_allow_defaults=True)
        model = model.to(device)
        model.train()
        print("Successfully loaded DeepFilterNet3.")
    except Exception as e:
        print(f"Failed to load DeepFilterNet3 from {model_dir}: {e}")
        return

    # 3. Create datasets and dataloaders
    batch_size = config["training"]["phase2_finetune"]["batch_size"]
    
    train_dataset = MADNoiseDataset(config, split='train', seed=seed)
    val_dataset = MADNoiseDataset(config, split='val', seed=seed)
    
    train_sampler = train_dataset.get_sampler()
    
    train_loader = DataLoader(
        train_dataset, 
        batch_size=batch_size, 
        sampler=train_sampler,
        num_workers=4,
        drop_last=True
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=2
    )

    # 4. Setup Optimizer, Scheduler, and Loss
    lr = config["training"]["phase2_finetune"]["learning_rate"]
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-12)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=3, verbose=True)
    
    criterion = MultiResSpecLoss().to(device)
    
    # Training Loop
    epochs = config["training"]["phase2_finetune"]["epochs"]
    grad_acc_steps = config["training"]["phase2_finetune"].get("gradient_accumulation_steps", 4)
    patience = config["training"]["phase2_finetune"].get("patience", 7)
    
    best_val_loss = float('inf')
    patience_counter = 0
    
    checkpoint_dir = os.path.join(config["paths"]["checkpoints_dir"], "phase2_mad")
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    history = {"train_loss": [], "val_loss": []}
    
    print("Starting Phase 2 MAD Fine-tuning...")
    
    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        
        optimizer.zero_grad()
        
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs} [Train]")
        for i, batch in enumerate(pbar):
            noisy = batch['noisy'].to(device)
            clean = batch['clean'].to(device)
            
            # Forward pass
            # df model expects input [batch, time]
            est_speech, _, _, _ = model(noisy)
            
            # Compute loss
            loss = criterion(est_speech, clean)
            loss = loss / grad_acc_steps
            
            # Backward
            loss.backward()
            
            if (i + 1) % grad_acc_steps == 0:
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
                optimizer.step()
                optimizer.zero_grad()
                
            train_loss += loss.item() * grad_acc_steps
            pbar.set_postfix({"loss": loss.item() * grad_acc_steps})
            
        train_loss /= len(train_loader)
        
        # Validation
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            vbar = tqdm(val_loader, desc=f"Epoch {epoch+1}/{epochs} [Val]")
            for batch in vbar:
                noisy = batch['noisy'].to(device)
                clean = batch['clean'].to(device)
                
                est_speech, _, _, _ = model(noisy)
                loss = criterion(est_speech, clean)
                
                val_loss += loss.item()
                vbar.set_postfix({"loss": loss.item()})
                
        val_loss /= len(val_loader)
        
        print(f"Epoch {epoch+1}: Train Loss = {train_loss:.4f}, Val Loss = {val_loss:.4f}")
        
        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        
        scheduler.step(val_loss)
        
        # Checkpointing
        checkpoint = {
            'epoch': epoch,
            'model_state_dict': model.state_dict(),
            'optimizer_state_dict': optimizer.state_dict(),
            'val_loss': val_loss
        }
        
        torch.save(checkpoint, os.path.join(checkpoint_dir, "last.pt"))
        
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            torch.save(checkpoint, os.path.join(checkpoint_dir, "best.pt"))
            print("  => New best model saved!")
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"Early stopping triggered after {epoch+1} epochs.")
                break
                
        with open(os.path.join(checkpoint_dir, "training_history.json"), "w") as f:
            json.dump(history, f, indent=4)
            
    print("Training Complete.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Run a quick dry run to check logic")
    args = parser.parse_args()
    
    if args.dry_run:
        # TODO: Implement dry-run logic by subsetting dataloaders
        pass
    else:
        train_phase2()
