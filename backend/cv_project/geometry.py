import numpy as np

# Pure landmark-geometry helpers: points in, ratios out. No session state, so they can be imported and tested
# on their own. cv_project/landmark_pipeline.py builds the gaze score from them.

# Landmark indices the browser sends in each landmark message (frontend/src/pages/Session.tsx)
LANDMARK_INDICES = (159, 145, 33, 133, 468, 1, 234, 454, 152, 151)


def has_all_landmarks(landmarks):
    return all(idx in landmarks for idx in LANDMARK_INDICES)


# --- Euclidean Distance ---
def euclidean(pt1, pt2):
    return np.linalg.norm(np.array(pt1) - np.array(pt2))

#takes 2 coordinates as parameters and calculates distance. first, vector subtraction inside brackets,
#and then, norm applies the formula (x2 + y2)^1/2.

# --- Eye Openness (eye_aspect_ratio) ---
# Used by the gaze score's eyes-closed check
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


# Used by the gaze score's vertical rules (the vertical ratio only)
def get_iris_ratios(landmarks):
    """(horizontal, vertical) iris position within the eye, 0.5 = centered. Needs has_all_landmarks."""
    return iris_position_ratio(landmarks[468], landmarks[33], landmarks[133], landmarks[159], landmarks[145])

# --- Head Down Ratio ---
# Used by the gaze score's vertical rules and its looking-down event
def head_down_ratio(nose_tip, chin, eye_level):
    eye_to_nose = euclidean(eye_level, nose_tip)
    chin_to_nose = euclidean(nose_tip, chin)
    return eye_to_nose / chin_to_nose
