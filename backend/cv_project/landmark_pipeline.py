import json
import logging
import time

import numpy as np

from cv_project.geometry import eye_openness, get_iris_ratios, has_all_landmarks, head_down_ratio

logger = logging.getLogger(__name__)

# Landmark pipeline: the browser runs MediaPipe itself and sends landmark points, eye blendshapes, head pose and
# the number of faces it found as JSON text messages on /ws/study (ws_routes/study_ws.py). This module turns them
# into the live focus score.
#
#   landmark message
#     ├── headPose yaw + eye blendshapes -> gaze_yaw
#     └── points + gaze_yaw + faceCount   -> get_gaze_score() -> {"score", "cheat_events", "gaze"} sent to the client
#                                                             -> gaze_scores, read by the post-session charts
#
#   calibration message {"phase": ...} (start of the session, see CALIBRATION_RECORDING_PHASES)
#     until "done", landmark messages only collect gaze_yaw (during recordings); nothing is scored
#     "done" -> screen_ranges that get_gaze_score() checks gaze_yaw against and a reply to the client. If the
#               calibration succeeded or was skipped, the session clock starts: messages are scored until
#               session_duration has passed. After a failure nothing is scored until a redo or skip succeeds

# Horizontal gaze angle = head yaw corrected by how far the eyes are turned in their sockets:
#   eye_turn = (eyeLookInLeft + eyeLookOutRight - eyeLookInRight - eyeLookOutLeft) / 2, positive = eyes to the user's right
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

# The one definition of distracted: a score below DISTRACTED_BELOW. It drives the live badge and distraction count
# (the "distracted" flag sent with each score) and the post-session donut (ws_routes/charts.py)
DISTRACTED_BELOW = 40
# Looking off screen alone leaves 100 - 70 = 30, below DISTRACTED_BELOW
GAZE_OFF_SCREEN_PENALTY = 70
# Eyes closed: an eye aspect ratio below EYES_CLOSED_EAR for EYES_CLOSED_FRAMES landmark messages in a row
EYES_CLOSED_EAR = 0.2
EYES_CLOSED_FRAMES = 3
# Looking down: head_down_ratio above this
LOOKING_DOWN_RATIO = 1.4

# cheat_events codes. Each scored message carries the events that fired on it; the client only checks whether
# the list is empty
EVENT_LOOKING_DOWN = 1
EVENT_OFF_SCREEN = 2
EVENT_MULTIPLE_FACES = 3
EVENT_EYES_CLOSED = 4
EVENT_LOW_SCORE = 5

# Sent instead of a score once session_duration has passed; the browser ends the session when it gets it
SESSION_ENDED = json.dumps({"type": "session_ended"})


def get_gaze_score(landmarks, gaze_yaw, state, screen_ranges=(DEFAULT_SCREEN_RANGE,), face_count=1):
    """Scores one landmark message. Returns (score, cheat_events), or (None, []) when gaze_yaw is None, since the
    horizontal direction can't be judged.
    The score starts at 100 and loses GAZE_OFF_SCREEN_PENALTY when gaze_yaw is outside every (low, high) range in
    screen_ranges (degrees), plus the vertical rules' penalties. It's 0 with no face, or once the eyes have been
    closed for EYES_CLOSED_FRAMES messages in a row (state["blink_counter"] keeps the streak)."""
    if not has_all_landmarks(landmarks):
        return 0, [EVENT_LOW_SCORE]
    if gaze_yaw is None:
        return None, []

    eye_aspect_ratio = eye_openness(landmarks[159], landmarks[145], landmarks[33], landmarks[133])
    eyes_shut = eye_aspect_ratio < EYES_CLOSED_EAR
    head_down_value = head_down_ratio(landmarks[1], landmarks[152], landmarks[151])

    events = []
    if face_count > 1:
        events.append(EVENT_MULTIPLE_FACES)

    focus = 100
    if not any(low <= gaze_yaw <= high for low, high in screen_ranges):
        focus -= GAZE_OFF_SCREEN_PENALTY
        events.append(EVENT_OFF_SCREEN)
    # Vertical rules: iris high or low in the eye, head tipped up or down. The iris rules are skipped while the eye is
    # shut: the iris position means nothing then, and the first frames of a blink would score 20. The eyes-closed
    # streak below handles real closure
    if not eyes_shut:
        _, iris_vertical = get_iris_ratios(landmarks)
        if iris_vertical < 0.25 or iris_vertical > 0.75:
            focus -= 50
        if iris_vertical < 0.4 or iris_vertical > 0.6:
            focus -= 30
    if head_down_value > 1.3 or head_down_value < 0.75:
        focus -= 50
    if head_down_value > LOOKING_DOWN_RATIO:
        events.append(EVENT_LOOKING_DOWN)

    # Eyes closed: a streak, so a single blink doesn't count
    if eyes_shut:
        state["blink_counter"] += 1
    else:
        state["blink_counter"] = 0
    if state["blink_counter"] >= EYES_CLOSED_FRAMES:
        focus = 0
        events.append(EVENT_EYES_CLOSED)

    score = max(0, focus)
    if score < DISTRACTED_BELOW:
        events.append(EVENT_LOW_SCORE)
    return score, events


