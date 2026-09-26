import numpy as np

# Pure landmark-geometry helpers: points in, ratios out. No MediaPipe or session state, so they can be
# imported and tested without loading the face mesh. The two pipelines are described at the top of
# study_mode.py.


# --- Euclidean Distance ---
# Pipeline: both (landmark JSON + JPEG frames), since every ratio below is built on it
def euclidean(pt1, pt2):
    return np.linalg.norm(np.array(pt1) - np.array(pt2))

#takes 2 coordinates as parameters and calculates distance. first, vector subtraction inside brackets,
#and then, norm applies the formula (x2 + y2)^1/2.

# --- Eye Openness (eye_aspect_ratio) ---
# Pipeline: both (landmark JSON + JPEG frames), via get_focus_score's blink detection
def eye_openness(eye_top, eye_bottom, eye_left, eye_right):
    vertical_openness = euclidean(eye_top, eye_bottom)
    horizontal_openness = euclidean(eye_left, eye_right)
    return vertical_openness / horizontal_openness

# --- Iris Position Ratio ---
# Pipeline: both (landmark JSON + JPEG frames), via get_focus_score
def iris_position_ratio(iris_center, eye_left, eye_right, eye_top, eye_bottom):
    total_width = euclidean(eye_left, eye_right)
    total_height = euclidean(eye_top, eye_bottom)
    iris_to_left = euclidean(iris_center, eye_left)
    iris_to_top = euclidean(iris_center, eye_top)
    horizontal_ratio = iris_to_left / total_width
    vertical_ratio = iris_to_top / total_height
    return horizontal_ratio, vertical_ratio

# --- Head Tilt Ratio ---
# Pipeline: both (landmark JSON + JPEG frames) via get_focus_score; JPEG frames also via detect_head_pose
def head_tilt_ratio(left_temple, right_temple, nose_tip):
    left_to_nose = euclidean(left_temple, nose_tip)
    right_to_nose = euclidean(right_temple, nose_tip)
    return left_to_nose / right_to_nose

# --- Head Down Ratio ---
# Pipeline: both (landmark JSON + JPEG frames) via get_focus_score; JPEG frames also via detect_head_pose
def head_down_ratio(nose_tip, chin, eye_level):
    eye_to_nose = euclidean(eye_level, nose_tip)
    chin_to_nose = euclidean(nose_tip, chin)
    return eye_to_nose / chin_to_nose
