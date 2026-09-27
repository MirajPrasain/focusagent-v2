import json
import logging
from collections import namedtuple

from cv_project.study_mode import get_focus_score, new_scoring_state
from cv_project.distraction_classifier import classify_distraction, DISTRACTION_WEIGHTS

logger = logging.getLogger(__name__)

# Landmark JSON pipeline (text messages): the browser runs MediaPipe itself and sends landmark points plus
# eye blendshapes for each detection. This is the pipeline that will replace JPEG frame scoring. For now its
# results are only logged next to the JPEG frame score (ws_routes/score_comparison.py), never sent to the client.
#
#   landmark message
#     ├── points      -> get_focus_score()        rule-based score
#     └── blendshapes -> classify_distraction()   raw probability ─┐
#                     -> eyes-closed duration rule   (1.0 if closed) ─┴-> EMA (smoothed_prob)

# EMA over per-message classifier probabilities: a single-frame spike (a blink, a momentary glance)
# gets pulled toward the recent average instead of flagging outright, while sustained distraction
# still pushes the smoothed value across the threshold within roughly 1-2s at the current message rate.
# SMOOTHING_ALPHA is the one knob to tune: higher reacts faster, lower filters more noise.
SMOOTHING_ALPHA = 0.15

# Eyes-closed duration rule. The classifier only sees gaze, so a single blink can't flag distraction; eyes held
# closed for EYES_CLOSED_FRAMES consecutive messages (~2s at 5 messages/s) count as maximally distracted (1.0),
# the same way no-face is handled. A frame counts as closed when (eyeBlinkLeft + eyeBlinkRight) / 2 is above
# EYES_CLOSED_THRESHOLD; any frame at or below it resets the count.
EYES_CLOSED_THRESHOLD = 0.5
EYES_CLOSED_FRAMES = 10

# What one landmark message produced. Each field is None when that part couldn't be computed.
#   focus_score: get_focus_score on the points
#   probability: raw classifier probability (1.0 when no face was detected or the eyes-closed rule fired)
#   blendshapes: both eyeBlink values plus the gaze features the classifier saw (None when no face was detected)
LandmarkReading = namedtuple("LandmarkReading", ["focus_score", "probability", "blendshapes"])


class LandmarkPipeline:
    """Per-connection state for the landmark JSON pipeline."""

    def __init__(self):
        # Own scoring state, so it can't disturb the JPEG frame pipeline's blink counter
        self.scoring_state = new_scoring_state()
        self.smoothed_prob = None
        self.eyes_closed_frames = 0  # consecutive messages with eyes closed, for the eyes-closed rule

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

        # Points -> rule-based focus score
        focus_score = None
        try:
            points = {int(idx): tuple(xy) for idx, xy in (message.get("points") or {}).items()}
            focus_score, _ = get_focus_score(points, self.scoring_state)
        except Exception as e:
            logger.warning(f"Landmark scoring failed: {e}")

        # Blendshapes -> distraction classifier + eyes-closed rule
        # Blendshapes are empty when no face was detected: treat that as maximally distracted (prob 1.0)
        # and feed it through the same smoothing path as a real classifier reading
        blendshapes = message.get("blendshapes") or {}
        probability = None
        features = None
        if not blendshapes:
            probability = 1.0
            self.eyes_closed_frames = 0  # can't see the eyes, so a closed streak can't continue across it
        else:
            try:
                blink = {name: float(blendshapes.get(name, 0)) for name in ("eyeBlinkLeft", "eyeBlinkRight")}
                eyes_closed = (blink["eyeBlinkLeft"] + blink["eyeBlinkRight"]) / 2 > EYES_CLOSED_THRESHOLD
                self.eyes_closed_frames = self.eyes_closed_frames + 1 if eyes_closed else 0
                if all(name in blendshapes for name in DISTRACTION_WEIGHTS):
                    gaze = {name: float(blendshapes[name]) for name in DISTRACTION_WEIGHTS}
                    probability, _ = classify_distraction(gaze) #call classify distraction
                    features = {**blink, **gaze}
            except Exception as e:
                logger.warning(f"Classifier failed: {e}")
            if self.eyes_closed_frames >= EYES_CLOSED_FRAMES:
                probability = 1.0

        # Raw probability -> EMA
        if probability is not None:
            if self.smoothed_prob is None:
                self.smoothed_prob = probability
            else:
                self.smoothed_prob = SMOOTHING_ALPHA * probability + (1 - SMOOTHING_ALPHA) * self.smoothed_prob

        return LandmarkReading(focus_score, probability, features)
