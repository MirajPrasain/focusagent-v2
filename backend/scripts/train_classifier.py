"""
Offline training script for the focused/distracted eye-blendshape classifier.

Not part of the FastAPI app. Run once against CSVs exported from the
frontend DataCollect tool, then copy the printed weights into the backend.

Usage:
    python backend/scripts/train_classifier.py data1.csv data2.csv [...]
"""

import argparse
import csv
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

FEATURES = [
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "eyeLookDownLeft",
    "eyeLookDownRight",
    "eyeLookUpLeft",
    "eyeLookUpRight",
    "eyeLookInLeft",
    "eyeLookInRight",
    "eyeLookOutLeft",
    "eyeLookOutRight",
]
LABEL_MAP = {"focused": 0, "distracted": 1}
RANDOM_STATE = 42


def load_dataset(paths):
    rows_X, rows_y = [], []
    skipped = 0
    for path in paths:
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            missing = [c for c in FEATURES + ["label"] if c not in (reader.fieldnames or [])]
            if missing:
                sys.exit(f"{path} is missing columns: {missing}")
            count = 0
            for row in reader:
                # Labels may be exported as strings ("focused"/"distracted") or already 0/1
                raw = row["label"].strip().lower()
                label = LABEL_MAP.get(raw, {"0": 0, "1": 1}.get(raw))
                try:
                    features = [float(row[c]) for c in FEATURES]
                except (TypeError, ValueError):
                    features = None
                if label is None or features is None:
                    skipped += 1
                    continue
                rows_X.append(features)
                rows_y.append(label)
                count += 1
        print(f"Loaded {count:>4} rows from {path}")

    if skipped:
        print(f"Skipped {skipped} rows with unknown labels or missing features")
    return np.array(rows_X, dtype=float), np.array(rows_y, dtype=int)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", nargs="+", help="CSV files exported from the data collection tool")
    args = parser.parse_args()

    X, y = load_dataset(args.csv)
    n_focused, n_distracted = int((y == 0).sum()), int((y == 1).sum())
    print(f"\nCombined dataset: {len(y)} rows  (focused=0: {n_focused}, distracted=1: {n_distracted})")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    print(f"Train: {len(y_train)} rows   Test: {len(y_test)} rows")

    # Raw (unscaled) features so the weights can be hardcoded directly:
    #   p(distracted) = sigmoid(intercept + sum(w_i * x_i))
    model = LogisticRegression(max_iter=1000)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    print("\n=== Test set metrics (positive class = distracted) ===")
    print(f"Accuracy : {accuracy_score(y_test, y_pred):.4f}")
    print(f"Precision: {precision_score(y_test, y_pred, zero_division=0):.4f}")
    print(f"Recall   : {recall_score(y_test, y_pred, zero_division=0):.4f}")
    print(f"F1       : {f1_score(y_test, y_pred, zero_division=0):.4f}")

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred, labels=[0, 1]).ravel()
    print("\n=== Confusion matrix ===")
    print(f"{'':>20}{'pred focused':>15}{'pred distracted':>18}")
    print(f"{'actual focused':>20}{tn:>15}{fp:>18}")
    print(f"{'actual distracted':>20}{fn:>15}{tp:>18}")
    print(f"False alarms (focused flagged as distracted): {fp}")
    print(f"Misses (distracted not caught)              : {fn}")

    print("\n=== Learned weights (copy these) ===")
    for name, coef in zip(FEATURES, model.coef_[0]):
        print(f"{name:<18} {coef:+.6f}")
    print(f"{'intercept':<18} {model.intercept_[0]:+.6f}")

    print("\nAs a Python dict:")
    print("WEIGHTS = {")
    for name, coef in zip(FEATURES, model.coef_[0]):
        print(f'    "{name}": {coef:.6f},')
    print("}")
    print(f"INTERCEPT = {model.intercept_[0]:.6f}")


if __name__ == "__main__":
    np.set_printoptions(suppress=True)
    main()
