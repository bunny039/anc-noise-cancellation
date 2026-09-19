import csv
import shutil
import re
from pathlib import Path


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATASET_DIR = PROJECT_ROOT / "dataset" / "MAD_dataset"

TRAIN_CSV = DATASET_DIR / "training.csv"
TEST_CSV = DATASET_DIR / "test.csv"

TRAIN_OUTPUT = PROJECT_ROOT / "data" / "raw" / "defence_noise_train"
TEST_OUTPUT = PROJECT_ROOT / "data" / "raw" / "defence_noise_test"


# ============================================================
# WINDOWS-SAFE FOLDER NAME
# ============================================================

def safe_folder_name(name):
    """
    Convert YouTube title into a Windows-safe folder name.
    """

    name = str(name).strip()

    # Remove Windows-invalid characters:
    # < > : " / \ | ? *
    name = re.sub(r'[<>:"/\\|?*]', '_', name)

    # Remove control characters
    name = re.sub(r'[\x00-\x1F]', '_', name)

    # Collapse multiple spaces
    name = re.sub(r'\s+', ' ', name)

    # Windows does not like trailing periods/spaces
    name = name.rstrip('. ')

    # Avoid extremely long paths
    if len(name) > 120:
        name = name[:120].rstrip()

    if not name:
        name = "unknown_title"

    return name


# ============================================================
# PROCESS ONE CSV
# ============================================================

def process_csv(csv_file, output_dir, split_name):

    print("\n" + "=" * 70)
    print(f"PROCESSING {split_name.upper()}")
    print("=" * 70)

    if not csv_file.exists():
        print(f"ERROR: CSV not found:")
        print(csv_file)
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    copied = 0
    missing = 0
    errors = 0

    label_counts = {}
    title_counts = {}

    with open(csv_file, "r", encoding="utf-8-sig", newline="") as f:

        reader = csv.DictReader(f)

        required_columns = {
            "path",
            "label",
            "youtube title"
        }

        missing_columns = required_columns - set(reader.fieldnames or [])

        if missing_columns:
            print("ERROR: Missing CSV columns:")
            print(missing_columns)
            return

        for row in reader:

            relative_path = row["path"].strip()
            label = row["label"].strip()
            title = row["youtube title"].strip()

            # ------------------------------------------------
            # SOURCE AUDIO
            # ------------------------------------------------

            source_file = DATASET_DIR / relative_path

            if not source_file.exists():
                missing += 1
                continue

            # ------------------------------------------------
            # SAFE TITLE
            # ------------------------------------------------

            safe_title = safe_folder_name(title)

            # ------------------------------------------------
            # DESTINATION
            #
            # label_X/
            #     youtube_title/
            #         audio.wav
            # ------------------------------------------------

            label_dir = output_dir / f"label_{label}"
            title_dir = label_dir / safe_title

            title_dir.mkdir(parents=True, exist_ok=True)

            # ------------------------------------------------
            # Avoid filename collisions
            #
            # Example:
            # training/398/0.wav
            #
            # becomes:
            # 398_0.wav
            # ------------------------------------------------

            original_path = Path(relative_path)

            parent_name = original_path.parent.name
            original_name = original_path.name

            destination_name = f"{parent_name}_{original_name}"

            destination_file = title_dir / destination_name

            # ------------------------------------------------
            # COPY
            # ------------------------------------------------

            try:
                shutil.copy2(source_file, destination_file)

                copied += 1

                label_counts[label] = label_counts.get(label, 0) + 1
                title_counts[title] = title_counts.get(title, 0) + 1

            except Exception as e:
                errors += 1
                print(f"ERROR copying: {source_file}")
                print(e)

    # ========================================================
    # SUMMARY
    # ========================================================

    print("\n" + "-" * 70)
    print(f"{split_name.upper()} SUMMARY")
    print("-" * 70)

    print(f"CSV entries : {copied + missing + errors}")
    print(f"Copied      : {copied}")
    print(f"Missing     : {missing}")
    print(f"Errors      : {errors}")

    print("\nFiles per label:")

    for label in sorted(label_counts, key=lambda x: int(x)):
        print(f"label_{label}: {label_counts[label]}")

    print(f"\nUnique YouTube titles: {len(title_counts)}")

    print(f"\nOutput directory:")
    print(output_dir)

    print("=" * 70)


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    process_csv(
        TRAIN_CSV,
        TRAIN_OUTPUT,
        "training"
    )

    process_csv(
        TEST_CSV,
        TEST_OUTPUT,
        "testing"
    )

    print("\nDONE.")