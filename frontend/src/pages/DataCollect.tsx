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

export default function DataCollect() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [label, setLabel] = useState<Label>('unlabeled');
  const labelRef = useRef<Label>('unlabeled');
  const [rows, setRows] = useState<Row[]>([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [status, setStatus] = useState('Requesting camera...');

  // Keep the interval callback in sync with the latest label
  useEffect(() => {
    labelRef.current = label;
  }, [label]);

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

  // Keyboard: 0 = unlabeled (paused), 1 = focused, 2 = distracted
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '0') setLabel('unlabeled');
      else if (e.key === '1') setLabel('focused');
      else if (e.key === '2') setLabel('distracted');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      </p>

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
