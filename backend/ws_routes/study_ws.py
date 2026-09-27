from fastapi import WebSocket, WebSocketDisconnect, APIRouter
import cv2
import numpy as np
import json
import logging
import time

from cv_project.study_mode import process_frame
from cv_project.study_mode import set_session_duration
from cv_project.landmark_pipeline import LandmarkPipeline
from ws_routes.score_comparison import ScoreComparisonLog



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


# Session setup: the first message is {"duration": minutes}
async def receive_session_duration(websocket):
    """Sets the session length from the first message. Returns False (after telling the client) if it couldn't."""
    try:
        data = await websocket.receive_text()
        parsed = json.loads(data)
        duration = parsed.get("duration", 30)  # Default to 30 minutes
        set_session_duration(duration * 60)
        logger.info(f"Session duration set to: {duration} minutes")
        return True
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON received: {e}")
        await websocket.send_text(json.dumps({
            "score": None,
            "cheat_events": [],
            "error": "invalid_json"
        }))
        return False
    except Exception as e:
        logger.error(f"Error receiving duration: {e}")
        await websocket.send_text(json.dumps({
            "score": None,
            "cheat_events": [],
            "error": "duration_error"
        }))
        return False


# JPEG frame pipeline (binary messages): the score the client currently receives.
# Goes away once the landmark JSON pipeline replaces it.
async def handle_jpeg_frame(websocket, image_bytes, frame_count, timestamp):
    """Decodes one JPEG frame, scores it with process_frame and sends the result to the client.
    Returns the score, or None if the frame couldn't be decoded or scored, or the session has ended."""
    # Decode JPEG bytes to image
    try:
        image_array = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if frame is None:
            logger.warning(f"Frame {frame_count}: Failed to decode image")
            return None
    except Exception as e:
        logger.warning(f"Frame {frame_count}: Exception decoding image: {e}")
        return None

    # Process frame and send score
    score = None
    try:
        result = process_frame(frame, timestamp)
        await websocket.send_text(result)
        try:
            score = json.loads(result)["score"]
        except (ValueError, KeyError, TypeError):
            pass  # e.g. "Session Ended"
        logger.debug(f"Frame {frame_count}: Sent: {result}, Timestamp: {timestamp:.2f}s")
    except Exception as e:
        logger.error(f"Error processing frame {frame_count}: {e}")
        await websocket.send_text(json.dumps({
            "score": None,
            "cheat_events": [],
            "error": "frame_processing_failed"
        }))
    return score


@router.websocket('/ws/study')
async def study_session_handling(websocket: WebSocket):
    """One connection per study session. The first message sets the duration; after that, text messages are
    the landmark JSON pipeline and binary messages are the JPEG frame pipeline."""
    await websocket.accept()
    logger.info("WebSocket connection established")

    # Track session start time for consistent timestamps
    session_start_time = time.time()

    # Initialize frame_count to prevent UnboundLocalError
    frame_count = 0

    landmarks = LandmarkPipeline()
    comparison = ScoreComparisonLog(session_start_time)

    try:
        if not await receive_session_duration(websocket):
            return

        # Loop for receiving frames
        error_count = 0
        max_errors = 10  # Prevent infinite error loops

        while True:
            try:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    raise WebSocketDisconnect(message.get("code", 1000))

                # Temporary: JPEG frame vs landmark JSON comparison, logged at most once per second
                comparison.log_if_due(landmarks.smoothed_prob)

                if message.get("text") is not None:
                    # Landmark JSON pipeline (text): scored and classified, not sent to the client yet
                    reading = landmarks.handle_landmark_message(message["text"])
                    comparison.record_landmark_reading(reading)

                elif message.get("bytes") is not None:
                    # JPEG frame pipeline (binary): decoded, scored, and the score sent to the client
                    frame_count += 1
                    error_count = 0  # Reset error count on successful frame
                    timestamp = time.time() - session_start_time
                    video_score = await handle_jpeg_frame(websocket, message["bytes"], frame_count, timestamp)
                    comparison.record_video_score(video_score)

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
