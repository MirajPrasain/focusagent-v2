from fastapi import WebSocket, WebSocketDisconnect, APIRouter
import json
import logging

from cv_project.landmark_pipeline import LandmarkPipeline
from routes_auth import user_for_token



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Each user's most recent session's pipeline, by user id, kept after its connection closes so the session summary
# (ws_routes/charts.py) can read its scores. A user's next session replaces it.
_sessions_by_user = {}

# Close code for a connection whose first message has no valid token (the 4000s are free for applications). The
# frontend (Session.tsx) drops the stored token and goes to /login on it
UNAUTHORIZED_CLOSE_CODE = 4401


def session_for(user_id):
    """The LandmarkPipeline of this user's most recent session, or None before their first one."""
    return _sessions_by_user.get(user_id)


# Session setup: the first message is {"duration": minutes, "token": the JWT from /signup or /login}
async def receive_session_start(websocket):
    """Reads the first message and returns (session length in seconds, token). Returns None (after telling the
    client) if it couldn't."""
    try:
        data = await websocket.receive_text()
        parsed = json.loads(data)
        duration = parsed.get("duration", 30)  # Default to 30 minutes
        logger.info(f"Session duration set to: {duration} minutes")
        return duration * 60, parsed.get("token")
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
    """One connection per study session. The first message sets the duration and says whose session it is (no
    valid token: the connection is closed with UNAUTHORIZED_CLOSE_CODE); every message after that is a landmark
    pipeline text message (cv_project/landmark_pipeline.py), answered with its reply if it has one."""
    await websocket.accept()
    logger.info("WebSocket connection established")

    message_count = 0
    pipeline = None

    try:
        session_start = await receive_session_start(websocket)
        if session_start is None:
            return
        session_duration, token = session_start
        user = await user_for_token(token)
        if user is None:
            logger.info("WebSocket closed: no valid token")
            await websocket.close(code=UNAUTHORIZED_CLOSE_CODE, reason="unauthorized")
            return
        pipeline = LandmarkPipeline(session_duration)
        _sessions_by_user[str(user.id)] = pipeline

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
