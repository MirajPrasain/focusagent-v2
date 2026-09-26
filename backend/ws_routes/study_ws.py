from fastapi import FastAPI, WebSocket, WebSocketDisconnect, APIRouter
import cv2
from cv2 import imdecode, IMREAD_COLOR
import numpy as np
import json
import logging
import time

from cv_project.study_mode import process_frame
from cv_project.study_mode import set_session_duration
from cv_project.study_mode import get_focus_score, new_scoring_state
from cv_project.distraction_classifier import classify_distraction, DISTRACTION_WEIGHTS, DISTRACTION_THRESHOLD



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter() 

@router.websocket('/ws/study')
async def study_session_handling(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established")
    
    # Track session start time for consistent timestamps
    session_start_time = time.time()
    
    # Initialize frame_count to prevent UnboundLocalError
    frame_count = 0

    # Landmark-JSON scoring runs on its own state so it can't disturb the video path's blink counter
    landmark_state = new_scoring_state()
    latest_video_score = None
    latest_landmark_score = None
    latest_classifier = None  # raw (probability, is_distracted) from the most recent landmark message
    # EMA over per-message classifier probabilities: a single-frame spike (a blink, a momentary glance)
    # gets pulled toward the recent average instead of flagging outright, while sustained distraction
    # still pushes the smoothed value across the threshold within roughly 1-2s at the current message rate.
    # SMOOTHING_ALPHA is the one knob to tune: higher reacts faster, lower filters more noise.
    SMOOTHING_ALPHA = 0.15
    smoothed_prob = None
    max_raw_prob = 0.0  # highest raw probability since the last log line, so short blinks aren't missed by sampling
    peak_blendshapes = None  # the blendshapes that produced max_raw_prob; None when that frame had no face
    last_compare_log = time.time()

    try:
        # Receive duration with error handling
        try:
            data = await websocket.receive_text()
            parsed = json.loads(data) 
            duration = parsed.get("duration", 30)  # Default to 30 minutes
            set_session_duration(duration * 60)
            logger.info(f"Session duration set to: {duration} minutes")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON received: {e}")
            await websocket.send_text(json.dumps({
                "score": None,
                "cheat_events": [],
                "error": "invalid_json"
            }))
            return
        except Exception as e:
            logger.error(f"Error receiving duration: {e}")
            await websocket.send_text(json.dumps({
                "score": None,
                "cheat_events": [],
                "error": "duration_error"
            }))
            return

        # Loop for receiving frames
        error_count = 0
        max_errors = 10  # Prevent infinite error loops
        
        while True:
            try:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    raise WebSocketDisconnect(message.get("code", 1000))

                # Log video vs landmark scores side by side, at most once per second
                now = time.time()
                if now - last_compare_log >= 1:
                    if latest_video_score is not None and latest_landmark_score is not None:
                        logger.info(
                            f"t={now - session_start_time:.1f}s Video-score: {latest_video_score} | "
                            f"Landmark-score: {latest_landmark_score} | "
                            f"diff: {abs(latest_video_score - latest_landmark_score)}"
                        )
                    if latest_video_score is not None and latest_classifier is not None and smoothed_prob is not None:
                        raw_prob, raw_is_distracted = latest_classifier
                        is_distracted_smoothed = smoothed_prob > DISTRACTION_THRESHOLD
                        logger.info(
                            f"t={now - session_start_time:.1f}s Video-score: {latest_video_score} | "
                            f"Raw: prob={raw_prob:.2f} (peak={max_raw_prob:.2f}) is_distracted={raw_is_distracted} | "
                            f"Smoothed: prob={smoothed_prob:.2f} is_distracted={is_distracted_smoothed}"
                        )
                        if peak_blendshapes is None:
                            peak_text = "no face detected"
                        else:
                            peak_text = " ".join(f"{name}={value:.2f}" for name, value in peak_blendshapes.items())
                        logger.info(f"t={now - session_start_time:.1f}s Peak frame blendshapes: {peak_text}")
                    latest_video_score = None
                    latest_landmark_score = None
                    latest_classifier = None
                    max_raw_prob = 0.0
                    peak_blendshapes = None
                    last_compare_log = now

                # Text messages: browser-side landmark JSON, scored for comparison only (never sent to client)
                if message.get("text") is not None:
                    try:
                        parsed_msg = json.loads(message["text"])
                    except json.JSONDecodeError as e:
                        logger.warning(f"Invalid landmark JSON: {e}")
                        continue
                    if parsed_msg.get("type") != "landmarks":
                        logger.warning(f"Unknown text message: {parsed_msg}")
                        continue
                    try:
                        points = {int(idx): tuple(xy) for idx, xy in (parsed_msg.get("points") or {}).items()}
                        latest_landmark_score, _ = get_focus_score(points, landmark_state)
                    except Exception as e:
                        logger.warning(f"Landmark scoring failed: {e}")
                    # Blendshapes are empty when no face was detected: treat that as maximally distracted (prob 1.0)
                    # and feed it through the same smoothing path as a real classifier reading
                    blendshapes = parsed_msg.get("blendshapes") or {}
                    current_prob = None
                    features = None
                    if not blendshapes:
                        current_prob = 1.0
                    elif all(name in blendshapes for name in DISTRACTION_WEIGHTS):
                        try:
                            features = {name: float(blendshapes[name]) for name in DISTRACTION_WEIGHTS}
                            current_prob, _ = classify_distraction(features)
                        except Exception as e:
                            logger.warning(f"Classifier failed: {e}")
                    if current_prob is not None:
                        latest_classifier = (current_prob, current_prob > DISTRACTION_THRESHOLD)
                        if current_prob >= max_raw_prob:
                            max_raw_prob = current_prob
                            peak_blendshapes = features
                        if smoothed_prob is None:
                            smoothed_prob = current_prob
                        else:
                            smoothed_prob = SMOOTHING_ALPHA * current_prob + (1 - SMOOTHING_ALPHA) * smoothed_prob
                    continue

                image_bytes = message.get("bytes")
                if image_bytes is None:
                    continue
                frame_count += 1

                # Reset error count on successful frame
                error_count = 0

                # Calculate timestamp since session start
                current_timestamp = time.time() - session_start_time

                # Decode JPEG bytes to image
                try:
                    image_array = np.frombuffer(image_bytes, np.uint8)
                    frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
                    if frame is None:
                        logger.warning(f"Frame {frame_count}: Failed to decode image")
                        continue
                except Exception as e:
                    logger.warning(f"Frame {frame_count}: Exception decoding image: {e}")
                    continue

                # Process frame and send score
                try:
                    result = process_frame(frame, current_timestamp)
                    await websocket.send_text(result)
                    try:
                        latest_video_score = json.loads(result)["score"]
                    except (ValueError, KeyError, TypeError):
                        pass  # e.g. "Session Ended"
                    logger.debug(f"Frame {frame_count}: Sent: {result}, Timestamp: {current_timestamp:.2f}s")
                except Exception as e:
                    logger.error(f"Error processing frame {frame_count}: {e}")
                    await websocket.send_text(json.dumps({
                        "score": None,
                        "cheat_events": [],
                        "error": "frame_processing_failed"
                    }))

            except WebSocketDisconnect:
                logger.info("WebSocket disconnected by client")
                break
            except Exception as e:
                error_count += 1
                logger.error(f"WebSocket error (frame {frame_count}): {e}")

                if error_count >= max_errors:
                    logger.error(f"Too many consecutive errors ({error_count}), closing connection")
                    break

                # Try to send error acknowledgment
                try:
                    await websocket.send_text(json.dumps({
                        "score": None,
                        "cheat_events": [],
                        "error": "websocket_error"
                    }))
                except:
                    pass
                continue

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
    finally:
        logger.info(f"WebSocket session ended. Processed {frame_count} frames.")