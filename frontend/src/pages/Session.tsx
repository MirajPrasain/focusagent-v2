import { useRef, useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Square, RotateCcw } from 'lucide-react';
import { detectFaces } from '../lib/faceLandmarker'
import { speak, speakAndWait, sleep } from '../lib/speech'

// Set to true to re-enable websocket/TTS/session console logs
const DEBUG_LOGS = false;

// Screen calibration, started from the "Start calibration" button in full screen, before the session timer starts.
// Every timed step: speak the instruction, wait for speech to end, voice countdown "3, 2, 1", record, "okay".
// The backend (backend/cv_project/landmark_pipeline.py) is told {"type": "calibration", "phase": ...}:
// "main" / "second_screen" when a recording starts, "idle" whenever it isn't recording, "done" at the end.
// It turns the gaze recorded in each phase into this user's on-screen ranges and replies with the result.
const MAIN_SCAN_SECONDS = 10; // the dot takes ~2.5s per edge of the screen border
const SECOND_SCREEN_POINT_SECONDS = 2;
const COUNTDOWN_FROM = 3;
// No reply to "done" within this long (e.g. an older backend): start the session anyway
const CALIBRATION_REPLY_TIMEOUT_MS = 3000;

const SECOND_SCREEN_POINTS = [
  { id: 'top_left', label: 'top left corner' },
  { id: 'top_right', label: 'top right corner' },
  { id: 'bottom_right', label: 'bottom right corner' },
  { id: 'bottom_left', label: 'bottom left corner' },
  { id: 'center', label: 'center' },
];

// waiting: for the Start calibration button; running: the steps below; checking: waiting for the backend's result;
// failed: the backend found the scan too narrow; done: overlay closed, session timer running
type CalibrationStatus = 'waiting' | 'running' | 'checking' | 'failed' | 'done';

type CalibrationView = {
  prompt: string;
  dot: 'none' | 'ready' | 'moving'; // the main-screen scan dot: parked at its start, or moving
  countdown: number | null;
  recording: boolean;
  asking: boolean; // showing the second-screen Yes / No buttons
};

const IDLE_VIEW: CalibrationView = { prompt: '', dot: 'none', countdown: null, recording: false, asking: false };

// Thrown inside a calibration run that was cancelled (skip, redo or unmount) to stop it at its next step
const CANCELLED = Symbol('calibration cancelled');

// Calibration runs in full screen so the scan covers the whole screen. A refused request (browser policy)
// leaves the page windowed and calibration runs anyway.
function enterFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
}

function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// Point on the screen border (percent of the viewport) at fraction t of one lap, starting top left:
// top edge left to right, right edge down, bottom edge right to left, left edge up
function borderPoint(t: number) {
  const lo = 3, hi = 97;
  const edge = Math.min(Math.floor(t * 4), 3);
  const along = (t * 4 - edge) * (hi - lo);
  return [
    { x: lo + along, y: lo },
    { x: hi, y: lo + along },
    { x: hi - along, y: hi },
    { x: lo, y: hi - along },
  ][edge];
}

// The dot for the main-screen scan: parked at the start of the lap until `moving`, then one lap in MAIN_SCAN_SECONDS
function ScanDot({ moving }: { moving: boolean }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!moving) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / (MAIN_SCAN_SECONDS * 1000), 1);
      setT(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving]);
  const { x, y } = borderPoint(moving ? t : 0);
  return (
    <div
      className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50"
      style={{ left: `${x}%`, top: `${y}%` }}
    />
  );
}

interface DistractionEvent {
  timestamp: number;
  type: string;
  count: number;
}