class LandmarkPipeline:
    """One study session (one /ws/study connection): calibration, the live score, and the session's scores for
    the post-session charts (ws_routes/charts.py)."""

    def __init__(self, session_duration):
        # Planned session length in seconds. The session clock starts when calibration succeeds or is skipped
        self.session_duration = session_duration
        self.session_started = None  # time.monotonic() when the session clock started, None until then
        self.session_stopped = None  # time.monotonic() when the connection closed, None while it's open
        # Every score sent to the client this session, in order, as (seconds since the session clock started, score)
        self.gaze_scores = []
        # get_gaze_score's eyes-closed streak
        self.scoring_state = {"blink_counter": 0}
        # Calibration: the running phase (None when not calibrating), when its recording started, gaze_yaw samples
        # per recording ("main", or "second_screen/<point>" for each second-screen point), and the (low, high)
        # gaze_yaw ranges that count as on screen
        self.calibration_phase = None
        self.recording_started = None
        self.recording_key = None
        self.calibration_samples = {}
        self.screen_ranges = [DEFAULT_SCREEN_RANGE]
        # For the once-per-second DEBUG line
        self.created = time.monotonic()
        self.last_log = None

    def stop(self):
        """Marks the connection as closed, so session_length() stops growing."""
        if self.session_stopped is None:
            self.session_stopped = time.monotonic()

    def session_length(self):
        """Seconds the session actually ran: from the session clock's start until the connection closed (or now),
        capped at session_duration. 0 if the session never started."""
        if self.session_started is None:
            return 0
        end = self.session_stopped if self.session_stopped is not None else time.monotonic()
        return min(max(0.0, end - self.session_started), self.session_duration)

    def handle_text_message(self, text):
        """Handles one text message and returns the text to send back to the client, or None: the calibration
        result for the calibration "done" message, {"score", "cheat_events", "distracted", "gaze"} for a scored
        landmark message (gaze: gaze_yaw in degrees, null when there's no face), and SESSION_ENDED
        ({"type": "session_ended"}) for a landmark message after the session is over."""
        try:
            message = json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid landmark JSON: {e}")
            return None
        if message.get("type") == "calibration":
            reply = self.handle_calibration_message(message)
            return None if reply is None else json.dumps(reply)
        if message.get("type") != "landmarks":
            logger.warning(f"Unknown text message: {message}")
            return None
        return self.handle_landmark_message(message)

    def handle_calibration_message(self, message):
        """Switches the calibration phase. On "done" returns the calibration result for the client (and starts the
        session if the calibration succeeded or was skipped), else returns None."""
        phase = message.get("phase")
        if phase == "main":
            self.calibration_samples = {}  # a new calibration run (or a redo) starts from scratch
        if phase == "idle" or phase in CALIBRATION_RECORDING_PHASES:
            self.calibration_phase = phase
            self.session_started = None  # calibrating (again, on a redo): no session clock until "done"
            self.recording_started = time.monotonic()
            self.recording_key = f"second_screen/{message.get('point', 'unknown')}" if phase == "second_screen" else phase
        elif phase == "done":
            self.calibration_phase = None
            skipped = bool(message.get("skipped"))
            if skipped:
                self.calibration_samples = {}
            result = self.finish_calibration()
            # Only a successful calibration or a skip starts the session. On a failure (too_narrow, not_calibrated)
            # the browser offers Redo / Skip and nothing is scored until one of them ends in a "done" that starts it.
            # The browser starts its session timer at the same point, so the clock and its scores start over here too
            if skipped or result["status"] == "ok":
                self.session_started = time.monotonic()
                self.gaze_scores = []
            return result
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
        """Computes gaze_yaw for one parsed landmark message. During calibration it only collects gaze_yaw for the
        running phase; once the session has started it scores the message, records the score and returns the reply
        (see handle_text_message)."""
        points = {}
        try:
            points = {int(idx): tuple(xy) for idx, xy in (message.get("points") or {}).items()}
        except Exception as e:
            logger.warning(f"Invalid landmark points: {e}")

        # Head yaw (headPose is null when the browser had no transformation matrix, i.e. no face)
        # + eye blendshapes -> gaze angle
        gaze_yaw = None
        pose = message.get("headPose")
        blendshapes = message.get("blendshapes") or {}
        if pose and blendshapes:
            try:
                look = {name: float(blendshapes.get(name, 0)) for name in
                        ("eyeLookInLeft", "eyeLookOutRight", "eyeLookInRight", "eyeLookOutLeft")}
                eye_turn = (look["eyeLookInLeft"] + look["eyeLookOutRight"]
                            - look["eyeLookInRight"] - look["eyeLookOutLeft"]) / 2
                gaze_yaw = float(pose["yaw"]) - EYE_TO_HEAD_DEG * eye_turn
            except (KeyError, TypeError, ValueError) as e:
                logger.warning(f"Gaze angle failed for headPose {pose}: {e}")

        score = None
        reply = None
        if self.calibration_phase is not None:
            # Calibrating: collect gaze_yaw while a recording runs (after its settle time) and score nothing
            settled = time.monotonic() - self.recording_started >= CALIBRATION_SETTLE_S
            if gaze_yaw is not None and self.calibration_phase in CALIBRATION_RECORDING_PHASES and settled:
                self.calibration_samples.setdefault(self.recording_key, []).append(gaze_yaw)
        elif self.session_started is None:
            pass  # no successful calibration or skip yet: the session hasn't started
        elif time.monotonic() - self.session_started > self.session_duration:
            reply = SESSION_ENDED
        else:
            try:
                score, cheat_events = get_gaze_score(points, gaze_yaw, self.scoring_state, self.screen_ranges,
                                                     message.get("faceCount") or 0)
            except Exception as e:
                logger.warning(f"Gaze scoring failed: {e}")
            if score is not None:
                self.gaze_scores.append((time.monotonic() - self.session_started, score))
                reply = json.dumps({"score": score, "cheat_events": cheat_events,
                                    "distracted": score < DISTRACTED_BELOW,
                                    "gaze": None if gaze_yaw is None else round(gaze_yaw, 1)})

        self.log_if_due(gaze_yaw, score)
        return reply

    def log_if_due(self, gaze_yaw, score):
        """At most once per second: one DEBUG line with the latest gaze_yaw and score (n/a when not computed)."""
        now = time.monotonic()
        if self.last_log is not None and now - self.last_log < 1:
            return
        self.last_log = now
        gaze_text = "n/a" if gaze_yaw is None else f"{gaze_yaw:.1f}"
        logger.debug(f"t={now - self.created:.1f}s gaze_yaw={gaze_text} score={'n/a' if score is None else score}")
