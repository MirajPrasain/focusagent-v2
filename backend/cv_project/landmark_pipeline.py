import json
import logging
import time
from collections import deque, namedtuple

import numpy as np

from cv_project.geometry import eye_openness, head_down_ratio
from cv_project.study_mode import get_focus_score, get_iris_ratios, has_all_landmarks, new_scoring_state
from cv_project.distraction_classifier import classify_distraction, DISTRACTION_WEIGHTS

logger = logging.getLogger(__name__)

# Landmark JSON pipeline (text messages): the browser runs MediaPipe itself and sends landmark points plus
# eye blendshapes for each detection. This is the pipeline that will replace JPEG frame scoring. For now its
# results are only logged next to the JPEG frame score (ws_routes/score_comparison.py), never sent to the client.
#
#   landmark message
#     ├── points      -> get_focus_score()        rule-based score
#     │               -> get_iris_ratios()        logged only
#     ├── headPose    -> yaw/pitch in degrees     logged only
#     ├── headPose yaw + eye blendshapes -> gaze_yaw -> get_gaze_score()   logged only
#     └── blendshapes -> classify_distraction()   raw probability ─┐
#                     -> eyes-closed window (PERCLOS) (1.0 if closed) ─┴-> EMA (smoothed_prob)
#
#   calibration message {"phase": ...} (start of the session, see CALIBRATION_RECORDING_PHASES)
#     until "done", landmark messages only collect gaze_yaw (during recordings); nothing is scored
#     "done" -> screen_ranges that get_gaze_score() checks gaze_yaw against, and a reply to the client

# EMA over per-message classifier probabilities: a single-frame spike (a blink, a momentary glance)
# gets pulled toward the recent average instead of flagging outright, while sustained distraction
# still pushes the smoothed value across the threshold within roughly 1-2s at the current message rate.
# SMOOTHING_ALPHA is the one knob to tune: higher reacts faster, lower filters more noise.
SMOOTHING_ALPHA = 0.15

# Eyes-closed rule (PERCLOS: percentage of eyelid closure over a rolling window). The classifier only sees gaze,
# so a single blink can't flag distraction. Instead, if at least EYES_CLOSED_RATIO of the last EYES_CLOSED_WINDOW
# messages (~2s at 5 messages/s) had closed eyes, the message counts as maximally distracted (1.0), the same way
# no-face is handled. Unlike a consecutive-frame counter, one noisy "open" reading mid-closure doesn't reset it.
# A frame counts as closed when (eyeBlinkLeft + eyeBlinkRight) / 2 is above EYES_CLOSED_THRESHOLD.
EYES_CLOSED_THRESHOLD = 0.5
EYES_CLOSED_WINDOW = 10
EYES_CLOSED_RATIO = 0.7

# Horizontal gaze angle = head yaw corrected by how far the eyes are turned in their sockets:
#   eye_turn = (eyeLookInLeft + eyeLookOutRight - eyeLookInRight - eyeLookOutLeft) / 2, positive = eyes to the user's right
# Vertical counterpart, logged only for now (no vertical gaze angle or scoring yet):
#   eye_pitch = (eyeLookUpLeft + eyeLookUpRight - eyeLookDownLeft - eyeLookDownRight) / 2, positive = eyes up
#   gaze_yaw = head_yaw - EYE_TO_HEAD_DEG * eye_turn   (head_yaw positive = head turned to the user's left)
# EYE_TO_HEAD_DEG converts eye_turn to degrees; a fixed guess until per-user calibration replaces it.
EYE_TO_HEAD_DEG = 33
# Without calibration the screen spans SCREEN_CENTER_DEG ± SCREEN_HALF_WIDTH_DEG of gaze_yaw
SCREEN_CENTER_DEG = 0
SCREEN_HALF_WIDTH_DEG = 15
DEFAULT_SCREEN_RANGE = (SCREEN_CENTER_DEG - SCREEN_HALF_WIDTH_DEG, SCREEN_CENTER_DEG + SCREEN_HALF_WIDTH_DEG)