function Session() {
  const [searchParams] = useSearchParams();
  const duration = parseInt(searchParams.get("duration") || "25");
  const goal = decodeURIComponent(searchParams.get("goal") || "");

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState("--");
  const [focusScore, setFocusScore] = useState<number | null>(null);
  const [distraction, setDistraction] = useState(false);
  const [sessionProgress, setSessionProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [backendConnected, setBackendConnected] = useState(false);
  const navigate = useNavigate();

  const [faceSeen, setFaceSeen] = useState(false);
  const faceSeenRef = useRef(false);
  const [calibrationStatus, setCalibrationStatus] = useState<CalibrationStatus>('waiting');
  const [calibrationView, setCalibrationView] = useState<CalibrationView>(IDLE_VIEW);
  const calibrationRunRef = useRef(0); // bumped to cancel the running calibration
  const secondScreenAnswerRef = useRef<((yes: boolean) => void) | null>(null);
  const sessionStarted = calibrationStatus === 'done';

  const [distractionHistory, setDistractionHistory] = useState<DistractionEvent[]>([]);

  // API URL - MediaPipe backend for face detection, AI messages, and TTS
  const MEDIAPIPE_API_URL = import.meta.env.VITE_MEDIAPIPE_API_URL || 'http://localhost:8001';

  // Start webcam stream
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStatus("Camera Active");
        }
      })
      .catch((err) => {
        console.error("Camera access error:", err);
        setStatus("Camera access denied");
      });
  }, []);

  // Browser-side MediaPipe: every 200ms, detect the face and send a landmark message on the study websocket.
  // The backend (backend/cv_project/landmark_pipeline.py) scores it and replies with {score, cheat_events}.
  useEffect(() => {
    // Same indices as LANDMARK_INDICES in backend/cv_project/geometry.py
    const LANDMARK_INDICES = [159, 145, 33, 133, 468, 1, 234, 454, 152, 151];
    // Eye blendshapes; the backend's gaze angle uses the four eyeLookIn/eyeLookOut values
    const BLENDSHAPE_NAMES = [
      'eyeBlinkLeft', 'eyeBlinkRight',
      'eyeLookDownLeft', 'eyeLookDownRight',
      'eyeLookUpLeft', 'eyeLookUpRight',
      'eyeLookInLeft', 'eyeLookInRight',
      'eyeLookOutLeft', 'eyeLookOutRight',
    ];
    let busy = false;
    let lastTimestamp = -1;

    const interval = setInterval(async () => {
      const video = videoRef.current;
      //if busy, no video , video not ready, video not loaded(width = 0 ) - > dont do anything
      if (busy || !video || video.readyState < 2 || video.videoWidth === 0) return;

      const timestamp = performance.now();
      // 100, 200, 300. timestamp should be increasing, if it less than last, dont do anything 
      if (timestamp <= lastTimestamp) return;
      lastTimestamp = timestamp;

      //Before starting to detect video, set busy flag to true. 
      busy = true;

     
      try {
        const result = await detectFaces(video, timestamp);

        // Send pixel-space landmarks as a text message on the study websocket
        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          const w = video.videoWidth;
          const h = video.videoHeight;
          const face = result.faceLandmarks[0];
          
          //make the points array 
          const points: Record<string, [number, number]> = {};
          if (face) {
            for (const idx of LANDMARK_INDICES) {
              const lm = face[idx];
              if (lm) points[idx] = [Math.trunc(lm.x * w), Math.trunc(lm.y * h)]; //adds points to the array 
            }
          }
          // Eye blendshapes (empty when no face)
          const categories = result.faceBlendshapes[0]?.categories;
          const blendshapes: Record<string, number> = {};
          if (categories) {
            for (const name of BLENDSHAPE_NAMES) {
              blendshapes[name] = categories.find((c) => c.categoryName === name)?.score ?? 0;
            }
          }
          // Head yaw/pitch in degrees from the 4x4 facial transformation matrix (null when no face)
          const matrix = result.facialTransformationMatrixes?.[0]?.data;
          let headPose: { yaw: number; pitch: number } | null = null;
          if (matrix && matrix.length === 16) {
            // Column-major, so column 2 (data[8..10]) is the face's forward axis in camera space
            // (x right, y up, z toward the camera). atan2 cancels out any scale in the matrix.
            // yaw > 0: turned toward the image's right (the user's left); pitch > 0: tilted up
            const [fx, fy, fz] = [matrix[8], matrix[9], matrix[10]];
            const toDeg = (rad: number) => Math.round((rad * 180) / Math.PI * 10) / 10;
            headPose = {
              yaw: toDeg(Math.atan2(fx, fz)),
              pitch: toDeg(Math.atan2(fy, Math.hypot(fx, fz))),
            };
          }
          socket.send(JSON.stringify({ type: 'landmarks',
             faceCount: result.faceLandmarks.length,
              points,
              blendshapes,
              headPose }));
          // The first landmark message with a face enables the Start calibration button
          if (face && !faceSeenRef.current) {
            faceSeenRef.current = true;
            setFaceSeen(true);
          }
        }
      } catch (err) {
        console.error('[FaceLandmarker] detection error:', err);
      } finally {
        busy = false;
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // Session timer and progress: starts once calibration is finished or skipped
  useEffect(() => {
    if (!sessionStarted) return;
    const startTime = Date.now();
    sessionStartTime.current = startTime;
    const totalDurationMs = duration * 60 * 1000;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / totalDurationMs) * 100, 100);
      
      setElapsedTime(Math.floor(elapsed / 1000));
      setSessionProgress(progress);

      if (progress >= 100) {
        clearInterval(timer);
        handleEndSession();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [duration, sessionStarted]);
  
const sessionStartTime = useRef(Date.now());

// Track distraction events for the session summary
useEffect(() => {
  if (!distraction) return;

  setDistractionHistory(prev => [...prev, {
    timestamp: Date.now(),
    type: 'distraction',
    count: prev.length + 1
  }]);
}, [distraction]);

  // Setup WebSocket connection (the landmark effect above sends on it)
  useEffect(() => {
    if (DEBUG_LOGS) console.log('🔌 Attempting to connect to MediaPipe backend:', MEDIAPIPE_API_URL);
    const protocol = MEDIAPIPE_API_URL.startsWith('https://') ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${MEDIAPIPE_API_URL.replace('http://', '').replace('https://', '')}/ws/study`;
    if (DEBUG_LOGS) console.log('🔌 WebSocket URL:', wsUrl);
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      if (DEBUG_LOGS) console.log("✅ Connected to backend Study WebSocket server");
      socket.send(JSON.stringify({ duration }));
      setStatus("Connected");
      setBackendConnected(true);
    };

    //onmessage receives {score, cheat_events} back and drives the UI: focus score box, "Distraction detected" badge, status text.

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (DEBUG_LOGS) console.log('📊 Received from backend:', data);

        // Calibration result (reply to "done"): only matters while the overlay waits for it
        if (data.type === 'calibration') {
          setCalibrationStatus((current) =>
            current === 'checking' ? (data.status === 'too_narrow' ? 'failed' : 'done') : current);
          return;
        }

        if (data.error) {
          const errorMessages: Record<string, string> = {
            invalid_json: "Invalid session data, please reconnect...",
            duration_error: "Session duration error, please reconnect...",
            websocket_error: "Connection issue, retrying...",
          };
          setStatus(errorMessages[data.error] || `Backend error: ${data.error}`);
          return;
        }

        const score = data.score;
        const cheatEvents = data.cheat_events;

        // Debug logging
        if (DEBUG_LOGS) console.log('Focus Score received:', score, 'Type:', typeof score);
        
        // Handle score
        if (typeof score === 'number') {
          setFocusScore(score);
          if (score === 0) {
            if (DEBUG_LOGS) console.warn('⚠️ Score is 0 - Check if face is visible and well-lit');
          }
        } else {
          if (DEBUG_LOGS) console.warn('⚠️ No score in response:', data);
          setFocusScore(null);
        }
        
        setDistraction(cheatEvents && cheatEvents.length > 0);

        const message = cheatEvents && cheatEvents.length > 0
          ? `Focus Score: ${score} (Distraction detected)`
          : `Focus Score: ${score || 'Processing...'}`;

        setStatus(message);
      } catch (err) {
        console.error("Failed to parse message:", err);
        console.error("Raw message:", event.data);
        setStatus(`Parse Error: ${event.data}`);
      }
    };

    socket.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      console.error("Is MediaPipe backend running on", MEDIAPIPE_API_URL, "?");
      setStatus("⚠️ Connection Error - Check if backend is running");
      setBackendConnected(false);
    };

    socket.onclose = (event) => {
      if (DEBUG_LOGS) console.log("🔌 WebSocket connection closed. Code:", event.code, "Reason:", event.reason);
      setStatus("Disconnected - Backend may not be running");
      setBackendConnected(false);
    };

    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, [duration, MEDIAPIPE_API_URL]);

  const sendCalibration = useCallback((phase: string, extra: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'calibration', phase, ...extra }));
    }
  }, []);

  // Stops a running calibration at its next step and silences it
  const cancelCalibration = useCallback(() => {
    calibrationRunRef.current += 1;
    window.speechSynthesis?.cancel();
    secondScreenAnswerRef.current?.(false);
    secondScreenAnswerRef.current = null;
  }, []);

  // One full calibration run. Every await is followed by a check, so a cancelled run stops before its next
  // side effect (message, speech or UI change).
  const runCalibration = useCallback(async () => {
    const runId = ++calibrationRunRef.current;
    const step = async <T,>(promise: Promise<T>) => {
      const value = await promise;
      if (runId !== calibrationRunRef.current) throw CANCELLED;
      return value;
    };
    const show = (view: Partial<CalibrationView>) => setCalibrationView({ ...IDLE_VIEW, ...view });

    // Speak the instruction, wait for it to finish, count down "3, 2, 1", record, then say "okay".
    // scan: show the main-screen dot. screenText: show only this text for the whole step (the user is looking
    // at another screen, so the dot, countdown and recording indicator would only pull their eyes back).
    const record = async (prompt: string, phase: string, seconds: number,
                          { extra = {}, scan = false, screenText }:
                            { extra?: Record<string, unknown>; scan?: boolean; screenText?: string } = {}) => {
      const view = (stage: Partial<CalibrationView>) =>
        show(screenText ? { prompt: screenText } : { prompt, dot: scan ? 'ready' : 'none', ...stage });
      view({});
      await step(speakAndWait(prompt));
      for (let n = COUNTDOWN_FROM; n > 0; n--) {
        view({ countdown: n });
        speak(String(n));
        await step(sleep(1000));
      }
      view({ dot: scan ? 'moving' : 'none', recording: true });
      sendCalibration(phase, extra);
      await step(sleep(seconds * 1000));
      sendCalibration('idle');
      show({ prompt: screenText ?? 'Okay' });
      await step(speakAndWait('Okay'));
    };

    try {
      setCalibrationStatus('running');
      sendCalibration('idle'); // calibrating from here on: the backend stops scoring

      await record('Follow the dot with your eyes.', 'main', MAIN_SCAN_SECONDS, { scan: true });

      const question = 'Do you use a second screen?';
      show({ prompt: question, asking: true });
      speak(question);
      const hasSecondScreen = await step(new Promise<boolean>((resolve) => {
        secondScreenAnswerRef.current = resolve;
      }));
      secondScreenAnswerRef.current = null;

      if (hasSecondScreen) {
        for (const point of SECOND_SCREEN_POINTS) {
          await record(`Look at the ${point.label} of your second screen. Keep looking until you hear 'okay'.`,
            'second_screen', SECOND_SCREEN_POINT_SECONDS,
            { extra: { point: point.id }, screenText: 'Keep your eyes on your second screen' });
        }
      }

      show({ prompt: 'Checking your calibration...' });
      setCalibrationStatus('checking');
      sendCalibration('done');
    } catch (err) {
      if (err !== CANCELLED) throw err;
    }
  }, [sendCalibration]);

  // No reply to "done" in time: start the session with whatever the backend has
  useEffect(() => {
    if (calibrationStatus !== 'checking') return;
    const timer = setTimeout(() => setCalibrationStatus((current) => current === 'checking' ? 'done' : current),
      CALIBRATION_REPLY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [calibrationStatus]);

  // Leave full screen once calibration is finished or skipped
  useEffect(() => {
    if (sessionStarted) exitFullscreen();
  }, [sessionStarted]);

  // Stop any running calibration (and its speech) and leave full screen when leaving the page
  useEffect(() => () => {
    cancelCalibration();
    exitFullscreen();
  }, [cancelCalibration]);

  // Start calibration and Redo. Full screen needs a user gesture, so this only runs from a button click.
  const startCalibration = () => {
    cancelCalibration();
    enterFullscreen();
    runCalibration();
  };

  const skipCalibration = () => {
    cancelCalibration();
    // The backend drops any samples, keeps the default range, and restarts its session clock with ours
    sendCalibration('done', { skipped: true });
    setCalibrationView(IDLE_VIEW);
    setCalibrationStatus('done');
  };

  const answerSecondScreen = (yes: boolean) => secondScreenAnswerRef.current?.(yes);

const handleEndSession = () => {
    if (DEBUG_LOGS) console.log("🚀 Ending Study Session...");
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
    
    // Stop webcam
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track: MediaStreamTrack) => track.stop());
    }

    localStorage.setItem("lastSession", JSON.stringify({
      duration,
      minute: Math.floor((Date.now() - sessionStartTime.current) / 60000),
      distractionHistory: distractionHistory,
      totalDistractions: distractionHistory.length,
      focusScore: focusScore
    }));
    navigate("/post-session");
  };

  const handleReplay = () => {
    window.location.reload();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl opacity-30"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-l from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl opacity-20"></div>
      </div>

      {/* Progress Bar - Fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-2 bg-gray-800/50 backdrop-blur-sm">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 transition-all duration-1000 ease-out shadow-blue-500/25"
            style={{ width: `${sessionProgress}%` }}
          ></div>
        </div>

        {/* Session info overlay */}
        <div className="absolute top-4 left-6 bg-gray-900/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700">
          <div className="flex items-center space-x-4 text-sm">
            <div className="text-white font-medium">{formatTime(elapsedTime)} / {duration}:00</div>
            <div className="text-blue-300 font-medium">{Math.round(sessionProgress)}%</div>
          </div>
        </div>

        <div className="absolute top-4 right-6 bg-gray-900/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 ${status.includes('Error') || status.includes('denied') ? 'bg-red-400' : 'bg-green-400'} rounded-full animate-pulse`}></div>
            <span className="text-white text-sm font-medium">{status}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pt-20 pb-32">
        
        {/* Goal Display */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center space-x-2 bg-gray-800/30 border border-blue-500/30 rounded-full px-6 py-3 backdrop-blur-sm">
            <div className="w-2 h-2 bg-blue-300 rounded-full animate-pulse"></div>
            <span className="text-white font-medium">🎯 {goal}</span>
          </div>
        </div>

        {/* Webcam Video - Bigger and Centered */}
        <div className="relative group mb-6">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity duration-300"></div>
          <div className="relative bg-gray-900/50 backdrop-blur-sm border-2 border-blue-500/30 rounded-3xl overflow-hidden shadow-blue-500/25 shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-[480px] h-[360px] md:w-[640px] md:h-[480px] lg:w-[800px] lg:h-[600px] object-cover"
              aria-label="Live webcam feed for focus tracking"
            />
            
            {/* Video overlay indicators */}
            <div className="absolute top-6 left-6 flex items-center space-x-3">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50"></div>
              <span className="text-white text-base font-medium bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg">LIVE</span>
            </div>
          </div>
        </div>

        {/* Live Focus Score Box */}
        <div className="w-full max-w-4xl flex flex-col items-center space-y-4" aria-live="polite" aria-atomic="true">
          {focusScore !== null && (
            <div className={`flex items-center justify-center px-8 py-4 rounded-2xl shadow-lg border-2 ${distraction ? 'border-red-400 bg-red-900/30' : 'border-green-400 bg-green-900/30'} mb-2`}
              style={{ minWidth: 220 }}>
              <span className={`text-3xl font-bold ${distraction ? 'text-red-300' : 'text-green-300'} drop-shadow`}>{focusScore}</span>
              <span className="ml-2 text-lg text-white/80 font-medium">Focus Score</span>
              {distraction && <span className="ml-4 px-3 py-1 rounded-full bg-red-500/80 text-white text-xs font-semibold animate-pulse">Distraction detected</span>}
            </div>
          )}
          
          {/* Warning if backend connected but score is 0 */}
          {backendConnected && focusScore === 0 && (
            <div className="mt-2 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 max-w-md">
              <div className="text-yellow-300 font-medium mb-2">⚠️ Score is 0 - Possible Issues:</div>
              <ul className="text-yellow-200/80 text-sm space-y-1 list-disc list-inside">
                <li>Make sure your face is clearly visible to the camera</li>
                <li>Ensure good lighting (not too dark or bright)</li>
                <li>Look directly at the screen/camera</li>
                <li>Backend may still be initializing face detection</li>
              </ul>
            </div>
          )}
          
          {/* Warning if backend not connected */}
          {!backendConnected && (
            <div className="mt-2 bg-red-500/20 border border-red-500/50 rounded-xl p-4 max-w-md">
              <div className="text-red-300 font-medium mb-2">❌ Not Connected to MediaPipe Backend</div>
              <div className="text-red-200/80 text-sm">
                Check browser console (F12) for connection details.
                <br/>Backend should be running on: <code className="bg-black/30 px-2 py-1 rounded">{MEDIAPIPE_API_URL}</code>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls - Fixed position */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleReplay}
            className="group flex items-center space-x-2 bg-gray-800/80 hover:bg-gray-700/80 border border-blue-500/30 text-white px-6 py-3 rounded-xl transition-all duration-300 backdrop-blur-sm shadow-blue-500/25"
            aria-label="Restart session"
          >
            <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            <span className="font-medium">Restart</span>
          </button>
          
          <button
            onClick={handleEndSession}
            className="group flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-blue-500/25 shadow-lg"
            aria-label="End focus session"
          >
            <Square className="w-5 h-5" />
            <span>End Session</span>
          </button>
        </div>
      </div>

      {/* Calibration overlay: covers the session until calibration is done or skipped */}
      {calibrationStatus !== 'done' && (
        <div className="fixed inset-0 z-[60] bg-gray-900/95 backdrop-blur-sm">
          {calibrationView.dot !== 'none' && <ScanDot moving={calibrationView.dot === 'moving'} />}

          <div className="absolute inset-x-0 top-1/4 px-6 text-center">
            <div className="text-sm text-blue-300 font-medium mb-2">Screen calibration</div>
            <div className="text-2xl text-white font-semibold">
              {calibrationStatus === 'waiting'
                ? (faceSeen ? 'Calibrate to your screen' : 'Looking for your face...')
                : calibrationStatus === 'failed'
                  ? "Your eyes didn't move enough to measure your screen."
                  : calibrationView.prompt}
            </div>
            {calibrationStatus === 'waiting' && (
              <>
                <div className="mt-2 text-gray-300">
                  The page goes full screen while you follow a dot with your eyes.
                </div>
                <button
                  onClick={startCalibration}
                  disabled={!faceSeen}
                  className="mt-8 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start calibration
                </button>
              </>
            )}
            {calibrationStatus === 'failed' && (
              <div className="mt-2 text-gray-300">
                Using the default screen range for now. Redo the calibration, or skip to start the session.
              </div>
            )}
            {calibrationView.countdown !== null && (
              <div className="mt-6 text-6xl text-cyan-300 font-bold">{calibrationView.countdown}</div>
            )}
            {calibrationView.recording && (
              <div className="mt-6 inline-flex items-center space-x-2 text-red-300 text-sm font-medium">
                <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>
                <span>Recording</span>
              </div>
            )}
          </div>

          {calibrationView.asking && (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-4 px-6">
              <button
                onClick={() => answerSecondScreen(true)}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300"
              >
                Yes
              </button>
              <button
                onClick={() => answerSecondScreen(false)}
                className="bg-gray-800/80 hover:bg-gray-700/80 border border-blue-500/30 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300"
              >
                No
              </button>
            </div>
          )}

          <div className="absolute bottom-8 inset-x-0 flex justify-center gap-6">
            {calibrationStatus !== 'waiting' && (
              <button
                onClick={startCalibration}
                className={calibrationStatus === 'failed'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300'
                  : 'text-gray-400 hover:text-white text-sm underline underline-offset-4 transition-colors'}
              >
                Redo calibration
              </button>
            )}
            <button
              onClick={skipCalibration}
              className="text-gray-400 hover:text-white text-sm underline underline-offset-4 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Session;