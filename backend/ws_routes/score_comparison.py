import logging
import time

from cv_project.distraction_classifier import DISTRACTION_THRESHOLD
from cv_project.landmark_pipeline import EYES_CLOSED_WINDOW

logger = logging.getLogger(__name__)

# TEMPORARY: logs the JPEG frame pipeline's score next to the landmark JSON pipeline's readings, at most once
# per second, so the two can be compared on the same session. Delete this file together with
# handle_jpeg_frame in study_ws.py once the landmark JSON pipeline replaces JPEG frame scoring.


class ScoreComparisonLog:
    """Collects the latest reading from each pipeline and logs them side by side once per second."""

    def __init__(self, session_start_time):
        self.session_start_time = session_start_time
        self.last_log = time.time()
        self._start_window()

    def _start_window(self):
        """Clears everything collected since the last log line."""
        self.video_score = None
        self.landmark_score = None
        self.classifier = None  # raw (probability, is_distracted) from the most recent landmark message
        self.max_raw_prob = 0.0  # highest raw probability since the last log line, so short blinks aren't missed by sampling
        self.peak_blendshapes = None  # the blendshapes that produced max_raw_prob; None when that frame had no face
        self.landmark_seen = False  # any landmark message since the last log line
        self.head_pose = None  # (yaw, pitch) from the most recent landmark message
        self.iris_ratios = None  # (horizontal, vertical) from the most recent landmark message

    # JPEG frame pipeline (binary messages)
    def record_video_score(self, score):
        if score is not None:
            self.video_score = score

    # Landmark JSON pipeline (text messages)
    def record_landmark_reading(self, reading):
        self.landmark_seen = True
        self.head_pose = reading.head_pose
        self.iris_ratios = reading.iris_ratios
        if reading.focus_score is not None:
            self.landmark_score = reading.focus_score
        if reading.probability is not None:
            self.classifier = (reading.probability, reading.probability > DISTRACTION_THRESHOLD)
            if reading.probability >= self.max_raw_prob:
                self.max_raw_prob = reading.probability
                self.peak_blendshapes = reading.blendshapes

    def log_if_due(self, smoothed_prob, closed_count):
        now = time.time()
        if now - self.last_log < 1:
            return
        t = now - self.session_start_time

        if self.video_score is not None and self.landmark_score is not None:
            logger.info(
                f"t={t:.1f}s Video-score: {self.video_score} | "
                f"Landmark-score: {self.landmark_score} | "
                f"diff: {abs(self.video_score - self.landmark_score)}"
            )
        if self.video_score is not None and self.classifier is not None and smoothed_prob is not None:
            raw_prob, raw_is_distracted = self.classifier
            is_distracted_smoothed = smoothed_prob > DISTRACTION_THRESHOLD
            logger.info(
                f"t={t:.1f}s Video-score: {self.video_score} | "
                f"Raw: prob={raw_prob:.2f} (peak={self.max_raw_prob:.2f}) is_distracted={raw_is_distracted} | "
                f"Smoothed: prob={smoothed_prob:.2f} is_distracted={is_distracted_smoothed} | "
                f"closed_ratio={closed_count}/{EYES_CLOSED_WINDOW}"
            )
            if self.peak_blendshapes is None:
                peak_text = "no face detected"
            else:
                peak_text = " ".join(f"{name}={value:.2f}" for name, value in self.peak_blendshapes.items())
            logger.info(f"t={t:.1f}s Peak frame blendshapes: {peak_text}")
        if self.landmark_seen:
            yaw, pitch = (f"{v:.1f}" for v in self.head_pose) if self.head_pose else ("n/a", "n/a")
            iris_h, iris_v = (f"{v:.2f}" for v in self.iris_ratios) if self.iris_ratios else ("n/a", "n/a")
            logger.info(f"t={t:.1f}s Head/iris: head_yaw={yaw} head_pitch={pitch} iris_h={iris_h} iris_v={iris_v}")

        self._start_window()
        self.last_log = now