# Per-session calibration (Session.tsx). The browser sends {"type": "calibration", "phase": ...}:
#   "idle"           calibrating but not recording (instructions, countdowns, the second-screen question)
#   "main"           recording starts: the user follows a dot around the main screen's border (~10s).
#                    Starts a new calibration run, so a redo discards the previous samples
#   "second_screen"  recording starts for one of the five second-screen points ({"point": ...}, 2s each)
#   "done"           calibration ends; {"skipped": true} discards the samples and keeps the default range
# The first CALIBRATION_SETTLE_S of every recording is ignored while the eyes move to the target.
#   main screen range   = CALIBRATION_PERCENTILES of the main samples, widened by SCREEN_MARGIN_DEG on each side
#   second screen range = [min, max] of the per-point medians, widened by SECOND_SCREEN_MARGIN_DEG on each side,
#                         only if that phase was recorded. Per-point medians, so a glance back at the main screen
#                         during one point can't stretch the range. Where it overlaps the main range it's cut off
#                         at the main range's edge (the main range wins)
# If the main samples span less than MIN_MAIN_RANGE_DEG (before the margin), the user probably didn't follow
# the dot: the main range falls back to DEFAULT_SCREEN_RANGE and the client is told so it can offer a redo.
CALIBRATION_RECORDING_PHASES = ("main", "second_screen")
CALIBRATION_SETTLE_S = 0.5
CALIBRATION_PERCENTILES = (5, 95)
SCREEN_MARGIN_DEG = 3
SECOND_SCREEN_MARGIN_DEG = 5
MIN_MAIN_RANGE_DEG = 6
# Looking off screen alone leaves 100 - 70 = 30, below the score < 40 distraction cutoff (study_mode.py)
GAZE_OFF_SCREEN_PENALTY = 70

# What one landmark message produced. Each field is None when that part couldn't be computed.
#   focus_score: get_focus_score on the points
#   probability: raw classifier probability (1.0 when no face was detected or the eyes-closed rule fired)
#   blendshapes: both eyeBlink values plus the gaze features the classifier saw (None when no face was detected)
#   head_pose: (yaw, pitch) in degrees from the browser's facial transformation matrix
#   iris_ratios: (horizontal, vertical) from get_iris_ratios on the points
#   eye_turn, gaze_yaw, eye_pitch: see EYE_TO_HEAD_DEG
#   gaze_score: get_gaze_score on the points and gaze_yaw (None during calibration: nothing is scored then)
LandmarkReading = namedtuple(
    "LandmarkReading",
    ["focus_score", "probability", "blendshapes", "head_pose", "iris_ratios", "eye_turn", "gaze_yaw", "gaze_score",
     "eye_pitch"],
    defaults=[None] * 6,
)


def get_gaze_score(landmarks, gaze_yaw, state, screen_ranges=(DEFAULT_SCREEN_RANGE,)):
    """get_focus_score with its horizontal rules (head turn, horizontal iris) replaced by one gaze_yaw rule:
    off screen unless gaze_yaw is inside one of screen_ranges ((low, high) pairs, in degrees).
    The vertical rules, the eyes-closed check and no-face are copied from get_focus_score unchanged.
    Returns None when gaze_yaw is None, since the horizontal direction can't be judged."""
    if not has_all_landmarks(landmarks):
        return 0
    if gaze_yaw is None:
        return None

    eye_aspect_ratio = eye_openness(landmarks[159], landmarks[145], landmarks[33], landmarks[133])
    _, iris_vertical = get_iris_ratios(landmarks)
    head_down_value = head_down_ratio(landmarks[1], landmarks[152], landmarks[151])

    focus = 100
    if not any(low <= gaze_yaw <= high for low, high in screen_ranges):
        focus -= GAZE_OFF_SCREEN_PENALTY
    if iris_vertical < 0.25 or iris_vertical > 0.75:
        focus -= 50
    if head_down_value > 1.3 or head_down_value < 0.75:
        focus -= 50
    if iris_vertical < 0.4 or iris_vertical > 0.6:
        focus -= 30

    # Eyes closed: same blink-streak check as get_focus_score, on this scorer's own state
    if eye_aspect_ratio < 0.2:
        state["blink_counter"] += 1
        if state["blink_counter"] >= 3:
            return 0
    else:
        state["blink_counter"] = 0

    return max(0, focus)


