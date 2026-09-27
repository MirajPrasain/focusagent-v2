from fastapi import WebSocket, WebSocketDisconnect, APIRouter
import json
import logging

from cv_project.landmark_pipeline import LandmarkPipeline



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# The most recent session's pipeline, kept after its connection closes so the post-session charts
# (ws_routes/charts.py) can read its scores. One slot for the whole server: a new session replaces it.
_latest_session = None


def latest_session():
    """The LandmarkPipeline of the most recent session, or None before the first one."""
    return _latest_session


# Session setup: the first message is {"duration": minutes}
async def receive_session_duration(websocket):
    """Reads the session length from the first message and returns it in seconds.
    Returns None (after telling the client) if it couldn't."""
    try:
        data = await websocket.receive_text()
        parsed = json.loads(data)
        duration = parsed.get("duration", 30)  # Default to 30 minutes
        logger.info(f"Session duration set to: {duration} minutes")
        return duration * 60
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON received: {e}")
        await websocket.send_text(json.dumps({
            "score": None,
            "cheat_events": [],
            "error": "invalid_json"
        }))
        return None
    except Exception as e:
        logger.error(f"Error receiving duration: {e}")
        await websocket.send_text(json.dumps({
            "score": None,
            "cheat_events": [],
            "error": "duration_error"
        }))
        return None


@router.websocket('/ws/study')
async def study_session_handling(websocket: WebSocket):
    """One connection per study session. The first message sets the duration; every message after that is a
    landmark pipeline text message (cv_project/landmark_pipeline.py), answered with its reply if it has one."""
    global _latest_session
    await websocket.accept()
    logger.info("WebSocket connection established")

    message_count = 0
    pipeline = None

    try:
        session_duration = await receive_session_duration(websocket)
        if session_duration is None:
            return
        pipeline = LandmarkPipeline(session_duration)
        _latest_session = pipeline

        # Loop for receiving messages
        error_count = 0
        max_errors = 10  # Prevent infinite error loops

        while True:
            try:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    raise WebSocketDisconnect(message.get("code", 1000))
                if message.get("text") is None:
                    continue  # only text messages are expected; anything else is ignored

                message_count += 1
                reply = pipeline.handle_text_message(message["text"])
                if reply is not None:
                    await websocket.send_text(reply)
                error_count = 0  # Reset error count on a handled message

            except WebSocketDisconnect:
                logger.info("WebSocket disconnected by client")
                break
            except Exception as e:
                error_count += 1
                logger.error(f"WebSocket error (message {message_count}): {e}")

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
        if pipeline:
            pipeline.stop()
        scored = len(pipeline.gaze_scores) if pipeline else 0
        logger.info(f"WebSocket session ended. Handled {message_count} messages, {scored} scored this session.")
