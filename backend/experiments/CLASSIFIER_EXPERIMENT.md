# Blendshape classifier experiment

A logistic-regression classifier on MediaPipe eye blendshapes was trained to decide whether the user was focused
or distracted. Offline, it reached 73.8% cross-session accuracy. On the live 7-stage test it got 37/85,
against 84/85 for the geometric score: it caught every distracted stage, but scored only 11/59 on the
focused stages. The calibrated gaze score shipped instead, and the classifier's live code was deleted.

The live classifier code is at git tag `comparison-harness`
(`backend/cv_project/distraction_classifier.py`, `backend/cv_project/landmark_pipeline.py`). The training script
is still in the repo: [scripts/train_classifier.py](../scripts/train_classifier.py).

## Setup

- **Data:** 1,440 labeled rows from 3 guided sessions, recorded with the DataCollect page
  ([DataCollect.tsx](../../frontend/src/pages/DataCollect.tsx)). The guided script alternates 12-second
  poses:
  - Focused: reading, typing, leaning in, leaning back, all with eyes on the screen.
  - Distracted: looking away left, looking away right, looking down at a phone, eyes closed, head turned fully
    to one side.
- **Features:** the 8 gaze blendshapes, `eyeLook{Down,Up,In,Out}{Left,Right}`. The first model also used
  `eyeBlinkLeft` and `eyeBlinkRight`. They were dropped because ordinary blinks during focus pushed the
  probability over the threshold.
- **Model:** logistic regression on the raw scores, so the weights could be hardcoded:
  `p(distracted) = sigmoid(intercept + Σ wᵢ·xᵢ)`.
- **Live wiring (logged only, never sent to the client):**
  - The raw probability was smoothed with an EMA (α = 0.15).
  - If the eyes were closed in at least 7 of the last 10 messages (a PERCLOS window), the probability was
    forced to 1.0. The same happened when no face was visible.
  - The smoothed value was compared against the threshold.

Final weights (8 features, threshold 0.40):

| Feature | Weight |
|---|---|
| eyeLookDownLeft | 0.277906 |
| eyeLookDownRight | 3.382252 |
| eyeLookUpLeft | −0.652687 |
| eyeLookUpRight | −0.456009 |
| eyeLookInLeft | 2.758315 |
| eyeLookInRight | 2.791569 |
| eyeLookOutLeft | 2.664299 |
| eyeLookOutRight | 2.560867 |
| intercept | −2.039509 |

## Offline results

### Cross-session accuracy

Leave one session out: train on 2 sessions, test on the 3rd, and pool the three held-out sets. This is a
truer estimate than a random split, because frames from one session are near-duplicates of each other.

| Model | Accuracy @ 0.50 | Accuracy @ 0.40 |
|---|---|---|
| 10 features (with eyeBlink) | 77.9% | 76.9% |
| 8 gaze features (final) | 73.3% | 73.8% |

For single held-out sessions, accuracy ranged from 70% to 80% with 8 features, and from 70% to 84% with 10.
Dropping the blink features cost 3–5 points offline. The drop was accepted because blinks caused false alarms
during focus.

### Threshold sweep

**10-feature model.** Test set from a random 80/20 split of the 3 sessions: 143 focused rows, 145 distracted.

| Threshold | Precision | Recall | F1 | False alarms | Misses |
|---|---|---|---|---|---|
| 0.30 | 0.670 | 0.897 | 0.767 | 64 | 15 |
| 0.35 | 0.717 | 0.855 | 0.780 | 49 | 21 |
| **0.40** | 0.753 | 0.821 | **0.786** | 39 | 26 |
| 0.45 | 0.778 | 0.772 | 0.775 | 32 | 33 |
| 0.50 | 0.807 | 0.752 | 0.779 | 26 | 36 |

0.40 had the best F1. It's also below the default 0.50 on purpose: for this product, a missed distraction
costs more than a false alarm. Going from 0.50 to 0.40 cut misses from 36 to 26, at the cost of 13 more false
alarms.

**8-feature model.** Pooled held-out predictions from the cross-session runs:

