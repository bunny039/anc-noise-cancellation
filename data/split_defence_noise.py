"""
One-time split of the existing defence-noise clip pool into disjoint
train and test directories, fixing the train/test leakage confirmed in
this project: every one of the 29 existing clips was being used by both
build_synthetic_defence_set() (training) and prepare_synthetic_defence_test.py
(test), via the same config key (datasets.synthetic.defence_noise_dir).

Reads from data/raw/defence_noise/<category>/<file>, writes copies (not
moves - the original download stays untouched as a safety net) into:
  data/raw/defence_noise_train/<category>/<file>
  data/raw/defence_noise_test/<category>/<file>

With only 4-5 clips per category, a fixed test fraction is not safe -
this guarantees AT LEAST 1 file per category in each of train and test,
never emptying either side even for the smallest categories.

After running this, configs/config.yaml's datasets.synthetic.defence_noise_dir
must point to defence_noise_train (for training data generation), and
prepare_synthetic_defence_test.py must be updated to read from a NEW config
key pointing to defence_noise_test (separate change, not done by this
script).

COMMIT NOTE: commit once this has been run once and the printed per-category
counts look sane (every category present on both sides, no category with
zero files on either side).
"""

import os
import random
import shutil

SOURCE_DIR = "data/raw/defence_noise"
TRAIN_DIR = "data/raw/defence_noise_train"
TEST_DIR = "data/raw/defence_noise_test"
TEST_FRACTION = 0.2
SEED = 42


def split_defence_noise(source_dir=SOURCE_DIR, train_dir=TRAIN_DIR,
                         test_dir=TEST_DIR, test_fraction=TEST_FRACTION,
                         seed=SEED):
    if not os.path.isdir(source_dir):
        raise FileNotFoundError(f"Source directory not found:\n{source_dir}")

    rng = random.Random(seed)
    categories = sorted(
        c for c in os.listdir(source_dir)
        if os.path.isdir(os.path.join(source_dir, c))
    )

    if not categories:
        raise ValueError(f"No category subfolders found under {source_dir}")

    print(f"Found {len(categories)} categories under {source_dir}")
    print()

    total_train = 0
    total_test = 0

    for category in categories:
        category_path = os.path.join(source_dir, category)
        files = sorted(os.listdir(category_path))

        if not files:
            print(f"  WARNING: {category} has no files, skipping.")
            continue

        shuffled = list(files)
        rng.shuffle(shuffled)

        test_count = max(1, round(len(shuffled) * test_fraction))
        test_count = min(test_count, len(shuffled) - 1) if len(shuffled) > 1 else 0

        test_files = shuffled[:test_count]
        train_files = shuffled[test_count:]

        if not train_files:
            raise ValueError(
                f"Category {category} would end up with zero train files "
                f"({len(files)} total). Add more clips to this category "
                f"before splitting."
            )

        train_category_dir = os.path.join(train_dir, category)
        test_category_dir = os.path.join(test_dir, category)
        os.makedirs(train_category_dir, exist_ok=True)
        os.makedirs(test_category_dir, exist_ok=True)

        for fname in train_files:
            shutil.copy2(
                os.path.join(category_path, fname),
                os.path.join(train_category_dir, fname)
            )
        for fname in test_files:
            shutil.copy2(
                os.path.join(category_path, fname),
                os.path.join(test_category_dir, fname)
            )

        print(f"  {category:<20} total={len(files):<3} "
              f"train={len(train_files):<3} test={len(test_files)}")

        total_train += len(train_files)
        total_test += len(test_files)

    print()
    print(f"Total: {total_train} train files, {total_test} test files, "
          f"{total_train + total_test} overall.")
    print()
    print(f"Train pool written to: {train_dir}")
    print(f"Test pool written to:  {test_dir}")
    print()
    print("NEXT STEPS (not done by this script):")
    print("1. Update configs/config.yaml's datasets.synthetic.defence_noise_dir")
    print(f"   to point to {train_dir}")
    print("2. Add a new config key for the test pool and update")
    print(f"   prepare_synthetic_defence_test.py to read it, pointing to {test_dir}")
    print("3. Re-run build_synthetic_defence_set() is NOT required if training")
    print("   data was already built from the full 29-file pool including train")
    print("   files - only regenerate if you want a clean rebuild.")
    print("4. Re-run prepare_synthetic_defence_test.py to regenerate the test")
    print("   set from the now-disjoint test pool.")


if __name__ == "__main__":
    split_defence_noise()