import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import PageShell from '../components/ui/PageShell';
import StatusDot from '../components/ui/StatusDot';

const PRESET_MINUTES = [25, 50, 90];
const DEFAULT_MINUTES = 25;
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
// The last valid session length chosen here
const DURATION_KEY = 'focusagent.duration';

// A whole number of minutes in range, else NaN
function parseMinutes(text: string) {
  const minutes = /^\d+$/.test(text.trim()) ? Number(text) : NaN;
  return minutes >= MIN_MINUTES && minutes <= MAX_MINUTES ? minutes : NaN;
}

function loadMinutes() {
  try {
    const minutes = parseMinutes(localStorage.getItem(DURATION_KEY) ?? '');
    return Number.isNaN(minutes) ? DEFAULT_MINUTES : minutes;
  } catch {
    return DEFAULT_MINUTES;
  }
}

type CameraState = 'checking' | 'ready' | 'blocked' | 'missing' | 'in_use' | 'unsupported' | 'failed';

const CAMERA_MESSAGES: Record<CameraState, string> = {
  checking: 'Checking your camera...',
  ready: 'Camera ready',
  blocked: "Camera access is blocked. Allow it for this site in your browser's address bar, then try again.",
  missing: 'No camera found. Connect a camera, then try again.',
  in_use: 'Your camera is in use by another app. Close that app, then try again.',
  unsupported: "This browser can't open the camera here. Use a current Chrome, Edge, Firefox or Safari.",
  failed: "The camera couldn't start. Check that it's connected, then try again.",
};

// getUserMedia's error names -> what to tell the user
function cameraErrorState(err: unknown): CameraState {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in_use';
  return 'failed';
}

const Setup = () => {
  const navigate = useNavigate();

  const [initialMinutes] = useState(loadMinutes);
  // A preset's minutes, or 'custom' for the typed-in field
  const [choice, setChoice] = useState<number | 'custom'>(
    PRESET_MINUTES.includes(initialMinutes) ? initialMinutes : 'custom');
  const [customText, setCustomText] = useState(PRESET_MINUTES.includes(initialMinutes) ? '' : String(initialMinutes));
  const minutes = choice === 'custom' ? parseMinutes(customText) : choice;
  const minutesValid = !Number.isNaN(minutes);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>('checking');
  const [cameraAttempt, setCameraAttempt] = useState(0); // bumped by "Try again"

  useEffect(() => {
    if (!minutesValid) return;
    try {
      localStorage.setItem(DURATION_KEY, String(minutes));
    } catch {
      // Storage unavailable: the choice isn't remembered
    }
  }, [minutes, minutesValid]);

  // Open the camera for the preview, and release it when the page is left so the Session page can open it
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('unsupported');
      return;
    }
    let stream: MediaStream | null = null;
    let unmounted = false;
    setCamera('checking');
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((s) => {
        // Arrived after the page was left (or after StrictMode's first mount in dev): release it right away
        if (unmounted) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamera('ready');
      })
      .catch((err) => {
        console.error('Camera access error:', err);
        if (!unmounted) setCamera(cameraErrorState(err));
      });
    return () => {
      unmounted = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraAttempt]);

  const cameraProblem = camera !== 'checking' && camera !== 'ready';

  return (
    <PageShell>
      <section className="mt-8">
        <h1 className="text-lg font-semibold">How long?</h1>
        <div className="mt-3 flex gap-2" role="group" aria-label="Session length">
          {PRESET_MINUTES.map((preset) => (
            <Button
              key={preset}
              variant="secondary"
              className="flex-1 px-0"
              aria-pressed={choice === preset}
              onClick={() => setChoice(preset)}
            >
              {preset} min
            </Button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-fg-secondary">
          Custom
          <input
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            placeholder="1–180"
            value={customText}
            onFocus={() => setChoice('custom')}
            onChange={(e) => {
              setChoice('custom');
              setCustomText(e.target.value);
            }}
            aria-invalid={choice === 'custom' && !minutesValid}
            className={`w-24 rounded-lg border bg-page px-3 py-2 text-fg placeholder:text-fg-muted focus:outline-none transition-colors ${
              choice === 'custom' ? 'border-accent' : 'border-border'}`}
          />
          min
        </label>
        {choice === 'custom' && !minutesValid && (
          <p className="mt-1.5 text-xs text-distracted">Enter a whole number of minutes from 1 to 180.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Camera check</h2>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="mt-3 aspect-[4/3] w-40 -scale-x-100 rounded-xl bg-surface object-cover"
          aria-label="Your camera preview"
        />
        <div role="status" className="mt-3 flex items-start gap-2 text-sm">
          <span className="mt-1.5">
            <StatusDot state={camera === 'ready' ? 'focused' : cameraProblem ? 'distracted' : 'off'} size="sm" />
          </span>
          <span className={camera === 'ready' ? 'text-fg' : 'text-fg-secondary'}>{CAMERA_MESSAGES[camera]}</span>
        </div>
        {cameraProblem && camera !== 'unsupported' && (
          <Button variant="text" className="mt-1 ml-4" onClick={() => setCameraAttempt((n) => n + 1)}>
            Try again
          </Button>
        )}
      </section>

      <p className="mt-8 text-sm text-fg-muted">Video never leaves your device.</p>

      <Button
        className="mt-4 w-full"
        disabled={camera !== 'ready' || !minutesValid}
        onClick={() => navigate(`/session?duration=${minutes}`)}
      >
        Continue to calibration
      </Button>
    </PageShell>
  );
};

export default Setup;
