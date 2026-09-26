import math

# --- Blendshape Distraction Classifier (comparison only, not sent to client) ---
# Pipeline: landmark JSON (text messages). The blendshapes come from the browser's own MediaPipe run;
# the JPEG frame (binary) pipeline never calls anything in this file.
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
# Pipeline: landmark JSON (text messages)
def classify_distraction(blendshapes):
    """Takes {name: score} for the 10 eye blendshapes, returns (p_distracted, is_distracted)."""
    z = DISTRACTION_INTERCEPT + sum(
        weight * blendshapes[name] for name, weight in DISTRACTION_WEIGHTS.items()
    )
    probability = 1.0 / (1.0 + math.exp(-z))
    return probability, probability > DISTRACTION_THRESHOLD
