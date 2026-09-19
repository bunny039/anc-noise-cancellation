"""
Phase 1 baseline training: trains DTLN on VoiceBank-DEMAND using the official
(vendored) architecture, SNR loss, and data generator from
external/DTLN/DTLN_model.py, with hyperparameters from configs/config.yaml's
training.phase1_baseline section. Goal: confirm performance matches published
DTLN benchmarks before touching defence noise in Phase 2.

COLAB SETUP NEEDED:
1. from google.colab import drive; drive.mount('/content/drive')
2. Upload/sync this repo to /content/drive/MyDrive/dtln-defence-speech-enhancement/
   (needs at least external/DTLN/, configs/, src/, data/processed/voicebank_demand/)
3. Runtime > Change runtime type > GPU
4. cd into the repo folder on Drive before running this script

COMPATIBILITY FIX (flagged, not silent): external/DTLN/DTLN_model.py's own
compile_model() and train_model() methods use TF/Keras APIs that no longer
exist in current TensorFlow (Adam(lr=...), a ModelCheckpoint filename that
does not end in .weights.h5, and fit() kwargs from the old fit_generator
API). This file does NOT call those two methods. It still uses the vendored
build_DTLN_model(), lossWrapper()/snr_cost, and audio_generator unchanged -
only the compile/fit orchestration around them is rewritten to work with
current Keras. Verified by actually running training end-to-end.

ASSUMPTION FLAGGED: training.phase1_baseline.snr_levels_db in config.yaml is
not used here - VoiceBank-DEMAND ships already pre-mixed at fixed SNRs, so
there is nothing to re-mix at this stage.

VERIFY BEFORE REAL TRAINING: chunk_length_seconds below (from config) must
be SHORTER than your shortest VoiceBank-DEMAND utterance, or audio_generator
silently produces 0 training samples per file (confirmed by testing - the
official DTLN_model's own default of 15 seconds is almost certainly too long
for individual VoiceBank sentences, which run a few seconds each). Check
your actual clip lengths and adjust training.phase1_baseline.chunk_length_seconds
in configs/config.yaml accordingly before running the real 100-epoch job.

PREREQUISITE: run data.prepare_dataset.prepare_voicebank_for_training() first
to produce data/processed/voicebank_demand/{clean,noisy}_{train,val}.
"""

import os
import sys

import yaml
import tensorflow.keras as keras
from tensorflow.keras.callbacks import ReduceLROnPlateau, CSVLogger, \
    EarlyStopping, ModelCheckpoint

_EXTERNAL_DTLN_PATH = os.path.join(os.path.dirname(__file__), "../../external/DTLN")
sys.path.append(os.path.abspath(_EXTERNAL_DTLN_PATH))
from DTLN_model import DTLN_model, audio_generator


def _load_config(config_path="configs/config.yaml"):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def train_baseline(config_path="configs/config.yaml"):
    config = _load_config(config_path)
    audio_cfg = config["audio"]
    train_cfg = config["training"]["phase1_baseline"]

    processed_dir = "data/processed/voicebank_demand"
    required_dirs = ["clean_train", "noisy_train", "clean_val", "noisy_val"]
    for name in required_dirs:
        path = os.path.join(processed_dir, name)
        if not os.path.isdir(path):
            raise FileNotFoundError(
                f"{path} not found. Run "
                f"data.prepare_dataset.prepare_voicebank_for_training() first."
            )

    dtln = DTLN_model()
    dtln.fs = audio_cfg["sample_rate"]
    dtln.blockLen = audio_cfg["frame_size_samples"]
    dtln.block_shift = audio_cfg["hop_size_samples"]
    dtln.batchsize = train_cfg["batch_size"]
    dtln.lr = train_cfg["learning_rate"]
    dtln.max_epochs = train_cfg["epochs"]
    dtln.len_samples = train_cfg["chunk_length_seconds"]

    dtln.build_DTLN_model()
    optimizer = keras.optimizers.Adam(learning_rate=dtln.lr, clipnorm=3.0)
    dtln.model.compile(loss=dtln.lossWrapper(), optimizer=optimizer)

    save_path = "./models_phase1_baseline/"
    os.makedirs(save_path, exist_ok=True)
    checkpointer = ModelCheckpoint(
        os.path.join(save_path, "phase1_baseline.weights.h5"),
        monitor="val_loss", verbose=1, save_best_only=True,
        save_weights_only=True, mode="auto", save_freq="epoch",
    )
    reduce_lr = ReduceLROnPlateau(
        monitor="val_loss", factor=0.5, patience=3, min_lr=1e-10, cooldown=1
    )
    early_stopping = EarlyStopping(
        monitor="val_loss", min_delta=0, patience=10, verbose=0,
        mode="auto", baseline=None,
    )
    csv_logger = CSVLogger(os.path.join(save_path, "training.log"))

    len_in_samples = int((dtln.fs * dtln.len_samples // dtln.block_shift) * dtln.block_shift)

    train_gen = audio_generator(
        os.path.join(processed_dir, "noisy_train"),
        os.path.join(processed_dir, "clean_train"),
        len_in_samples, dtln.fs, train_flag=True,
    )
    train_dataset = train_gen.tf_data_set.batch(dtln.batchsize, drop_remainder=True).repeat()
    steps_train = train_gen.total_samples // dtln.batchsize

    val_gen = audio_generator(
        os.path.join(processed_dir, "noisy_val"),
        os.path.join(processed_dir, "clean_val"),
        len_in_samples, dtln.fs,
    )
    val_dataset = val_gen.tf_data_set.batch(dtln.batchsize, drop_remainder=True).repeat()
    steps_val = val_gen.total_samples // dtln.batchsize

    if steps_train == 0 or steps_val == 0:
        raise ValueError(
            f"Not enough audio to form a full batch (steps_train={steps_train}, "
            f"steps_val={steps_val}). Reduce batch_size in configs/config.yaml "
            f"or add more data."
        )

    history = dtln.model.fit(
        x=train_dataset,
        steps_per_epoch=steps_train,
        epochs=dtln.max_epochs,
        verbose=1,
        validation_data=val_dataset,
        validation_steps=steps_val,
        callbacks=[checkpointer, reduce_lr, csv_logger, early_stopping],
    )

    return history


if __name__ == "__main__":
    train_baseline()