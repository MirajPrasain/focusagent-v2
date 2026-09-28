import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import { X } from 'lucide-react';
import { detectFaces, faceModelFailed } from '../lib/faceLandmarker'
import { openPipWindow, pipSupported } from '../lib/pip'
import { speak, speakAndWait, sleep } from '../lib/speech'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import StatusDot, { type DotState } from '../components/ui/StatusDot'

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
// No reply to "done" within this long: treat it as a failed calibration (Redo / Skip)
const CALIBRATION_REPLY_TIMEOUT_MS = 3000;

// Why the last calibration failed, shown with Redo / Skip. Only "ok" or a skip starts the session: the backend
// doesn't start its session clock on a failure either
type CalibrationFailure = 'too_narrow' | 'not_calibrated' | 'no_reply';
const CALIBRATION_FAILURE_MESSAGES: Record<CalibrationFailure, string> = {
  too_narrow: "Your eyes didn't move enough to measure your screen.",
  not_calibrated: "We couldn't track your eyes during calibration.",
  no_reply: "The server didn't answer, so your calibration couldn't be checked.",
};

const SECOND_SCREEN_POINTS = [
  { id: 'top_left', label: 'top left corner' },
  { id: 'top_right', label: 'top right corner' },
  { id: 'bottom_right', label: 'bottom right corner' },
  { id: 'bottom_left', label: 'bottom left corner' },
  { id: 'center', label: 'center' },
];

// waiting: for the Start calibration button; running: the steps below; checking: waiting for the backend's result;
// failed: see CalibrationFailure; done: overlay closed, session timer running
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
  const lap = Math.min(Math.max(t, 0), 1) * 4; // t is a fraction of the lap: keep it in 0..1
  const edge = Math.min(Math.floor(lap), 3);
  const along = (lap - edge) * (hi - lo);
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
    setT(0); // a redo starts the lap over, not from where the last one ended
    // The lap starts at the first frame's own timestamp. performance.now() taken here can be later than that
    // timestamp (a frame's timestamp is when it began), which made the elapsed time negative: t < 0 picked no edge
    // and the render threw
    let start: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      if (start === null) start = now;
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
      className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
      style={{ left: `${x}%`, top: `${y}%` }}
    />
  );
}

// focused: score at or above the backend's DISTRACTED_BELOW (40); distracted: below it with a face in view;
// away: below it with no face, shown gray rather than red (the summary still counts it as distracted)
type FocusState = 'focused' | 'distracted' | 'away';
const FOCUS_STATES: Record<FocusState, { label: string; dot: DotState }> = {
  focused: { label: 'Focused', dot: 'focused' },
  distracted: { label: 'Distracted', dot: 'distracted' },
  away: { label: "Can't see you", dot: 'away' },
};

// The label leaves Focused only once the score has been below 40 this long without a break. Display only: the
// backend's scoring and the session summary don't use it
const LABEL_DEBOUNCE_MS = 2000;
// With Chime on: one chime after this long distracted without a break, then none until focused again
const CHIME_AFTER_MS = 10000;

// cheat_events codes (backend/cv_project/landmark_pipeline.py) shown under Distracted
const DISTRACTION_REASONS: Record<number, string> = {
  1: 'looking down',
  2: 'looking away',
  3: 'someone else in frame',
  4: 'eyes closed',
};

// The focus strip shows this much of the session, sampled every STRIP_TICK_MS
const STRIP_WINDOW_MS = 5 * 60 * 1000;
const STRIP_TICK_MS = 1000;

// (low, high) gaze_yaw in degrees
type GazeRange = [number, number];
// The backend's DEFAULT_SCREEN_RANGE: the main screen when calibration was skipped or failed
const DEFAULT_MAIN_RANGE: GazeRange = [-15, 15];

const HIDE_CAMERA_KEY = 'focusagent.hideCamera';

// The pop-out window is a compact widget that opens at this size (CSS pixels), which is its content's height: 14px
// padding, the 32px row, a 10px gap, the 16px strip row, 14px padding. Showing the camera grows it by the
// thumbnail's width plus the gap next to it
const PIP_SIZE = { width: 320, height: 86 };
const PIP_THUMB_WIDTH = 64;
const PIP_THUMB_GAP = 12;