| Threshold | F1 |
|---|---|
| 0.35 | 0.751 |
| **0.40** | **0.756** |
| 0.45 | 0.743 |

0.40 was still the best, so the threshold stayed.

## Live result: 7-stage scorecard

This run was on 2026-09-26, with the final live wiring: the 8-feature classifier, the eyes-closed window and the
EMA. All three scores ran on the same session and were logged side by side. The session followed the 7-stage
protocol in [docs/COMPARISON_HARNESS.md](../../docs/COMPARISON_HARNESS.md). "Video" is the server JPEG
score, the live score at the time.

| # | Stage | Expected | Video | Geometric | Classifier |
|---|---|---|---|---|---|
| 1 | Read on screen | focused | 12/12 | 12/12 | 1/12 |
| 2 | Look away | distracted | 9/9 | 9/9 | 9/9 |
| 3 | Type | focused | 14/14 | 14/14 | 3/14 |
| 4 | Eyes closed | distracted | 7/7 | 7/7 | 7/7 |
| 5 | Read and scroll | focused | 16/16 | 16/16 | 0/16 |
| 6 | Phone in lap | distracted | 10/10 | 9/10 | 10/10 |
| 7 | Think, eyes on screen | focused | 17/17 | 17/17 | 7/17 |
| | **Total** | | **85/85** | **84/85** | **37/85** |
| | Focused stages (1, 3, 5, 7) | | 59/59 | 59/59 | 11/59 |
| | Distracted stages (2, 4, 6) | | 26/26 | 25/26 | 26/26 |

The classifier never missed a distraction. Its whole gap is in the focused stages, where it flagged 48 of 59
as distracted.

## Why it failed live: dataset shift

The training "focused" poses were recorded looking at the center of the screen. In the live protocol, the
session window sits next to VS Code, so focused reading happens off center, with the eyes turned to the side.
Offline testing couldn't catch this: every held-out session came from the same guided script, so 73.8%
measures "a new session of the same poses", not "a new setup".

The peak-frame log from the 2026-09-26 run shows it. These frames came from focused reading in a side window,
and both were flagged:

| Time in run | eyeLookInRight / eyeLookOutLeft |
|---|---|
| t=51.4s | 0.31–0.44 |
| t=78.8s | 0.43–0.44 |

With the final weights, those two features alone, with every other feature at 0, give p(distracted) from 0.41
(both at 0.31) to 0.59 (both at 0.44). Both are above the 0.40 threshold. All four `eyeLookIn`/`eyeLookOut`
weights are large and positive (2.56–2.79), so the model learned "eyes turned in their sockets = distracted".
That held at screen center and failed for a side window. Head pose isn't an input, so the model has no way to
tell a side window from looking away.

## What replaced it

The gaze score (`backend/cv_project/landmark_pipeline.py`):

- It combines head yaw and eye rotation into one gaze angle:
  `gaze_yaw = head_yaw − 33 · eye_turn`.
- It checks that angle against screen ranges measured for each user at the start of each session. The user
  follows a dot around the main screen, and optionally looks at five points on a second screen.
- It keeps the geometric score's vertical rules, eyes-closed streak and no-face rule.

Because the screen's extent is measured every session instead of learned once, a side window or a second
screen is inside the calibrated range, not an extrapolation. In the head-turn test (head turned, eyes on the
screen), it scored 100 on all 8 logged seconds, where the old geometric score gave 20–50.

## Reproducing

The CSVs exported from DataCollect aren't in the repo. The script also needs scikit-learn, which isn't in
`requirements.txt` because the server doesn't use it. With the CSVs:

```bash
pip install scikit-learn numpy
python backend/scripts/train_classifier.py session1.csv session2.csv session3.csv            # 8-feature model
python backend/scripts/train_classifier.py --include-blink session1.csv session2.csv session3.csv  # 10-feature model
```

The script prints the test-set threshold sweep. With 2 or more CSVs, it also prints the cross-session accuracy
for each held-out file and the sweep on the pooled held-out predictions. To rerun the live comparison, check
out the `comparison-harness` tag and follow [docs/COMPARISON_HARNESS.md](../../docs/COMPARISON_HARNESS.md) on
that checkout.
