import cv2
import mediapipe as mp
import time
import json

from cv_project.geometry import eye_openness, iris_position_ratio, head_tilt_ratio, head_down_ratio

# Two pipelines use this module, both fed by the /ws/study websocket (ws_routes/study_ws.py):
#   - Landmark JSON pipeline (text messages): the browser runs MediaPipe itself and sends landmark
#     points plus eye blendshapes. cv_project/landmark_pipeline.py scores the points with get_focus_score
#     and sends the blendshapes to cv_project/distraction_classifier.py. Comparison logging only for now,
#     never sent to the client; it will replace the JPEG frame pipeline.
#   - JPEG frame pipeline (binary messages): the browser sends webcam frames, study_ws.py decodes them
#     and process_frame runs MediaPipe here on the server. This is the score the client receives and
#     the post-session charts are built from, until the landmark JSON pipeline takes over.
# Each function below is tagged with the pipeline(s) that use it.

# --- Initialize Mediapipe ---
# Pipeline: JPEG frames (binary messages). The landmark JSON pipeline runs MediaPipe in the browser instead
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    refine_landmarks=True,
    max_num_faces=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# --- Global session state --- same variables as the py file
# Pipeline: JPEG frames (binary messages). Only process_frame appends scores; charts.py reads them
focus_scores = []
start_time = time.time()
SESSION_DURATION = 30  # seconds

# Landmark indices the scoring functions use
# Pipeline: both (landmark JSON + JPEG frames)
LANDMARK_INDICES = (159, 145, 33, 133, 468, 1, 234, 454, 152, 151)


# Pipeline: both (landmark JSON + JPEG frames). study_ws.py makes one per connection for landmark JSON;
# video_state below is the JPEG frame one
def new_scoring_state():
    """Per-source state (blink streak + event flags), so different landmark sources don't share counters."""
    return {"blink_counter": 0, "face_flag": False, "turn_flag": False, "down_flag": False}


# State for the video/JPEG path (module-wide, as before)
# Pipeline: JPEG frames (binary messages)
video_state = new_scoring_state()


# Pipeline: JPEG frames (binary messages). Called once at session start; sets the cutoff process_frame checks
def set_session_duration(seconds):
    global SESSION_DURATION, start_time
    SESSION_DURATION = seconds
    start_time = time.time()


# --- Adapter: mediapipe results -> plain landmarks dict ---
# Pipeline: JPEG frames (binary messages). The landmark JSON pipeline already arrives as a points dict
def landmarks_from_results(results, w, h):
    """Returns ({idx: (x, y)} in pixel space for LANDMARK_INDICES of the first face, face_count)."""
    if not results.multi_face_landmarks:
        return {}, 0

    landmarks = results.multi_face_landmarks[0].landmark

    def get_point(idx):
        lm = landmarks[idx]
        return int(lm.x * w), int(lm.y * h)

    return {idx: get_point(idx) for idx in LANDMARK_INDICES}, len(results.multi_face_landmarks)


# Pipeline: both (landmark JSON + JPEG frames)
def has_all_landmarks(landmarks):
    return all(idx in landmarks for idx in LANDMARK_INDICES)


