import cv2
import mediapipe as mp
import numpy as np
import time
import json
import math

# --- Initialize Mediapipe ---
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    refine_landmarks=True,
    max_num_faces=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# --- Global session state --- same variables as the py file
focus_scores = []
start_time = time.time()
SESSION_DURATION = 30  # seconds

# Landmark indices the scoring functions use
LANDMARK_INDICES = (159, 145, 33, 133, 468, 1, 234, 454, 152, 151)


def new_scoring_state():
    """Per-source state (blink streak + event flags), so different landmark sources don't share counters."""
    return {"blink_counter": 0, "face_flag": False, "turn_flag": False, "down_flag": False}


# State for the video/JPEG path (module-wide, as before)
video_state = new_scoring_state()


def set_session_duration(seconds): 
    global SESSION_DURATION, start_time
    SESSION_DURATION = seconds
    start_time = time.time()
    
# --- Euclidean Distance ---
def euclidean(pt1, pt2):
    return np.linalg.norm(np.array(pt1) - np.array(pt2))

#takes 2 coordinates as parameters and calculates distance. first, vector subtraction inside brackets,
#and then, norm applies the formula (x2 + y2)^1/2.

# --- Eye Openness (eye_aspect_ratio) ---
def eye_openness(eye_top, eye_bottom, eye_left, eye_right):
    vertical_openness = euclidean(eye_top, eye_bottom)
    horizontal_openness = euclidean(eye_left, eye_right)
    return vertical_openness / horizontal_openness

# --- Iris Position Ratio ---
def iris_position_ratio(iris_center, eye_left, eye_right, eye_top, eye_bottom):
    total_width = euclidean(eye_left, eye_right)
    total_height = euclidean(eye_top, eye_bottom)
    iris_to_left = euclidean(iris_center, eye_left)
    iris_to_top = euclidean(iris_center, eye_top)
    horizontal_ratio = iris_to_left / total_width
    vertical_ratio = iris_to_top / total_height
    return horizontal_ratio, vertical_ratio

def head_tilt_ratio(left_temple, right_temple, nose_tip): 
    left_to_nose = euclidean(left_temple, nose_tip)
    right_to_nose = euclidean(right_temple, nose_tip)
    return left_to_nose / right_to_nose

def head_down_ratio(nose_tip, chin, eye_level): 
    eye_to_nose = euclidean(eye_level, nose_tip)
    chin_to_nose = euclidean(nose_tip, chin)
    return eye_to_nose / chin_to_nose

# --- Adapter: mediapipe results -> plain landmarks dict ---
def landmarks_from_results(results, w, h):
    """Returns ({idx: (x, y)} in pixel space for LANDMARK_INDICES of the first face, face_count)."""
    if not results.multi_face_landmarks:
        return {}, 0

    landmarks = results.multi_face_landmarks[0].landmark

    def get_point(idx):
        lm = landmarks[idx]
        return int(lm.x * w), int(lm.y * h)

    return {idx: get_point(idx) for idx in LANDMARK_INDICES}, len(results.multi_face_landmarks)


def has_all_landmarks(landmarks):
    return all(idx in landmarks for idx in LANDMARK_INDICES)


# --- Focus Score Function ---
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


def detect_multiple_faces(face_count, state):
    multi_face = face_count > 1
    if multi_face and not state["face_flag"]:
        state["face_flag"] = True
    elif not multi_face:
        state["face_flag"] = False
    return multi_face

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


# --- Blendshape Distraction Classifier (comparison only, not sent to client) ---
# Weights from backend/scripts/train_classifier.py (logistic regression on raw blendshape scores)
DISTRACTION_WEIGHTS = {
    "eyeBlinkLeft": 2.880757,
    "eyeBlinkRight": 4.409731,
    "eyeLookDownLeft": -1.601819,
    "eyeLookDownRight": 1.477771,
    "eyeLookUpLeft": -0.544489,
    "eyeLookUpRight": -0.439677,
    "eyeLookInLeft": 2.595037,
    "eyeLookInRight": 1.838912,
    "eyeLookOutLeft": 3.061325,
    "eyeLookOutRight": 3.630865,
}
DISTRACTION_INTERCEPT = -2.392878
DISTRACTION_THRESHOLD = 0.40

# Trained on ~1,440 rows across 3 labeled sessions. Cross-session validated accuracy 71-81%.
# Threshold set to 0.40 (default would be 0.5) based on precision/recall sweep — chosen to
# reduce missed distraction, since a false alarm costs less than a missed one for this product.
def classify_distraction(blendshapes):
    """Takes {name: score} for the 10 eye blendshapes, returns (p_distracted, is_distracted)."""
    z = DISTRACTION_INTERCEPT + sum(
        weight * blendshapes[name] for name, weight in DISTRACTION_WEIGHTS.items()
    )
    probability = 1.0 / (1.0 + math.exp(-z))
    return probability, probability > DISTRACTION_THRESHOLD




# --- Frame Processing (called from WebSocket) ---
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



def get_session_duration(): 
    global SESSION_DURATION

    return SESSION_DURATION 

def get_focus_data(): 
    global focus_scores

    return focus_scores