// Buttons stay disabled until the websocket is open; after this long still connecting, the overlay adds that the
// server may be waking up (a free-tier host can take up to a minute)
const CONNECT_SLOW_MS = 10000;
// Hide camera shrinks the preview out of sight instead of removing it: face tracking reads the video
const HIDDEN_CAMERA_CLASS = 'pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0';

// The camera preview is one <video> made outside React, so it can move between the page and the pop-out window (an
// element React rendered can't change documents). Face tracking reads it wherever it is
function createCameraVideo() {
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('aria-label', 'Your camera preview');
  video.className = 'h-full w-full -scale-x-100 bg-black object-cover';
  return video;
}

// Where the camera preview shows: moves the shared video into this box when it mounts
function CameraSlot({ video, className }: { video: HTMLVideoElement; className: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.appendChild(video);
    video.play().catch(() => {}); // moving a video to another document can pause it
  }, [video]);
  return <div ref={boxRef} className={className} />;
}

// mm:ss
function formatClock(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// One stretch of the same state on the focus strip, in Date.now() milliseconds
type StripRun = { state: 'focused' | 'distracted'; start: number; end: number };

// The last STRIP_WINDOW_MS of the session, starting at `from` (the strip fills from the left for the first
// STRIP_WINDOW_MS). Time without a face or without scores is left empty
// compact: just the thin bar, growing to fill its row (the pop-out window), without the label and legend
function FocusStrip({ runs, from, compact = false }: { runs: StripRun[]; from: number; compact?: boolean }) {
  const at = (t: number) => Math.min(Math.max((t - from) / STRIP_WINDOW_MS, 0), 1) * 100;
  const bar = (
    <div className={`relative overflow-hidden rounded-full bg-border ${compact ? 'h-1.5 min-w-0 flex-1' : 'h-2'}`}>
      {runs.map((run) => (
        <div
          key={run.start}
          className={`absolute inset-y-0 ${run.state === 'focused' ? 'bg-accent' : 'bg-distracted'}`}
          style={{ left: `${at(run.start)}%`, width: `${at(run.end) - at(run.start)}%` }}
        />
      ))}
    </div>
  );
  if (compact) return bar;
  return (
    <div>
      {bar}
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-secondary">
        <span>Last 5 minutes</span>
        <span className="ml-auto inline-flex items-center gap-1">
          <StatusDot state="focused" size="sm" />
          Focused
        </span>
        <span className="inline-flex items-center gap-1">
          <StatusDot state="distracted" size="sm" />
          Distracted
        </span>
      </div>
    </div>
  );
}

// The live gaze (a dot, hidden with no face) against the calibrated screen ranges. Positive gaze_yaw is the user's
// left, so the bar runs from +extent on the left to -extent on the right: the dot moves the way the eyes do, like
// the mirrored camera preview
function GazeMeter({ gaze, main, second }: { gaze: number | null; main: GazeRange; second: GazeRange | null }) {
  const extent = Math.max(30, ...[...main, ...(second ?? [])].map(Math.abs)) + 10;
  const at = (deg: number) => Math.min(Math.max((extent - deg) / (2 * extent), 0), 1) * 100;
  const ranges = [{ label: 'Main', range: main }, ...(second ? [{ label: 'Second', range: second }] : [])];
  return (
    <div className="w-full" role="img" aria-label="Where you're looking, against your screens">
      <div className="relative h-3 rounded-full bg-border">
        {ranges.map(({ label, range: [low, high] }) => (
          <div
            key={label}
            className="absolute inset-y-0 rounded-sm bg-accent/35"
            style={{ left: `${at(high)}%`, width: `${at(low) - at(high)}%` }}
          />
        ))}
        {gaze !== null && (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-page transition-[left] duration-150"
            style={{ left: `${at(gaze)}%` }}
          />
        )}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-fg-secondary">
        {ranges.map(({ label, range: [low, high] }) => (
          <span
            key={label}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${Math.min(Math.max((at(low) + at(high)) / 2, 8), 92)}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// One soft chime: a short sine tone that fades out
function playChime(audio: AudioContext) {
  const t = audio.currentTime;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  tone.connect(gain).connect(audio.destination);
  tone.start(t);
  tone.stop(t + 1.2);
}

function Session() {
  const [searchParams] = useSearchParams();
  const duration = parseInt(searchParams.get("duration") || "25");

  const [video] = useState(createCameraVideo);
  const socketRef = useRef<WebSocket | null>(null);

  // The pop-out window while it's open. Chrome throttles a hidden tab's timers to once a second, which would cut
  // face tracking from 5 landmark messages a second to 1, but not while the tab has a pop-out window open (measured:
  // 5/s with the tab minimized or behind another tab). So the loops below stay on this page's timers either way
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  pipWindowRef.current = pipWindow;
  // The camera thumbnail in the pop-out window. Off each time it opens; the camera keeps running when it's hidden
  const [pipShowCamera, setPipShowCamera] = useState(false);
  const pipCameraShownRef = useRef(false); // what the window was last sized for
  const pipContentRef = useRef<HTMLDivElement>(null);
  // Set when the tab is hidden without the pop-out window open (tracking lapses), for the note shown on return
  const hiddenUntrackedRef = useRef(false);

  const [elapsedTime, setElapsedTime] = useState(0);
  const sessionStartTime = useRef(Date.now());
  const navigate = useNavigate();

  // Live view from the score messages: the debounced label (null until the first score), the latest
  // cheat_events and gaze (null with no face)
  const [focusState, setFocusState] = useState<FocusState | null>(null);
  const [cheatEvents, setCheatEvents] = useState<number[]>([]);
  const [gaze, setGaze] = useState<number | null>(null);
  // For the websocket's onmessage and the strip's timer, which are set up once: the label's state, when the score
  // went below 40 and has stayed there since (belowSince), the same but only while the face is in view
  // (distractedSince, for the chime), and whether this distraction has chimed already
  const focusStateRef = useRef<FocusState | null>(null);
  const belowSinceRef = useRef<number | null>(null);
  const distractedSinceRef = useRef<number | null>(null);
  const chimedRef = useRef(false);
  const [strip, setStrip] = useState<{ runs: StripRun[]; from: number }>({ runs: [], from: 0 });
  // From the calibration reply; the defaults until then, and what the backend replies to a skip
  const [screenRanges, setScreenRanges] = useState<{ main: GazeRange; second: GazeRange | null }>(
    { main: DEFAULT_MAIN_RANGE, second: null });

  const [hideCamera, setHideCamera] = useState(() => {
    try {
      return localStorage.getItem(HIDE_CAMERA_KEY) === '1';
    } catch {
      return false;
    }
  });
  // Set while Chime is on. Created by the toggle's click, which is what allows it to play
  const audioRef = useRef<AudioContext | null>(null);
  const [chimeOn, setChimeOn] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [showHiddenNote, setShowHiddenNote] = useState(false);

  const [faceSeen, setFaceSeen] = useState(false);
  const faceSeenRef = useRef(false);
  const [calibrationStatus, setCalibrationStatus] = useState<CalibrationStatus>('waiting');
  const [calibrationView, setCalibrationView] = useState<CalibrationView>(IDLE_VIEW);
  const calibrationRunRef = useRef(0); // bumped to cancel the running calibration
  const secondScreenAnswerRef = useRef<((yes: boolean) => void) | null>(null);
  const [calibrationFailure, setCalibrationFailure] = useState<CalibrationFailure | null>(null);
  const sessionStarted = calibrationStatus === 'done';
  // For the websocket's onmessage, which is set up once: score messages are ignored until the session starts
  const sessionStartedRef = useRef(false);

  // Shown in the calibration overlay, which covers the status pill and the connection warning
  const [cameraError, setCameraError] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [backendLost, setBackendLost] = useState(false);
  // The websocket is open: until then nothing can be sent, so the calibration buttons stay disabled
  const [socketOpen, setSocketOpen] = useState(false);
  const [connectSlow, setConnectSlow] = useState(false);

  // API URL - MediaPipe backend for face detection, AI messages, and TTS
  const MEDIAPIPE_API_URL = import.meta.env.VITE_MEDIAPIPE_API_URL || 'http://localhost:8001';

  // Start webcam stream, and release the camera when the page is left (End Session also stops it)
  useEffect(() => {
    let stream: MediaStream | null = null;
    let unmounted = false;
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((s) => {
        // Arrived after the page was left (or after StrictMode's first mount in dev): release it right away
        if (unmounted) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
      })
      .catch((err) => {
        console.error("Camera access error:", err);
        setCameraError(true);
      });
    return () => {
      unmounted = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [video]);

  // Browser-side MediaPipe: every 200ms, detect the face and send a landmark message on the study websocket.
  // The backend (backend/cv_project/landmark_pipeline.py) scores it and replies with {score, cheat_events, distracted}.
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
      //if busy, video not ready, video not loaded(width = 0 ) - > dont do anything
      if (busy || video.readyState < 2 || video.videoWidth === 0) return;

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
        // The model gave up loading (lib/faceLandmarker.ts): stop the loop and say so in the overlay
        if (faceModelFailed()) {
          clearInterval(interval);
          setModelError(true);
        }
      } finally {
        busy = false;
      }
    }, 200);

    return () => clearInterval(interval);
  }, [video]);

  // Session timer: starts once calibration is finished or skipped
  useEffect(() => {
    if (!sessionStarted) return;
    const startTime = Date.now();
    sessionStartTime.current = startTime;
    const totalDurationMs = duration * 60 * 1000;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setElapsedTime(Math.floor(elapsed / 1000));

      if (elapsed >= totalDurationMs) {
        clearInterval(timer);
        endSessionRef.current();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [duration, sessionStarted]);

  // Focus strip: every STRIP_TICK_MS, extend the last run (or start one) with the label's state
  useEffect(() => {
    if (!sessionStarted) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const state = focusStateRef.current;
      setStrip(({ runs }) => {
        const kept = runs.filter((run) => run.end > now - STRIP_WINDOW_MS);
        const last = kept[kept.length - 1];
        // A late tick (hidden tab) leaves a gap instead of stretching the last run over it
        const joins = last !== undefined && now - last.end <= 2 * STRIP_TICK_MS;
        if (state === 'focused' || state === 'distracted') {
          if (joins && last.state === state) kept[kept.length - 1] = { ...last, end: now };
          else kept.push({ state, start: joins ? last.end : now - STRIP_TICK_MS, end: now });
        }
        return { runs: kept, from: Math.max(sessionStartTime.current, now - STRIP_WINDOW_MS) };
      });
    }, STRIP_TICK_MS);
    return () => clearInterval(timer);
  }, [sessionStarted]);

  // Back from a hidden tab or minimized window. Without the pop-out window, detection was throttled meanwhile, so
  // say so, and restart the label and chime timers since the score wasn't followed while hidden
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenUntrackedRef.current = pipWindowRef.current === null;
        return;
      }
      if (!hiddenUntrackedRef.current || !sessionStartedRef.current) return;
      hiddenUntrackedRef.current = false;
      belowSinceRef.current = null;
      distractedSinceRef.current = null;
      setShowHiddenNote(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Release the chime's audio when leaving the page
  useEffect(() => () => {
    audioRef.current?.close();
  }, []);

  // Setup WebSocket connection (the landmark effect above sends on it)
  useEffect(() => {
    if (DEBUG_LOGS) console.log('Attempting to connect to MediaPipe backend:', MEDIAPIPE_API_URL);
    const protocol = MEDIAPIPE_API_URL.startsWith('https://') ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${MEDIAPIPE_API_URL.replace('http://', '').replace('https://', '')}/ws/study`;
    if (DEBUG_LOGS) console.log('WebSocket URL:', wsUrl);
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    setSocketOpen(false);
    setConnectSlow(false);
    const slowTimer = setTimeout(() => setConnectSlow(true), CONNECT_SLOW_MS);

    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      if (DEBUG_LOGS) console.log("Connected to backend Study WebSocket server");
      clearTimeout(slowTimer);
      socket.send(JSON.stringify({ duration }));
      setSocketOpen(true);
    };

    // onmessage receives {score, cheat_events, distracted, gaze} back and drives the live view: status label and
    // reason, focus strip, gaze meter and chime

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (DEBUG_LOGS) console.log('Received from backend:', data);

        // Calibration result (reply to "done"): only matters while the overlay waits for it. Only "ok" starts the
        // session; too_narrow and not_calibrated show Redo / Skip
        if (data.type === 'calibration') {
          // The ranges the backend scores against from now on, for the gaze meter
          if (Array.isArray(data.main)) setScreenRanges({ main: data.main, second: data.second ?? null });
          if (data.status !== 'ok') setCalibrationFailure(data.status);
          setCalibrationStatus((current) =>
            current === 'checking' ? (data.status === 'ok' ? 'done' : 'failed') : current);
          return;
        }

        // The backend's session clock ran out: end the session here too
        if (data.type === 'session_ended') {
          endSessionRef.current();
          return;
        }

        if (data.error) {
          console.warn("Backend error:", data.error);
          return;
        }

        // Scores count only once the session has started (calibration succeeded or was skipped)
        if (!sessionStartedRef.current) return;

        const score = data.score;
        // score < DISTRACTED_BELOW on the backend; cheat_events only say why
        const distracted = data.distracted === true;

        // Debug logging
        if (DEBUG_LOGS) console.log('Focus Score received:', score, 'Type:', typeof score);

        // Live view. gaze is null when there's no face
        const noFace = typeof data.gaze !== 'number';
        setGaze(noFace ? null : data.gaze);
        setCheatEvents(Array.isArray(data.cheat_events) ? data.cheat_events : []);
        const now = Date.now();
        let next = focusStateRef.current;
        if (!distracted) {
          belowSinceRef.current = null;
          distractedSinceRef.current = null;
          chimedRef.current = false;
          next = 'focused';
        } else {
          if (belowSinceRef.current === null) belowSinceRef.current = now;
          if (now - belowSinceRef.current >= LABEL_DEBOUNCE_MS) next = noFace ? 'away' : 'distracted';
          distractedSinceRef.current = noFace ? null : (distractedSinceRef.current ?? now);
          if (audioRef.current && !chimedRef.current && distractedSinceRef.current !== null
              && now - distractedSinceRef.current >= CHIME_AFTER_MS) {
            chimedRef.current = true;
            playChime(audioRef.current);
          }
        }
        focusStateRef.current = next;
        setFocusState(next);
      } catch (err) {
        console.error("Failed to parse message:", err);
        console.error("Raw message:", event.data);
      }
    };

    // Both handlers ignore an old socket (StrictMode's first mount in dev), so it can't mark the live one as lost
    socket.onerror = (err) => {
      if (socketRef.current !== socket) return;
      console.error("WebSocket error:", err);
      console.error("Is MediaPipe backend running on", MEDIAPIPE_API_URL, "?");
    };

    socket.onclose = (event) => {
      if (socketRef.current !== socket) return;
      if (DEBUG_LOGS) console.log("WebSocket connection closed. Code:", event.code, "Reason:", event.reason);
      clearTimeout(slowTimer);
      setSocketOpen(false);
      setBackendLost(true);
      // No more scores: the strip stops drawing the last state
      focusStateRef.current = null;
    };

    return () => {
      clearTimeout(slowTimer);
      if (socketRef.current) socketRef.current.close();
    };
  }, [duration, MEDIAPIPE_API_URL]);

  // Sends a calibration message. Returns false, sending nothing, unless the websocket is open
  const sendCalibration = useCallback((phase: string, extra: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: 'calibration', phase, ...extra }));
    return true;
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

  // No reply to "done" in time: a failure, since the backend only starts its session clock on a success it replied to
  useEffect(() => {
    if (calibrationStatus !== 'checking') return;
    const timer = setTimeout(() => {
      setCalibrationFailure('no_reply');
      setCalibrationStatus((current) => current === 'checking' ? 'failed' : current);
    }, CALIBRATION_REPLY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [calibrationStatus]);

  // The session starts: from here on scores count
  useEffect(() => {
    if (!sessionStarted) return;
    sessionStartedRef.current = true;
  }, [sessionStarted]);

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
    if (!socketOpen) return;
    cancelCalibration();
    enterFullscreen();
    runCalibration();
  };

  const skipCalibration = () => {
    // The backend drops any samples, keeps the default range, and starts its session clock with ours. If it can't
    // be told (socket not open), the session must not start either
    if (!sendCalibration('done', { skipped: true })) return;
    cancelCalibration();
    setCalibrationView(IDLE_VIEW);
    setCalibrationStatus('done');
  };

  const answerSecondScreen = (yes: boolean) => secondScreenAnswerRef.current?.(yes);

const handleEndSession = () => {
    if (DEBUG_LOGS) console.log("Ending Study Session...");
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
    
    // Stop webcam
    (video.srcObject as MediaStream | null)?.getTracks().forEach((track) => track.stop());

    pipWindowRef.current?.close();
    navigate("/summary");
  };

  // The session timer and the websocket are set up once, so they end the session through this ref rather than
  // keeping the handleEndSession from the render they were set up in
  const endSessionRef = useRef(handleEndSession);
  endSessionRef.current = handleEndSession;

  const toggleCamera = () => {
    const hidden = !hideCamera;
    setHideCamera(hidden);
    try {
      localStorage.setItem(HIDE_CAMERA_KEY, hidden ? '1' : '0');
    } catch {
      // Storage unavailable: the choice lasts until the page is left
    }
  };

  const toggleChime = () => {
    if (audioRef.current) {
      audioRef.current.close();
      audioRef.current = null;
      setChimeOn(false);
    } else {
      audioRef.current = new AudioContext();
      setChimeOn(true);
    }
  };

  // Pop out: the status, countdown, strip, camera and End move into a small always-on-top window, which keeps face
  // tracking at full rate while this tab is hidden (see pipWindow). Closing it brings them back here; the session
  // keeps going
  const popOut = async () => {
    try {
      setPipShowCamera(false);
      pipCameraShownRef.current = false;
      const pip = await openPipWindow(PIP_SIZE.width, PIP_SIZE.height);
      pip.addEventListener('pagehide', () => {
        // Closed while the tab is hidden: tracking lapses from here, as without the pop-out window
        if (document.visibilityState === 'hidden') hiddenUntrackedRef.current = true;
        setPipWindow(null);
      }, { once: true });
      setPipWindow(pip);
    } catch (err) {
      console.error('Pop out failed:', err);
    }
  };

  // Leaving the page closes the pop-out window
  useEffect(() => () => pipWindowRef.current?.close(), []);

  // Keeps the pop-out window fitted to its content, so it has no empty space: the width by the thumbnail's when
  // Show camera turns it on or off, and the height to the content's if that differs from the window's. The window
  // is only ever resized by these differences, so a size the user chose stays. Resizing needs a user gesture in the
  // pop-out window: the Show camera click has one; a window that was just opened doesn't, but it opened at the right
  // size
  useEffect(() => {
    const content = pipContentRef.current;
    if (!pipWindow || !content) return;
    const widthChange = pipShowCamera === pipCameraShownRef.current ? 0
      : (pipShowCamera ? 1 : -1) * (PIP_THUMB_WIDTH + PIP_THUMB_GAP);
    pipCameraShownRef.current = pipShowCamera;
    const heightChange = content.offsetHeight - pipWindow.innerHeight;
    if (widthChange === 0 && Math.abs(heightChange) <= 1) return;
    try {
      pipWindow.resizeBy(widthChange, heightChange);
    } catch (err) {
      // NotAllowedError without a user gesture. Must not escape: an error in an effect unmounts the whole page
      console.warn('Pop out window not resized:', err);
    }
  }, [pipWindow, pipShowCamera]);

  const remaining = Math.max(duration * 60 - elapsedTime, 0);
  const connectionLost = sessionStarted && backendLost;
  const status: { label: string; dot: DotState } = connectionLost ? { label: 'Not tracking', dot: 'off' }
    : focusState ? FOCUS_STATES[focusState] : { label: 'Starting', dot: 'off' };
  const reason = focusState === 'distracted' && !connectionLost
    ? [...cheatEvents].sort((a, b) => a - b).map((code) => DISTRACTION_REASONS[code]).filter(Boolean).join(', ')
    : '';

  // Shown on the page, and (except statusBlock's reason line) in the pop-out window while it's open
  const statusLabel = (
    <div role="status" className="flex min-w-0 items-center gap-2 text-base font-medium">
      <StatusDot state={status.dot} />
      <span className="truncate">{status.label}</span>
    </div>
  );
  const statusBlock = (
    <div className="min-w-0">
      {statusLabel}
      <div className="min-h-4 pl-[18px] text-xs text-fg-secondary">{reason}</div>
    </div>
  );
  const endControls = confirmingEnd ? (
    <div className="flex shrink-0 items-center gap-1 text-sm">
      <Button size="sm" onClick={handleEndSession}>End now?</Button>
      <Button variant="text" size="md" className="px-2 py-1" onClick={() => setConfirmingEnd(false)}>
        Keep going
      </Button>
    </div>
  ) : (
    <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setConfirmingEnd(true)}>
      End
    </Button>
  );
  const hideCameraToggle = (
    <Button variant="text" size="sm" aria-pressed={hideCamera} onClick={toggleCamera}>
      Hide camera
    </Button>
  );

  return (
    <div className="min-h-screen bg-page text-fg">
      <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col gap-6 px-4 py-4">
        <header className="flex items-start justify-between gap-3">
          {statusBlock}
          {endControls}
        </header>

        {connectionLost && (
          <Card padding="sm" className="text-sm">
            <div className="font-medium">Connection lost</div>
            <div className="mt-0.5 text-fg-secondary">Focus tracking has stopped for this session.</div>
            <Button size="sm" className="mt-3" onClick={handleEndSession}>See summary</Button>
          </Card>
        )}

        {showHiddenNote && !connectionLost && (
          <Card padding="sm" className="flex items-start gap-3 text-sm text-fg-secondary">
            <p className="flex-1">
              {pipSupported()
                ? 'Tracking paused while this window was hidden. Pop out keeps tracking while you work in other windows.'
                : 'Tracking paused while this window was hidden. Keep it visible beside your work.'}
            </p>
            <button
              onClick={() => setShowHiddenNote(false)}
              aria-label="Dismiss"
              className="-m-1 p-1 text-fg-secondary hover:text-fg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </Card>
        )}

        {pipWindow ? (
          <Card padding="sm" className="text-sm">
            <div className="font-medium">Popped out</div>
            <div className="mt-0.5 text-fg-secondary">
              The session is in the small window, and tracking keeps running while you work in other windows.
            </div>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => pipWindow.close()}>
              Bring back
            </Button>
          </Card>
        ) : (
          <>
            <div className="text-center">
              <div className="text-6xl font-light tabular-nums tracking-tight">{formatClock(remaining)}</div>
              <div className="mt-1 text-sm tabular-nums text-fg-secondary">of {formatClock(duration * 60)}</div>
            </div>

            <FocusStrip runs={strip.runs} from={strip.from} />

            <section
              aria-hidden={hideCamera || undefined}
              className={hideCamera ? HIDDEN_CAMERA_CLASS : 'flex flex-col items-center gap-3'}
            >
              <CameraSlot video={video} className="aspect-[4/3] w-44 overflow-hidden rounded-xl" />
              {!hideCamera && <GazeMeter gaze={gaze} main={screenRanges.main} second={screenRanges.second} />}
            </section>
          </>
        )}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-fg-secondary">
          <span>Video never leaves this device</span>
          <div className="flex gap-4">
            {pipSupported() && !pipWindow && (
              <Button variant="text" size="sm" onClick={popOut}>
                Pop out
              </Button>
            )}
            {hideCameraToggle}
            <Button variant="text" size="sm" aria-pressed={chimeOn} onClick={toggleChime}>
              Chime <span aria-hidden="true">{chimeOn ? 'on' : 'off'}</span>
            </Button>
          </div>
        </footer>
      </div>

      {/* The pop-out window: a compact widget. One row (status, countdown, End) over the thin strip, with the
          camera thumbnail at the left when shown. The content fills the window (see the fit effect above) */}
      {pipWindow && createPortal(
        <div className="flex h-screen items-center">
          <div ref={pipContentRef} className="flex w-full items-center gap-3 p-3.5">
            <CameraSlot
              video={video}
              className={pipShowCamera
                ? 'h-12 w-16 shrink-0 overflow-hidden rounded-md'
                : HIDDEN_CAMERA_CLASS}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex min-h-8 items-center gap-3">
                {statusLabel}
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  {/* Room for the End confirmation */}
                  {!confirmingEnd && (
                    <span className="text-2xl font-light leading-8 tabular-nums tracking-tight">
                      {formatClock(remaining)}
                    </span>
                  )}
                  {endControls}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FocusStrip runs={strip.runs} from={strip.from} compact />
                <Button
                  variant="text"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  aria-pressed={pipShowCamera}
                  onClick={() => setPipShowCamera((shown) => !shown)}
                >
                  Show camera
                </Button>
              </div>
            </div>
          </div>
        </div>,
        pipWindow.document.body,
      )}

      {/* Calibration overlay: covers the session until calibration is done or skipped */}
      {calibrationStatus !== 'done' && (
        <div className="fixed inset-0 z-[60] bg-page/95 backdrop-blur-sm">
          {calibrationView.dot !== 'none' && <ScanDot moving={calibrationView.dot === 'moving'} />}

          <div className="absolute inset-x-0 top-1/4 px-6 text-center">
            <div className="text-sm text-accent font-medium mb-2">Screen calibration</div>
            <div className="text-2xl text-fg font-semibold">
              {calibrationStatus === 'waiting'
                ? (cameraError || modelError
                  ? "Face tracking isn't available"
                  : faceSeen ? 'Calibrate to your screen' : 'Looking for your face...')
                : calibrationStatus === 'failed'
                  ? calibrationFailure && CALIBRATION_FAILURE_MESSAGES[calibrationFailure]
                  : calibrationView.prompt}
            </div>
            {!socketOpen && !backendLost && (
              <div role="status" className="mt-2 text-fg-secondary">
                <div>Connecting to server…</div>
                {connectSlow && <div>The server may be waking up, this can take up to a minute.</div>}
              </div>
            )}
            {calibrationStatus === 'waiting' && (
              <>
                <div className="mt-2 text-fg-secondary">
                  The page goes full screen while you follow a dot with your eyes.
                </div>
                <Button onClick={startCalibration} disabled={!faceSeen || !socketOpen} className="mt-8">
                  Start calibration
                </Button>
              </>
            )}
            {calibrationStatus === 'failed' && (
              <div className="mt-2 text-fg-secondary">
                Redo the calibration, or skip to start the session with a default screen range.
              </div>
            )}
            {(cameraError || modelError || backendLost) && (
              <div className="mt-6 mx-auto max-w-md space-y-2 text-sm text-fg">
                {cameraError && (
                  <div className="bg-distracted/10 border border-distracted/50 rounded-xl px-4 py-3">
                    The camera isn't available. Allow camera access for this site, then reload the page.
                  </div>
                )}
                {modelError && (
                  <div className="bg-distracted/10 border border-distracted/50 rounded-xl px-4 py-3">
                    The face tracking model didn't load. Check your internet connection, then reload the page.
                  </div>
                )}
                {backendLost && (
                  <div className="bg-distracted/10 border border-distracted/50 rounded-xl px-4 py-3">
                    Can't reach the FocusAgent server, so this session can't be tracked. Reload the page to try again.
                  </div>
                )}
              </div>
            )}
            {calibrationView.countdown !== null && (
              <div className="mt-6 text-6xl text-accent font-bold">{calibrationView.countdown}</div>
            )}
            {calibrationView.recording && (
              <div className="mt-6 inline-flex items-center space-x-2 text-distracted text-sm font-medium">
                <span className="w-2 h-2 bg-distracted rounded-full animate-pulse"></span>
                <span>Recording</span>
              </div>
            )}
          </div>

          {calibrationView.asking && (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-4 px-6">
              <Button onClick={() => answerSecondScreen(true)}>
                Yes
              </Button>
              <Button variant="secondary" onClick={() => answerSecondScreen(false)}>
                No
              </Button>
            </div>
          )}

          <div className="absolute bottom-8 inset-x-0 flex justify-center gap-6">
            {calibrationStatus !== 'waiting' && (
              <Button variant={calibrationStatus === 'failed' ? 'primary' : 'text'} onClick={startCalibration}
                disabled={!socketOpen}>
                Redo calibration
              </Button>
            )}
            {calibrationStatus !== 'checking' && (
              <Button variant="text" onClick={skipCalibration} disabled={!socketOpen}>
                Skip
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Session;