class LandmarkPipeline:
    """Per-connection state for the landmark JSON pipeline."""

    def __init__(self):
        # Own scoring state, so it can't disturb the JPEG frame pipeline's blink counter
        self.scoring_state = new_scoring_state()
        # get_gaze_score keeps its own blink streak, so the two scorers don't double-count a frame
        self.gaze_scoring_state = new_scoring_state()
        self.smoothed_prob = None
        # Closed/open status of the last EYES_CLOSED_WINDOW messages, for the eyes-closed rule
        self.eyes_closed_window = deque(maxlen=EYES_CLOSED_WINDOW)
        # Calibration: the running phase (None when not calibrating), when its recording started, gaze_yaw samples
        # per recording ("main", or "second_screen/<point>" for each second-screen point), and the (low, high)
        # gaze_yaw ranges that count as on screen
        self.calibration_phase = None
        self.recording_started = None
        self.recording_key = None
        self.calibration_samples = {}
        self.screen_ranges = [DEFAULT_SCREEN_RANGE]

    @property
    def closed_count(self):
        """How many of the last EYES_CLOSED_WINDOW messages had closed eyes."""
        return sum(self.eyes_closed_window)

    def handle_text_message(self, text):
        """Handles one text message. Returns (reading, reply): reading is the LandmarkReading of a landmark message
        (None for a calibration message), reply is a dict to send to the client (the calibration result on "done")."""
        try:
            message = json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid landmark JSON: {e}")
            return LandmarkReading(None, None, None), None
        if message.get("type") == "calibration":
            return None, self.handle_calibration_message(message)
        if message.get("type") != "landmarks":
            logger.warning(f"Unknown text message: {message}")
            return LandmarkReading(None, None, None), None
        return self.handle_landmark_message(message), None

    def handle_calibration_message(self, message):
        """Switches the calibration phase. On "done" returns the calibration result for the client, else None."""
        phase = message.get("phase")
        if phase == "main":
            self.calibration_samples = {}  # a new calibration run (or a redo) starts from scratch
        if phase == "idle" or phase in CALIBRATION_RECORDING_PHASES:
            self.calibration_phase = phase
            self.recording_started = time.monotonic()
            self.recording_key = f"second_screen/{message.get('point', 'unknown')}" if phase == "second_screen" else phase
        elif phase == "done":
            self.calibration_phase = None
            if message.get("skipped"):
                self.calibration_samples = {}
            return self.finish_calibration()
        else:
            logger.warning(f"Unknown calibration phase: {message}")
        return None

    def finish_calibration(self):
        """Sets screen_ranges from the collected samples, logs the result and returns it as a client message:
        {"type": "calibration", "status": "ok" | "too_narrow" | "not_calibrated", "main": [low, high], "second": ...}"""
        def percentile_range(samples):
            low, high = np.percentile(samples, CALIBRATION_PERCENTILES)
            return float(low), float(high)

        def fmt(bounds):
            return f"[{bounds[0]:.1f}, {bounds[1]:.1f}]"

        main_samples = self.calibration_samples.get("main")
        if not main_samples:
            status, main, main_note = "not_calibrated", DEFAULT_SCREEN_RANGE, " (default, not calibrated)"
        else:
            low, high = percentile_range(main_samples)
            if high - low < MIN_MAIN_RANGE_DEG:
                logger.warning(f"Calibration: main screen span {fmt((low, high))} is narrower than {MIN_MAIN_RANGE_DEG}°, "
                               f"falling back to the default {fmt(DEFAULT_SCREEN_RANGE)}")
                status, main, main_note = "too_narrow", DEFAULT_SCREEN_RANGE, " (default, calibration too narrow)"
            else:
                status, main, main_note = "ok", (low - SCREEN_MARGIN_DEG, high + SCREEN_MARGIN_DEG), ""
        self.screen_ranges = [main]

        second, second_note = None, ""
        point_medians = {key.split("/", 1)[1]: float(np.median(samples))
                         for key, samples in self.calibration_samples.items()
                         if key.startswith("second_screen/") and samples}
        if point_medians:
            low = min(point_medians.values()) - SECOND_SCREEN_MARGIN_DEG
            high = max(point_medians.values()) + SECOND_SCREEN_MARGIN_DEG
            # Overlap with the main range: cut the second range off at the main range's nearer edge
            if (low + high) / 2 < (main[0] + main[1]) / 2:
                cut = (low, min(high, main[0]))
            else:
                cut = (max(low, main[1]), high)
            if cut != (low, high):
                second_note = f" (cut at main edge from {fmt((low, high))})"
            if cut[0] < cut[1]:
                second = cut
                self.screen_ranges.append(second)
            else:
                second_note = f" (dropped: {fmt((low, high))} lies inside the main range)"

        counts = " ".join(f"{key}={len(samples)}" for key, samples in self.calibration_samples.items())
        medians = " ".join(f"{point}={value:.1f}" for point, value in point_medians.items())
        logger.info(f"Calibration: main={fmt(main)}{main_note} second={fmt(second) if second else 'none'}{second_note} | "
                    f"second-screen medians: {medians or 'none'} | samples: {counts or 'none'}")
        return {"type": "calibration", "status": status, "main": list(main), "second": list(second) if second else None}

    def handle_landmark_message(self, message):
        """Scores and classifies one parsed landmark message, updates smoothed_prob, and returns a LandmarkReading.
        During calibration it only collects gaze_yaw for the running phase and scores nothing."""
        points = {}
        try:
            points = {int(idx): tuple(xy) for idx, xy in (message.get("points") or {}).items()}
        except Exception as e:
            logger.warning(f"Invalid landmark points: {e}")

        # Head pose. null when the browser had no transformation matrix, i.e. no face
        head_pose = None
        pose = message.get("headPose")
        if pose:
            try:
                head_pose = (float(pose["yaw"]), float(pose["pitch"]))
            except (KeyError, TypeError, ValueError) as e:
                logger.warning(f"Invalid headPose {pose}: {e}")

        # Head yaw + eye blendshapes -> gaze angle (+ eye_pitch, logged only)
        eye_turn = None
        eye_pitch = None
        gaze_yaw = None
        try:
            blendshapes = message.get("blendshapes") or {}
            if blendshapes:
                look = {name: float(blendshapes.get(name, 0)) for name in
                        ("eyeLookInLeft", "eyeLookOutRight", "eyeLookInRight", "eyeLookOutLeft",
                         "eyeLookUpLeft", "eyeLookUpRight", "eyeLookDownLeft", "eyeLookDownRight")}
                eye_turn = (look["eyeLookInLeft"] + look["eyeLookOutRight"]
                            - look["eyeLookInRight"] - look["eyeLookOutLeft"]) / 2
                eye_pitch = (look["eyeLookUpLeft"] + look["eyeLookUpRight"]
                             - look["eyeLookDownLeft"] - look["eyeLookDownRight"]) / 2
                if head_pose is not None:
                    gaze_yaw = head_pose[0] - EYE_TO_HEAD_DEG * eye_turn
        except Exception as e:
            logger.warning(f"Gaze angle failed: {e}")

        # Calibrating: collect gaze_yaw while a recording runs (after its settle time) and score nothing
        if self.calibration_phase is not None:
            settled = time.monotonic() - self.recording_started >= CALIBRATION_SETTLE_S
            if gaze_yaw is not None and self.calibration_phase in CALIBRATION_RECORDING_PHASES and settled:
                self.calibration_samples.setdefault(self.recording_key, []).append(gaze_yaw)
            return LandmarkReading(None, None, None, head_pose, None, eye_turn, gaze_yaw, None, eye_pitch)

        # Points -> rule-based focus score (+ iris ratios, logged only)
        focus_score = None
        iris_ratios = None
        try:
            focus_score, _ = get_focus_score(points, self.scoring_state)
            if has_all_landmarks(points):
                iris_ratios = get_iris_ratios(points)
        except Exception as e:
            logger.warning(f"Landmark scoring failed: {e}")

        # Gaze angle -> gaze score against the (calibrated) screen ranges (logged only)
        gaze_score = None
        try:
            gaze_score = get_gaze_score(points, gaze_yaw, self.gaze_scoring_state, self.screen_ranges)
        except Exception as e:
            logger.warning(f"Gaze scoring failed: {e}")

        # Blendshapes -> distraction classifier + eyes-closed rule
        # Blendshapes are empty when no face was detected: treat that as maximally distracted (prob 1.0)
        # and feed it through the same smoothing path as a real classifier reading
        blendshapes = message.get("blendshapes") or {}
        probability = None
        features = None
        if not blendshapes:
            probability = 1.0
            self.eyes_closed_window.clear()  # can't see the eyes, so a closed stretch can't continue across it
        else:
            try:
                blink = {name: float(blendshapes.get(name, 0)) for name in ("eyeBlinkLeft", "eyeBlinkRight")}
                eyes_closed = (blink["eyeBlinkLeft"] + blink["eyeBlinkRight"]) / 2 > EYES_CLOSED_THRESHOLD
                self.eyes_closed_window.append(eyes_closed)
                if all(name in blendshapes for name in DISTRACTION_WEIGHTS):
                    gaze = {name: float(blendshapes[name]) for name in DISTRACTION_WEIGHTS}
                    probability, _ = classify_distraction(gaze) #call classify distraction
                    features = {**blink, **gaze}
            except Exception as e:
                logger.warning(f"Classifier failed: {e}")
            if self.closed_count / EYES_CLOSED_WINDOW >= EYES_CLOSED_RATIO:
                probability = 1.0

        # Raw probability -> EMA
        if probability is not None:
            if self.smoothed_prob is None:
                self.smoothed_prob = probability
            else:
                self.smoothed_prob = SMOOTHING_ALPHA * probability + (1 - SMOOTHING_ALPHA) * self.smoothed_prob

        return LandmarkReading(focus_score, probability, features, head_pose, iris_ratios, eye_turn, gaze_yaw, gaze_score,
                               eye_pitch)
