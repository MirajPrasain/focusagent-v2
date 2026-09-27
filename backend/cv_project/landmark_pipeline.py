import json
import logging
from collections import deque, namedtuple

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
#   gaze_yaw = head_yaw - EYE_TO_HEAD_DEG * eye_turn   (head_yaw positive = head turned to the user's left)
# EYE_TO_HEAD_DEG converts eye_turn to degrees; a fixed guess until per-user calibration replaces it.
EYE_TO_HEAD_DEG = 33
# The screen spans SCREEN_CENTER_DEG ± SCREEN_HALF_WIDTH_DEG of gaze_yaw; outside that counts as off screen
SCREEN_CENTER_DEG = 0
SCREEN_HALF_WIDTH_DEG = 15

# What one landmark message produced. Each field is None when that part couldn't be computed.
#   focus_score: get_focus_score on the points
#   probability: raw classifier probability (1.0 when no face was detected or the eyes-closed rule fired)
#   blendshapes: both eyeBlink values plus the gaze features the classifier saw (None when no face was detected)
#   head_pose: (yaw, pitch) in degrees from the browser's facial transformation matrix
#   iris_ratios: (horizontal, vertical) from get_iris_ratios on the points
#   eye_turn, gaze_yaw: see EYE_TO_HEAD_DEG
#   gaze_score: get_gaze_score on the points and gaze_yaw
LandmarkReading = namedtuple(
    "LandmarkReading",
    ["focus_score", "probability", "blendshapes", "head_pose", "iris_ratios", "eye_turn", "gaze_yaw", "gaze_score"],
    defaults=[None] * 5,
)


def get_gaze_score(landmarks, gaze_yaw, state):
    """get_focus_score with its horizontal rules (head turn, horizontal iris) replaced by one gaze_yaw rule.
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
    if abs(gaze_yaw - SCREEN_CENTER_DEG) > SCREEN_HALF_WIDTH_DEG:
        focus -= 50
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

    @property
    def closed_count(self):
        """How many of the last EYES_CLOSED_WINDOW messages had closed eyes."""
        return sum(self.eyes_closed_window)

    def handle_landmark_message(self, text):
        """Scores and classifies one landmark JSON message, updates smoothed_prob, and returns a LandmarkReading."""
        try:
            message = json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid landmark JSON: {e}")
            return LandmarkReading(None, None, None)
        if message.get("type") != "landmarks":
            logger.warning(f"Unknown text message: {message}")
            return LandmarkReading(None, None, None)

        # Points -> rule-based focus score (+ iris ratios, logged only)
        focus_score = None
        iris_ratios = None
        points = {}
        try:
            points = {int(idx): tuple(xy) for idx, xy in (message.get("points") or {}).items()}
            focus_score, _ = get_focus_score(points, self.scoring_state)
            if has_all_landmarks(points):
                iris_ratios = get_iris_ratios(points)
        except Exception as e:
            logger.warning(f"Landmark scoring failed: {e}")

        # Head pose (logged only). null when the browser had no transformation matrix, i.e. no face
        head_pose = None
        pose = message.get("headPose")
        if pose:
            try:
                head_pose = (float(pose["yaw"]), float(pose["pitch"]))
            except (KeyError, TypeError, ValueError) as e:
                logger.warning(f"Invalid headPose {pose}: {e}")

        # Head yaw + eye blendshapes -> gaze angle -> gaze score (logged only)
        eye_turn = None
        gaze_yaw = None
        gaze_score = None
        try:
            blendshapes = message.get("blendshapes") or {}
            if blendshapes:
                look = {name: float(blendshapes.get(name, 0)) for name in
                        ("eyeLookInLeft", "eyeLookOutRight", "eyeLookInRight", "eyeLookOutLeft")}
                eye_turn = (look["eyeLookInLeft"] + look["eyeLookOutRight"]
                            - look["eyeLookInRight"] - look["eyeLookOutLeft"]) / 2
                if head_pose is not None:
                    gaze_yaw = head_pose[0] - EYE_TO_HEAD_DEG * eye_turn
            gaze_score = get_gaze_score(points, gaze_yaw, self.gaze_scoring_state)
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

        return LandmarkReading(focus_score, probability, features, head_pose, iris_ratios, eye_turn, gaze_yaw, gaze_score)
