import math

# --- Blendshape Distraction Classifier (comparison only, not sent to client) ---
# Pipeline: landmark JSON (text messages). The blendshapes come from the browser's own MediaPipe run;
# the JPEG frame (binary) pipeline never calls anything in this file.
# Weights from backend/scripts/train_classifier.py (logistic regression on raw blendshape scores)
# Gaze features only: the two eyeBlink features were dropped because ordinary blinks during focus pushed the
# probability over the threshold. Eyes closed is handled by a duration rule in cv_project/landmark_pipeline.py.
DISTRACTION_WEIGHTS = {
    "eyeLookDownLeft": 0.277906,
    "eyeLookDownRight": 3.382252,
    "eyeLookUpLeft": -0.652687,
    "eyeLookUpRight": -0.456009,
    "eyeLookInLeft": 2.758315,
    "eyeLookInRight": 2.791569,
    "eyeLookOutLeft": 2.664299,
    "eyeLookOutRight": 2.560867,
}
DISTRACTION_INTERCEPT = -2.039509
DISTRACTION_THRESHOLD = 0.40

# Trained on 1,440 rows across 3 guided sessions. Cross-session accuracy (train on 2, test on the 3rd)
# 70-80% at the 0.40 threshold, vs 70-84% for the old 10-feature model.
# Threshold set to 0.40 (default would be 0.5) based on precision/recall sweep — chosen to
# reduce missed distraction, since a false alarm costs less than a missed one for this product.
# The sweep was rerun for the 8-feature model; 0.40 still gives the best pooled cross-session F1.
# Pipeline: landmark JSON (text messages)
def classify_distraction(blendshapes):
    """Takes {name: score} for the 10 eye blendshapes, returns (p_distracted, is_distracted)."""
    z = DISTRACTION_INTERCEPT + sum(
        weight * blendshapes[name] for name, weight in DISTRACTION_WEIGHTS.items()
    )
    probability = 1.0 / (1.0 + math.exp(-z))
    return probability, probability > DISTRACTION_THRESHOLD
