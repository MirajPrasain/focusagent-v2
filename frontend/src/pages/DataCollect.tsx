import { useEffect, useRef, useState } from 'react'
import { detectFaces } from '../lib/faceLandmarker'

// TEMP dev tool: collect labeled blendshape rows for focus/distraction training data.
// Browser-only — no websocket or backend calls. Not linked from nav; open /data-collect directly.

type Label = 'unlabeled' | 'focused' | 'distracted';

const BLENDSHAPE_NAMES = [
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookUpLeft', 'eyeLookUpRight',
  'eyeLookInLeft', 'eyeLookInRight',
  'eyeLookOutLeft', 'eyeLookOutRight',
] as const;

type Row = { timestamp: number; label: Exclude<Label, 'unlabeled'>; scores: number[] };

const LABEL_COLORS: Record<Label, string> = {
  unlabeled: 'text-gray-400',
  focused: 'text-green-400',
  distracted: 'text-red-400',
};

// Guided mode: fixed script of poses, auto-advancing. 'pause' means unlabeled (nothing recorded).
type GuidedStep = { label: 'focused' | 'distracted' | 'pause'; instruction: string; duration: number };

const GUIDED_STEPS: GuidedStep[] = [
  { label: 'focused', instruction: "Sit normally, eyes on screen like you're reading", duration: 12 },
  { label: 'pause', instruction: 'Relax, reposition', duration: 3 },
  { label: 'distracted', instruction: 'Look away to your left', duration: 12 },
  { label: 'pause', instruction: 'Reposition', duration: 3 },
  { label: 'focused', instruction: 'Hands on keyboard, typing motion, eyes on screen', duration: 12 },
  { label: 'pause', instruction: 'Reposition', duration: 3 },
  { label: 'distracted', instruction: 'Look down, like checking your phone', duration: 12 },
  { label: 'pause', instruction: 'Reposition', duration: 3 },
  { label: 'focused', instruction: 'Lean in slightly, reading intently', duration: 12 },
  { label: 'pause', instruction: 'Reposition', duration: 3 },
  { label: 'distracted', instruction: 'Close your eyes', duration: 12 },
  { label: 'pause', instruction: 'Reposition', duration: 3 },
  { label: 'focused', instruction: 'Lean back a bit, still looking at the screen', duration: 12 },
  { label: 'pause', instruction: 'Reposition', duration: 3 },
  { label: 'distracted', instruction: 'Turn your head fully to one side', duration: 12 },
  { label: 'pause', instruction: 'Reposition', duration: 3 },
  { label: 'distracted', instruction: 'Look away to your right', duration: 12 },
];

// Speak the last N seconds of each step out loud, so you can keep your eyes off the screen.
const VOICE_COUNTDOWN_FROM = 5;

// Cancel anything queued first, so speech never lags behind the on-screen countdown.
const speak = (text: string) => {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  synth.speak(new SpeechSynthesisUtterance(text));
};

