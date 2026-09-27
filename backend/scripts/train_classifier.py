"""
Offline training script for the focused/distracted eye-blendshape classifier.

Not part of the FastAPI app, and the classifier is not used live: the calibrated
gaze score replaced it. Results and why it lost: backend/experiments/CLASSIFIER_EXPERIMENT.md.
Run against CSVs exported from the frontend DataCollect tool.

Usage:
    python backend/scripts/train_classifier.py data1.csv data2.csv [...]
    python backend/scripts/train_classifier.py --include-blink data1.csv [...]   # old 10-feature model, for comparison

With 2+ CSVs it also runs leave-one-session-out: train on all files but one, test on the held-out file.
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

# Gaze only. Blinks are left out: they fired on ordinary blinks during focus, so eyes-closed was handled
# by a separate duration rule instead.
BLINK_FEATURES = ["eyeBlinkLeft", "eyeBlinkRight"]
FEATURES = [
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
THRESHOLDS = [0.3, 0.35, 0.4, 0.45, 0.5]


def load_dataset(paths, features):
    """Returns (X, y, groups); groups[i] is the index of the CSV row i came from."""
    rows_X, rows_y, rows_group = [], [], []
    skipped = 0
    for group, path in enumerate(paths):
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            missing = [c for c in features + ["label"] if c not in (reader.fieldnames or [])]
            if missing:
                sys.exit(f"{path} is missing columns: {missing}")
            count = 0
            for row in reader:
                # Labels may be exported as strings ("focused"/"distracted") or already 0/1
                raw = row["label"].strip().lower()
                label = LABEL_MAP.get(raw, {"0": 0, "1": 1}.get(raw))
                try:
                    values = [float(row[c]) for c in features]
                except (TypeError, ValueError):
                    values = None
                if label is None or values is None:
                    skipped += 1
                    continue
                rows_X.append(values)
                rows_y.append(label)
                rows_group.append(group)
                count += 1
        print(f"Loaded {count:>4} rows from {path}")

    if skipped:
        print(f"Skipped {skipped} rows with unknown labels or missing features")
    return np.array(rows_X, dtype=float), np.array(rows_y, dtype=int), np.array(rows_group, dtype=int)


def print_sweep(y_true, proba):
    print(f"{'threshold':>9} {'accuracy':>9} {'precision':>10} {'recall':>8} {'F1':>8} {'false alarms':>13} {'misses':>8}")
    for threshold in THRESHOLDS:
        y_thr = (proba >= threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_true, y_thr, labels=[0, 1]).ravel()
        print(
            f"{threshold:>9.2f}"
            f" {accuracy_score(y_true, y_thr):>9.4f}"
            f" {precision_score(y_true, y_thr, zero_division=0):>10.4f}"
            f" {recall_score(y_true, y_thr, zero_division=0):>8.4f}"
            f" {f1_score(y_true, y_thr, zero_division=0):>8.4f}"
            f" {fp:>13}"
            f" {fn:>8}"
        )


def cross_session(X, y, groups, paths):
    """Leave-one-session-out: a truer estimate than a random split, since frames within one session are near-duplicates."""
    print("\n=== Cross-session (train on the other files, test on the held-out one) ===")
    print(f"{'held-out file':<48} {'rows':>5} {'acc@0.50':>9} {'acc@0.40':>9}")
    pooled_y, pooled_proba = [], []
    for group, path in enumerate(paths):
        test = groups == group
        model = LogisticRegression(max_iter=1000).fit(X[~test], y[~test])
        proba = model.predict_proba(X[test])[:, 1]
        acc_50 = accuracy_score(y[test], (proba >= 0.5).astype(int))
        acc_40 = accuracy_score(y[test], (proba >= 0.4).astype(int))
        print(f"{path.rsplit('/', 1)[-1]:<48} {int(test.sum()):>5} {acc_50:>9.4f} {acc_40:>9.4f}")
        pooled_y.append(y[test])
        pooled_proba.append(proba)
    print("\nThreshold sweep on all held-out predictions pooled:")
    print_sweep(np.concatenate(pooled_y), np.concatenate(pooled_proba))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", nargs="+", help="CSV files exported from the data collection tool")
    parser.add_argument("--include-blink", action="store_true", help="also use the two eyeBlink features (the old model)")
    args = parser.parse_args()

    features = BLINK_FEATURES + FEATURES if args.include_blink else FEATURES
    print(f"Features ({len(features)}): {', '.join(features)}")
    X, y, groups = load_dataset(args.csv, features)
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

    # Same model, same test set: only the p(distracted) cutoff changes
    proba = model.predict_proba(X_test)[:, 1]
    n_focused_test, n_distracted_test = int((y_test == 0).sum()), int((y_test == 1).sum())
    print(f"\n=== Threshold sweep (test set: {n_focused_test} focused, {n_distracted_test} distracted) ===")
    print_sweep(y_test, proba)

    if len(args.csv) > 1:
        cross_session(X, y, groups, args.csv)

    print("\n=== Learned weights (copy these) ===")
    for name, coef in zip(features, model.coef_[0]):
        print(f"{name:<18} {coef:+.6f}")
    print(f"{'intercept':<18} {model.intercept_[0]:+.6f}")

    print("\nAs a Python dict:")
    print("WEIGHTS = {")
    for name, coef in zip(features, model.coef_[0]):
        print(f'    "{name}": {coef:.6f},')
    print("}")
    print(f"INTERCEPT = {model.intercept_[0]:.6f}")


if __name__ == "__main__":
    np.set_printoptions(suppress=True)
    main()