# --- Focus Score Function ---
# Pipeline: both (landmark JSON + JPEG frames). Landmark JSON calls it from study_ws.py with its own state;
# JPEG frames call it from process_frame with video_state
def get_focus_score(landmarks, state): #same logic as py file
    if not has_all_landmarks(landmarks):
        return 0, "No face detected"

    eye_top = landmarks[159]
    eye_bottom = landmarks[145]
    eye_left = landmarks[33]
    eye_right = landmarks[133]
    iris_center = landmarks[468]
    nose_tip = landmarks[1]
    left_temple = landmarks[234]
    right_temple = landmarks[454]
    chin = landmarks[152]
    eye_level = landmarks[151]

    eye_aspect_ratio = eye_openness(eye_top, eye_bottom, eye_left, eye_right)
    iris_horizontal, iris_vertical = iris_position_ratio(iris_center, eye_left, eye_right, eye_top, eye_bottom)
    head_tilt_value = head_tilt_ratio(left_temple, right_temple, nose_tip)
    head_down_value = head_down_ratio(nose_tip, chin, eye_level)

    focus = 100
    status = "Focused"

    if iris_horizontal < 0.25 or iris_horizontal > 0.75 or iris_vertical < 0.25 or iris_vertical > 0.75:
        focus -= 50
    if head_tilt_value > 1.8 or head_tilt_value < 0.2:
        focus -= 50
    if head_down_value > 1.3 or head_down_value < 0.75:
        focus -= 50
    if iris_horizontal < 0.4 or iris_horizontal > 0.6:
        focus -= 30
    if iris_vertical < 0.4 or iris_vertical > 0.6:
        focus -= 30

    # Blink detection
    if eye_aspect_ratio < 0.2:
        state["blink_counter"] += 1
        if state["blink_counter"] >= 3:
            return 0, "Eyes Closed"
    else:
        state["blink_counter"] = 0

    return max(0, focus), status


# Pipeline: JPEG frames (binary messages)
def detect_multiple_faces(face_count, state):
    multi_face = face_count > 1
    if multi_face and not state["face_flag"]:
        state["face_flag"] = True
    elif not multi_face:
        state["face_flag"] = False
    return multi_face

# Pipeline: JPEG frames (binary messages)
def detect_head_pose(landmarks, state):
    if not has_all_landmarks(landmarks):
        return False, False
    nose = landmarks[1]
    left_temple = landmarks[234]
    right_temple = landmarks[454]
    chin = landmarks[152]
    eye_lvl = landmarks[151]
    tilt = head_tilt_ratio(left_temple, right_temple, nose)
    down = head_down_ratio(nose, chin, eye_lvl)

    # Check for extreme turn (head tilt)
    extreme_turn = (tilt > 1.5) or (tilt < 0.67)
    if extreme_turn and not state["turn_flag"]:
        state["turn_flag"] = True
    elif not extreme_turn:
        state["turn_flag"] = False

    # Check for looking down (head down)
    looking_down = down > 1.4
    if looking_down and not state["down_flag"]:
        state["down_flag"] = True
    elif not looking_down:
        state["down_flag"] = False

    return extreme_turn, looking_down


# --- Frame Processing (called from WebSocket) ---
# Pipeline: JPEG frames (binary messages). Entry point for each decoded frame
def process_frame(frame, timestamp=None):
    global focus_scores

    # Use provided timestamp or calculate from start_time
    if timestamp is None:
        timestamp = time.time() - start_time

    if timestamp > SESSION_DURATION:
        return "Session Ended"

    # Face Detection
    frame = cv2.flip(frame, 1) #this frame is sent by the backend after it received and decoded it from the front end
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = face_mesh.process(rgb_frame)
    h, w, _ = frame.shape

    landmarks, face_count = landmarks_from_results(result, w, h)

    # Detect multiple faces
    multi_face = detect_multiple_faces(face_count, video_state)

    # Detect head pose issues
    extreme_turn, looking_down = detect_head_pose(landmarks, video_state)

    score, status = get_focus_score(landmarks, video_state)

    # Always append the focus score to track trend over time
    focus_scores.append(score)

    current_events = []
    if multi_face:
        current_events.append(3)
    if extreme_turn:
        current_events.append(2)
    if looking_down:
        current_events.append(1)
    if score < 40:
        current_events.append(5)

    return json.dumps({
        "score": score,
        "cheat_events": current_events
    })



# Pipeline: JPEG frames (binary messages). Read by charts.py after the session
def get_session_duration():
    global SESSION_DURATION

    return SESSION_DURATION

# Pipeline: JPEG frames (binary messages). Read by charts.py; only process_frame fills focus_scores
def get_focus_data():
    global focus_scores

    return focus_scores