export default function DataCollect() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [label, setLabel] = useState<Label>('unlabeled');
  const labelRef = useRef<Label>('unlabeled');
  const [rows, setRows] = useState<Row[]>([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [status, setStatus] = useState('Requesting camera...');

  // Guided session state: stepIndex is null when no session is running
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const remainingRef = useRef(0);
  const rowCountRef = useRef(0);
  const sessionStartRows = useRef(0);
  const guidedRunning = stepIndex !== null;

  // Keep the interval callback in sync with the latest label
  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  // Keep a ref of the row count so the guided session can report rows added
  useEffect(() => {
    rowCountRef.current = rows.length;
  }, [rows.length]);

  // Start webcam stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setStatus('Camera Active');
      })
      .catch((err) => {
        console.error('Camera access error:', err);
        setStatus('Camera access denied');
      });
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  // Keyboard: 0 = unlabeled (paused), 1 = focused, 2 = distracted. Ignored during a guided session.
  useEffect(() => {
    if (guidedRunning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '0') setLabel('unlabeled');
      else if (e.key === '1') setLabel('focused');
      else if (e.key === '2') setLabel('distracted');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guidedRunning]);

  // Drive the label from the guided script, advancing when each step's duration elapses
  useEffect(() => {
    if (stepIndex === null) return;
    const step = GUIDED_STEPS[stepIndex];
    setLabel(step.label === 'pause' ? 'unlabeled' : step.label);
    setRemaining(step.duration);
    remainingRef.current = step.duration;
    speak(step.instruction);

    // One tick updates the displayed number and speaks it, so the two can't drift apart.
    const tick = setInterval(() => {
      const next = Math.max(0, remainingRef.current - 1);
      remainingRef.current = next;
      setRemaining(next);
      if (next > 0 && next <= VOICE_COUNTDOWN_FROM) speak(String(next));
    }, 1000);
    const advance = setTimeout(() => {
      if (stepIndex + 1 < GUIDED_STEPS.length) {
        setStepIndex(stepIndex + 1);
      } else {
        setStepIndex(null);
        setLabel('unlabeled');
        setCompletedCount(rowCountRef.current - sessionStartRows.current);
      }
    }, step.duration * 1000);

    return () => {
      clearInterval(tick);
      clearTimeout(advance);
      window.speechSynthesis?.cancel();
    };
  }, [stepIndex]);

  // Announced from its own effect so the step effect's cleanup can't cancel it
  useEffect(() => {
    if (completedCount !== null) speak('Guided session complete');
  }, [completedCount]);

  const startGuided = () => {
    sessionStartRows.current = rows.length;
    setCompletedCount(null);
    setStepIndex(0);
  };

  const stopGuided = () => {
    setStepIndex(null);
    setLabel('unlabeled');
  };

  // Run FaceLandmarker every 200ms and record a row when labeled + face detected
  useEffect(() => {
    let busy = false;
    let lastTimestamp = -1;

    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (busy || !video || video.readyState < 2 || video.videoWidth === 0) return;

      const timestamp = performance.now();
      if (timestamp <= lastTimestamp) return;
      lastTimestamp = timestamp;

      busy = true;
      try {
        const result = await detectFaces(video, timestamp);
        const blendshapes = result.faceBlendshapes[0]?.categories;
        setFaceDetected(!!blendshapes);

        const current = labelRef.current;
        if (current === 'unlabeled' || !blendshapes) return;

        const score = (name: string) => blendshapes.find((c) => c.categoryName === name)?.score ?? 0;
        const row: Row = {
          timestamp: Date.now(),
          label: current,
          scores: BLENDSHAPE_NAMES.map(score),
        };
        setRows((prev) => [...prev, row]);
      } catch (err) {
        console.error('[DataCollect] detection error:', err);
      } finally {
        busy = false;
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const downloadCsv = () => {
    const header = ['timestamp', 'label', ...BLENDSHAPE_NAMES].join(',');
    const lines = rows.map((r) => [r.timestamp, r.label, ...r.scores].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-data-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const focusedCount = rows.filter((r) => r.label === 'focused').length;
  const distractedCount = rows.length - focusedCount;

  return (
    <div className="min-h-screen p-6 flex flex-col items-center gap-4">
      <h1 className="text-xl font-semibold">Data Collection (dev tool)</h1>
      <p className="text-sm text-gray-400">
        Press <kbd className="px-1 bg-gray-700 rounded">0</kbd> = pause,{' '}
        <kbd className="px-1 bg-gray-700 rounded">1</kbd> = focused,{' '}
        <kbd className="px-1 bg-gray-700 rounded">2</kbd> = distracted · {status} ·{' '}
        {faceDetected ? 'Face detected' : 'No face'}
        {guidedRunning && ' · keys disabled during guided session'}
      </p>

      {stepIndex !== null && (
        <div className="flex flex-col items-center gap-1">
          <div className="text-sm text-gray-400">
            Step {stepIndex + 1} of {GUIDED_STEPS.length}
          </div>
          <div className="text-3xl font-semibold text-center max-w-2xl">
            {GUIDED_STEPS[stepIndex].instruction}
          </div>
          <div className="text-lg text-gray-300">{remaining}s remaining</div>
        </div>
      )}

      {completedCount !== null && (
        <div className="text-lg text-green-400">
          Guided session complete — {completedCount} rows recorded
        </div>
      )}

      <div className={`text-6xl font-bold uppercase ${LABEL_COLORS[label]}`}>
        {label === 'unlabeled' ? 'paused' : label}
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full max-w-2xl rounded-lg bg-black"
      />

      <div className="flex gap-6 text-lg">
        <span className="text-green-400">Focused: {focusedCount}</span>
        <span className="text-red-400">Distracted: {distractedCount}</span>
        <span className="text-gray-300">Total: {rows.length}</span>
      </div>

      <div className="flex gap-3">
        {guidedRunning ? (
          <button
            onClick={stopGuided}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={startGuided}
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-500"
          >
            Start Guided Session
          </button>
        )}
        <button
          onClick={downloadCsv}
          disabled={rows.length === 0}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
        >
          Download CSV
        </button>
        <button
          onClick={() => setRows([])}
          className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
