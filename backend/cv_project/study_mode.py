import cv2
import mediapipe as mp
import numpy as np
from ultralytics import YOLO
import time
import matplotlib.pyplot as plt
import pandas as pd
from fpdf import FPDF
from datetime import datetime
import os
import json

# --- Initialize Mediapipe ---
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    refine_landmarks=True,
    max_num_faces=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# --- Initialize Model ---
model = YOLO('yolov5su.pt')

# --- Global session state --- same variables as the py file 
focus_scores = []
cheat_times = []
blink_counter = 0
start_time = time.time()
SESSION_DURATION = 30  # seconds

cheat_event = []
phone_checks = 0
face_events = 0
turn_events = 0
down_events = 0
phone_flag = False
face_flag = False
turn_flag = False
down_flag = False


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

# --- Focus Score Function ---
def get_focus_score(results, w, h, phone_detected): #same logic as py file 
    global blink_counter  # so we can retain value across frames

    if not results.multi_face_landmarks:
        return 0, "No face detected"

    face = results.multi_face_landmarks[0]
    landmarks = face.landmark

    def get_point(idx):
        lm = landmarks[idx]
        return int(lm.x * w), int(lm.y * h)

    eye_top = get_point(159)
    eye_bottom = get_point(145)
    eye_left = get_point(33)
    eye_right = get_point(133)
    iris_center = get_point(468)
    nose_tip = get_point(1)
    left_temple = get_point(234)
    right_temple = get_point(454)
    chin = get_point(152)
    eye_level = get_point(151)

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
        blink_counter += 1
        if blink_counter >= 3:
            return 0, "Eyes Closed"
    else:
        blink_counter = 0

    if phone_detected:
        return 0, "Phone Detected"

    return max(0, focus), status


# --- Detect Cheating Events ---
def detect_phone(results_yolo):
    global phone_checks, phone_flag
    phone_detected = False
    for box in results_yolo.boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        label = model.names[cls_id]
        if label == 'cell phone' and conf > 0.5:
            phone_detected = True
            break
    if phone_detected and not phone_flag:
        phone_checks += 1
        phone_flag = True
        cheat_times.append(time.time() - start_time)
        cheat_event.append(4)
    elif not phone_detected:
        phone_flag = False
    return phone_detected

def detect_multiple_faces(result):
    global face_events, face_flag
    multi_face = bool(result.multi_face_landmarks and len(result.multi_face_landmarks) > 1)
    if multi_face and not face_flag:
        face_events += 1
        face_flag = True
        cheat_times.append(time.time() - start_time)
        cheat_event.append(3)
    elif not multi_face:
        face_flag = False
    return multi_face

def detect_head_pose(result, w, h):
    global turn_events, down_events, turn_flag, down_flag
    if not result.multi_face_landmarks:
        return False, False
    face = result.multi_face_landmarks[0]
    lm = face.landmark
    def P(i): return (int(lm[i].x * w), int(lm[i].y * h))
    nose = P(1)
    left_temple = P(234)
    right_temple = P(454)
    chin = P(152)
    eye_lvl = P(151)
    tilt = head_tilt_ratio(left_temple, right_temple, nose)
    down = head_down_ratio(nose, chin, eye_lvl)
    
    # Check for extreme turn (head tilt)
    extreme_turn = (tilt > 1.5) or (tilt < 0.67)
    if extreme_turn and not turn_flag:
        turn_events += 1
        turn_flag = True
        cheat_times.append(time.time() - start_time)
        cheat_event.append(2)
    elif not extreme_turn:
        turn_flag = False
    
    # Check for looking down (head down)
    looking_down = down > 1.4
    if looking_down and not down_flag:
        down_events += 1
        down_flag = True
        cheat_times.append(time.time() - start_time)
        cheat_event.append(1)
    elif not looking_down:
        down_flag = False
    
    return extreme_turn, looking_down




