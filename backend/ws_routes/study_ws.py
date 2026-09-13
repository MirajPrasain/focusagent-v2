from fastapi import FastAPI, WebSocket, WebSocketDisconnect, APIRouter
import cv2
from cv2 import imdecode, IMREAD_COLOR
import base64
import numpy as np
import json
import logging
from typing import Union, Tuple
import time

from cv_project.study_mode import process_frame
from cv_project.study_mode import set_session_duration



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter() 

def validate_image_data(image_data: str) -> bool:
    """Validate image data before processing."""
    if not image_data or len(image_data) < 100:  # Minimum reasonable size
        return False
    
    if not image_data.startswith('data:image/'):
        return False
    
    try:
        # Check if we can extract the base64 part
        parts = image_data.split(',')
        if len(parts) != 2:
            return False
        
        # Try to decode a small portion to validate base64
        test_bytes = base64.b64decode(parts[1][:100] + '==')  # Add padding
        return len(test_bytes) > 0
    except Exception:
        return False

def decode_image_safely(image_data: str) -> Tuple[bool, Union[np.ndarray, None]]:
    """Safely decode image data with comprehensive error handling."""
    try:
        # Validate image data format
        if not validate_image_data(image_data):
            logger.warning("Invalid image data format received")
            return False, None
        
        # Extract base64 data
        parts = image_data.split(',')
        if len(parts) != 2:
            logger.warning("Malformed image data: missing base64 separator")
            return False, None
        
        # Decode base64
        try:
            image_bytes = base64.b64decode(parts[1])
        except Exception as e:
            logger.warning(f"Base64 decode failed: {e}")
            return False, None
        
        # Convert to numpy array
        try:
            image_array = np.frombuffer(image_bytes, np.uint8)
        except Exception as e:
            logger.warning(f"Failed to create numpy array: {e}")
            return False, None
        
        # Validate array size
        if image_array.size == 0:
            logger.warning("Empty image array received")
            return False, None
        
        if image_array.size < 1000:  # Minimum reasonable image size
            logger.warning(f"Image array too small: {image_array.size} bytes")
            return False, None
        
        # Decode image
        frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if frame is None:
            logger.warning("Failed to decode image with OpenCV")
            return False, None
        
        # Validate frame dimensions
        if frame.shape[0] < 10 or frame.shape[1] < 10:
            logger.warning(f"Image dimensions too small: {frame.shape}")
            return False, None
        
        return True, frame
        
    except Exception as e:
        logger.warning(f"Unexpected error during image decoding: {e}")
        return False, None

@router.websocket('/ws/study')
async def study_session_handling(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established")
    
    # Track session start time for consistent timestamps
    session_start_time = time.time()
    
    # Initialize frame_count to prevent UnboundLocalError
    frame_count = 0
    
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
            await websocket.send_text("error:invalid_json")
            return
        except Exception as e:
            logger.error(f"Error receiving duration: {e}")
            await websocket.send_text("error:duration_error")
            return

        # Loop for receiving frames
        error_count = 0
        max_errors = 10  # Prevent infinite error loops
        
        while True:
            try:
                image_bytes = await websocket.receive_bytes()
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
                    logger.debug(f"Frame {frame_count}: Sent: {result}, Timestamp: {current_timestamp:.2f}s")
                except Exception as e:
                    logger.error(f"Error processing frame {frame_count}: {e}")
                    await websocket.send_text("50")

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
                    await websocket.send_text("error:frame_processing")
                except:
                    pass
                continue

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
    finally:
        logger.info(f"WebSocket session ended. Processed {frame_count} frames.")