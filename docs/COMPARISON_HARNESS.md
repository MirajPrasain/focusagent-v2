# Comparison harness

This checkpoint (git tag `comparison-harness`) runs the old and new focus-scoring pipelines side by side on
the same session and logs their outputs once per second. Use it to rerun the comparison tests after the
gaze score ships.

Only the server JPEG score reaches the user. Everything from the landmark path is logged, never sent to the
client. The one exception is the calibration result, which the browser needs to offer a redo.

## What this version contains

Two pipelines share the `/ws/study` websocket ([backend/ws_routes/study_ws.py](../backend/ws_routes/study_ws.py)):

| Pipeline | Messages | Where | Output |
|---|---|---|---|
| **Server JPEG path** (old) | binary JPEG frames, 5/s | [study_mode.py](../backend/cv_project/study_mode.py) `process_frame` runs MediaPipe on the server | `Video-score`, sent to the client and shown in the UI |
| **Browser landmark path** (new) | JSON landmark messages, 5/s | the browser runs MediaPipe ([Session.tsx](../frontend/src/pages/Session.tsx)); [landmark_pipeline.py](../backend/cv_project/landmark_pipeline.py) scores the messages | logged only |

Each landmark message carries 10 landmark points, 10 eye blendshapes and the head pose (yaw and pitch,
taken from the facial transformation matrix). From one message the landmark path computes:

- **Geometric score (old rules):** `get_focus_score` on the points. It uses the same rules as the JPEG
  path: iris position, a head-turn ratio, a head-down ratio, and a blink streak.
- **Classifier + EMA + eyes-closed window:** `classify_distraction` on the 8 gaze blendshapes gives a raw
  probability. An EMA (`SMOOTHING_ALPHA = 0.15`) smooths it. If the eyes were closed in at least 7 of the
  last 10 messages (the PERCLOS rule), or no face is visible, the probability is forced to 1.0.
- **Gaze score (new):**
  - `eye_turn = (eyeLookInLeft + eyeLookOutRight - eyeLookInRight - eyeLookOutLeft) / 2`
  - `gaze_yaw = head_yaw - 33 * eye_turn`, in degrees
  - `get_gaze_score` is the geometric score with its two horizontal rules (head turn, horizontal iris)
    replaced by one rule: −70 when `gaze_yaw` is outside every on-screen range. Looking off screen alone
    gives 30, which is below the `< 40` distraction cutoff. The vertical rules, the eyes-closed check and
    the no-face rule are unchanged.
- **Calibration:** runs at the start of each session and sets the on-screen ranges. Details are below.
  Without it, the range is 0 ± 15°.

### Calibration

The calibration starts after the first landmark message with a face. The session timer, and the backend's
JPEG session clock, start only when it finishes or is skipped. Every timed step has the same rhythm: a
spoken instruction, a spoken "3, 2, 1", a recording, then "okay". The backend ignores the first 0.5s of
each recording. Nothing is scored until calibration is done.

1. **Main screen:** follow a dot once around the screen border (~10s). The range is the 5th–95th
   percentile of `gaze_yaw`, ±3°. If that span (before the margin) is narrower than 6°, the default 0 ± 15
   is used and the page offers "Redo calibration".
2. **Second screen (optional):** look at five points in turn (four corners, then center), 2s each. The
   range is [min, max] of the five per-point medians, ±5°. It's cut off where it overlaps the main range.

The browser sends `{"type": "calibration", "phase": "idle" | "main" | "second_screen" | "done"}`. The
backend replies to `done` with `{"type": "calibration", "status": "ok" | "too_narrow" | "not_calibrated",
"main": [...], "second": [...]}`.

## How to run a test

1. Start the backend and save its log under a name for this test:
   ```bash
   cd backend
   ./start_server.sh 2>&1 | tee <name>.log
   ```
   `start_server.sh` uses port 8001, or the next free port if 8001 is taken. The frontend expects 8001
   (`VITE_MEDIAPIPE_API_URL` in `frontend/.env.local`).
2. Start the frontend (`cd frontend && npm run dev`), then open the pre-session page and start a session.
   It opens `/session?duration=..&goal=..`.
3. Calibrate: follow the dot around the whole screen. Answer the second-screen question, and do the five
   points if you use one.
4. Do the 7-stage protocol below.
5. End the session. The comparison is in `backend/<name>.log`. `*.log` is gitignored, so logs stay local.

### 7-stage protocol

Setup: put the session window and VS Code side by side, both visible. Count the seconds in your head, so
nothing on screen pulls your eyes away between stages.

| # | Stage | Duration |
|---|---|---|
| 1 | Read on screen | ~12s |
| 2 | Look away | ~10s |
| 3 | Type | ~12s |
| 4 | Eyes closed | ~8s |
| 5 | Read and scroll | ~12s |
| 6 | Phone in your lap, face still in view, looking down at it | ~10s |
| 7 | Think, eyes on screen | ~10s |

## Log lines

Most lines start with `t=<seconds since connect>s` and appear at most once per second. Values come from the
latest message in that second, unless the line says otherwise. `n/a` means a value couldn't be computed:
no face, or calibration still running.

| Line | Meaning |
|---|---|
| `Video-score: 100 \| Landmark-score: 70 \| diff: 30` | Old JPEG score (what the user sees) next to the old geometric score computed from the browser's landmarks. It only appears when both paths produced a score in that second. |
| `Video-score: .. \| Raw: prob=0.76 (peak=0.80) is_distracted=True \| Smoothed: prob=0.68 is_distracted=True \| closed_ratio=0/10` | Classifier: the latest raw probability and the highest raw probability this second, the EMA-smoothed probability, each against `DISTRACTION_THRESHOLD = 0.40`, and how many of the last 10 messages had closed eyes. |
| `Peak frame blendshapes: eyeBlinkLeft=.. eyeLookOutRight=..` | The blendshapes of the frame that produced this second's peak raw probability, or `no face detected`. |
| `Head/iris: head_yaw=19.4 head_pitch=1.0 iris_h=0.39 iris_v=0.45` | Head pose in degrees (positive yaw means turned to the user's left, positive pitch means tilted up) and the iris position ratios the geometric score uses (0.5 is centered). |
| `Gaze: head_yaw=20.0 eye_turn=0.65 gaze_yaw=-1.4 \| Landmark-score=100 \| Gaze-score=100` | New gaze angle and its inputs, the old geometric score and the new gaze score, all from the same message. |
| `Vertical: head_pitch=1.5 eye_pitch=-0.17` | Vertical counterpart of `eye_turn`: `(eyeLookUpLeft + eyeLookUpRight - eyeLookDownLeft - eyeLookDownRight) / 2`, positive means eyes up. Logged only. |
| `Calibration: main=[-6.3, 12.2] second=[-21.4, -6.3] (cut at main edge from [..]) \| second-screen medians: .. \| samples: ..` | Logged once, when calibration ends. It shows the ranges the gaze score uses, how they were derived, and the sample count per recording. A `WARNING` line before it means the main scan was too narrow and the default was used. |

## Key results so far

- **7-stage scorecard:** geometric score 84/85, classifier 37/85.
- **Head-turn test** (head turned, eyes kept on the screen): `gaze_yaw` stayed within 3° of center. The new
  gaze score was 100 on all 8 logged seconds, where the old geometric score gave 20–50.
- **Calibrated second screen:** gaze score 100 on all 8 logged seconds while looking at the second screen.
- **Vertical:** the `eye_pitch` signal is too noisy to use, so there's no vertical gaze angle or vertical
  scoring change yet.