# --- Frame Processing (called from WebSocket) ---
def process_frame(frame, timestamp=None):
    global focus_scores, cheat_times, cheat_event

    # Use provided timestamp or calculate from start_time
    if timestamp is None:
        timestamp = time.time() - start_time
    
    if timestamp > SESSION_DURATION:
        return "Session Ended"

    # Phone Detection
    results_yolo = model(frame)[0]
    phone_detected = detect_phone(results_yolo)

    # Face Detection
    frame = cv2.flip(frame, 1) #this frame is sent by the backend after it received and decoded it from the front end
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = face_mesh.process(rgb_frame)
    h, w, _ = frame.shape
    
    # Detect multiple faces
    detect_multiple_faces(result)
    
    # Detect head pose issues
    detect_head_pose(result, w, h)
    
    score, status = get_focus_score(result, w, h, phone_detected)

    # Always append the focus score to track trend over time
    focus_scores.append(score)
    
    # Track cheating/distraction events separately
    if score < 40:
        cheat_times.append(round(timestamp, 2))
        cheat_event.append(5)  # Event type 5 for general low focus/distraction
        print(f"🚨 Cheat detected at {timestamp:.2f}s - Score: {score}, Status: {status}")

    return json.dumps({
    "score": score,
    "cheat_events": cheat_event[-1:]  # just latest event if needed
})



def get_session_duration(): 
    global SESSION_DURATION

    return SESSION_DURATION 

def get_focus_data(): 
    global focus_scores

    return focus_scores

def get_cheat_data(): 
    global cheat_times 
    global cheat_event

    return cheat_times, cheat_event


#import os
# from fpdf import FPDF
# from datetime import datetime
# import matplotlib.pyplot as plt
# import pandas as pd

# # --- Setup Paths ---
# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# REPORTS_DIR = os.path.join(BASE_DIR, "..", "reports")
# CHART_PATH = os.path.join(REPORTS_DIR, "focus_trend.png")
# PDF_PATH = os.path.join(REPORTS_DIR, "study_session_report.pdf")

# def generate_focus_chart():
#     if not focus_scores:
#         print("No focus data to plot.")
#         return

#     timestamps = [round(i * (SESSION_DURATION / len(focus_scores)), 2) for i in range(len(focus_scores))]
#     smoothed_scores = pd.Series(focus_scores).rolling(window=10, min_periods=1).mean()

#     plt.figure(figsize=(10, 5))
#     plt.plot(timestamps, smoothed_scores, color="blue", linewidth=2, label="Smoothed Focus Score")
#     plt.axhline(50, color='red', linestyle='--', label='Distraction Threshold (50)')
#     plt.axhline(80, color='green', linestyle='--', label='High Focus (80)')
#     plt.title("Focus Score Over Time")
#     plt.xlabel("Time (seconds)")
#     plt.ylabel("Focus Score")
#     plt.ylim(0, 100)
#     plt.grid(True)
#     plt.legend()
#     plt.tight_layout()
#     plt.savefig(CHART_PATH)
#     plt.close()
#     print(f"Focus trend chart saved at {CHART_PATH}")
# import os

# def generate_session_pdf(summary_text):
#     pdf = FPDF()
#     pdf.add_page()
#     pdf.set_font("Arial", "B", 16)
#     pdf.cell(0, 10, "Focus Session Report", ln=True, align='C')
#     pdf.ln(10)
#     timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
#     pdf.set_font("Arial", "", 12)
#     pdf.cell(0, 10, f"Generated on: {timestamp}", ln=True)
#     pdf.ln(10)
#     for line in summary_text.split("\n"):
#         pdf.cell(0, 10, line, ln=True)
#     pdf.ln(10)
#     pdf.set_font("Arial", "B", 12)
#     pdf.cell(0, 10, "Focus Score Chart:", ln=True)

#     # 📷 Check if chart image exists before inserting
#     if os.path.exists(CHART_PATH):
#         pdf.image(CHART_PATH, x=10, w=190)
#     else:
#         print("⚠️ Warning: Chart image missing! Not embedding in PDF.")

#     pdf.output(PDF_PATH)
#     print(f"PDF report generated at {PDF_PATH}")


# def generate_report():
#     if not os.path.exists(REPORTS_DIR):
#         os.makedirs(REPORTS_DIR)

#     if focus_scores:
#         avg_focus = sum(focus_scores) / len(focus_scores)
#         summary = (
#             f"Session Duration: {SESSION_DURATION} seconds\n"
#             f"Average Focus: {avg_focus:.2f}\n"
#             f"Distractions Detected: {len([s for s in focus_scores if s < 50])}\n"
#             f"Phone Alerts: {len([1 for s in focus_scores if s == 0])}\n"
#         )
#     else:
#         summary = "No valid focus scores recorded."

#     generate_focus_chart()
#     generate_session_pdf(summary)


