# Blendshape classifier experiment

A logistic-regression classifier on MediaPipe eye blendshapes was trained to decide whether the user was focused
or distracted. It scored 70–80% offline, but only 37/85 on the live 7-stage test, against 84/85 for the
geometric score. The calibrated gaze score shipped instead, and the classifier's live code was deleted.

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

**Cross-session accuracy** (leave one session out: train on 2 sessions, test on the 3rd). This is a truer
estimate than a random split, because frames from one session are near-duplicates of each other.

| Model | Accuracy on the held-out session |
|---|---|
| 8 gaze features, threshold 0.40 | 70–80% |
| 10 features (with eyeBlink) | 70–84% |

**Threshold sweep:** the training script scores thresholds 0.30, 0.35, 0.40, 0.45 and 0.50.
- 0.40 was picked from the first sweep (10-feature model). It's below the default 0.50 on purpose: for this
  product, a missed distraction costs more than a false alarm, so the threshold trades some precision for
  recall.
- The sweep was rerun for the 8-feature model on the pooled held-out predictions, and 0.40 still gave the
  best F1.

The per-threshold numbers weren't saved. The training script prints the table (see Reproducing).

## Live result: 7-stage scorecard

Both scores ran on the same live session and were logged side by side, using the 7-stage protocol in
[docs/COMPARISON_HARNESS.md](../../docs/COMPARISON_HARNESS.md): read on screen, look away, type, eyes closed,
read and scroll, phone in lap, think with eyes on screen.

| Scorer | Correct |
|---|---|
| Geometric score (landmark rules) | **84/85** |
| Blendshape classifier | **37/85** |

## Why it failed live: dataset shift

Every offline test set came from the same guided script as the training data. So the 70–80% measures "a
new session of the same poses", not "a new setup". The live test changed what the features look like:

- **"On screen" was in a different place.** In the guided sessions, "focused" meant looking at the
  DataCollect page. In the live protocol, the session window sits next to VS Code, so reading and typing turn
  the eyes toward one side of the screen. The weights make sideways eye rotation expensive. About 0.3 of
  `eyeLookIn` on one eye plus 0.3 of `eyeLookOut` on the other is enough to cross 0.40 with nothing else
  going on. Focused work on the side of a wide screen reads as "looking away".
- **The features can't see the head.** Blendshapes only describe how the eyes sit in their sockets. The same
  eye rotation means "on screen" or "off screen" depending on where the head points, and head pose isn't an
  input. A head turned away with the eyes centered in their sockets looks focused. A head turned toward the
  screen's edge with the eyes compensating looks distracted.
- **One fixed boundary for every setup.** A single set of weights assumes one screen size, one seating
  position and one camera placement: the ones in the training sessions. Anything else is extrapolation.

## What replaced it

The gaze score (`backend/cv_project/landmark_pipeline.py`):

- It combines head yaw and eye rotation into one gaze angle:
  `gaze_yaw = head_yaw − 33 · eye_turn`.
- It checks that angle against screen ranges measured for each user at the start of each session. The user
  follows a dot around the main screen, and optionally looks at five points on a second screen.
- It keeps the geometric score's vertical rules, eyes-closed streak and no-face rule.

Because the screen's extent is measured every session instead of learned once, a new layout is calibrated,
not extrapolated. In the head-turn test (head turned, eyes on the screen), it scored 100 on all 8 logged
seconds, where the old geometric score gave 20–50.

## Reproducing

The CSVs exported from DataCollect aren't in the repo. With them:

```bash
python backend/scripts/train_classifier.py session1.csv session2.csv session3.csv            # 8-feature model
python backend/scripts/train_classifier.py --include-blink session1.csv session2.csv session3.csv  # 10-feature model
```

With 2 or more CSVs, the script prints the cross-session accuracy for each held-out file and the threshold sweep
on the pooled held-out predictions. To rerun the live comparison, check out the `comparison-harness` tag and
follow [docs/COMPARISON_HARNESS.md](../../docs/COMPARISON_HARNESS.md) on that checkout.
