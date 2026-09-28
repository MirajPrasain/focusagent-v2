import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import Button from '../components/ui/Button';
import Eyebrow from '../components/ui/Eyebrow';
import PageShell, { GUTTER } from '../components/ui/PageShell';
import StatusPill from '../components/ui/StatusPill';
import { colors } from '../theme/tokens';

const PRESET_MINUTES = [25, 50, 90];
const PRESET_NAMES: Record<number, string> = { 25: 'Sprint', 50: 'Deep work', 90: 'Long haul' };
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

// The camera chip's short label; CAMERA_MESSAGES says how to fix a problem
const CAMERA_LABELS: Record<CameraState, string> = {
  checking: 'Checking camera...',
  ready: 'Camera ready',
  blocked: 'Camera blocked',
  missing: 'No camera found',
  in_use: 'Camera in use',
  unsupported: 'Camera unavailable',
  failed: "Camera didn't start",
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
    <PageShell
      center={
        <ol className="flex items-center gap-3.5 font-mono text-xs tracking-[0.08em]" aria-label="Steps">
          <li className="text-fg" aria-current="step">01 SETUP</li>
          <li aria-hidden="true" className="h-px w-8 bg-border-strong" />
          <li className="text-fg-muted">02 CALIBRATE</li>
          <li aria-hidden="true" className="h-px w-8 bg-border-strong" />
          <li className="text-fg-muted">03 FOCUS</li>
        </ol>
      }
      actions={
        <Link to="/" className="rounded-md px-1 py-3 text-sm text-fg-secondary transition-colors hover:text-fg">
          Cancel
        </Link>
      }
      footer={
        <>
          <p className="flex items-center gap-2.5 text-sm text-fg-secondary">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Video never leaves your device.
          </p>
          <div className="flex items-center gap-5">
            {minutesValid && (
              <span className="hidden font-mono text-[13px] uppercase text-fg-muted sm:inline">{minutes} min session</span>
            )}
            <Button
              size="lg"
              disabled={camera !== 'ready' || !minutesValid}
              onClick={() => navigate(`/session?duration=${minutes}`)}
            >
              Continue to calibration
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </>
      }
    >
      <div className={`grid flex-1 items-center gap-12 py-12 lg:grid-cols-2 lg:gap-20 xl:px-28 ${GUTTER}`}>
        <section className="animate-fade-up">
          <h1 className="text-5xl font-medium leading-none tracking-[-0.04em] sm:text-6xl">
            Set up your <span className="font-serif font-normal italic text-fg-secondary">session</span>
          </h1>
          <p className="mt-5 max-w-[460px] text-lg leading-relaxed text-fg-secondary">
            Pick how long you’ll work, and check your camera can see you.
          </p>

          <Eyebrow className="mt-12">How long?</Eyebrow>
          <div className="mt-4 grid grid-cols-3 gap-3" role="group" aria-label="Session length">
            {PRESET_MINUTES.map((preset) => {
              const selected = choice === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setChoice(preset)}
                  className={`flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-[22px] ${
                    selected ? 'border-accent bg-accent/[0.07]' : 'border-border bg-surface hover:border-border-strong'}`}
                >
                  <span className="text-4xl font-light leading-none tracking-[-0.04em] tabular-nums sm:text-[52px]">
                    {preset}
                    <span className={`ml-1.5 text-base tracking-normal ${selected ? 'text-fg-secondary' : 'text-fg-muted'}`}>min</span>
                  </span>
                  <span className={`text-[13px] ${selected ? 'text-accent' : 'text-fg-muted'}`}>{PRESET_NAMES[preset]}</span>
                </button>
              );
            })}
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm text-fg-secondary">
            Custom
            <input
              type="number"
              inputMode="numeric"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              placeholder="—"
              value={customText}
              onFocus={() => setChoice('custom')}
              onChange={(e) => {
                setChoice('custom');
                setCustomText(e.target.value);
              }}
              aria-invalid={choice === 'custom' && !minutesValid}
              className={`h-11 w-[88px] rounded-[10px] border bg-surface px-3.5 font-mono text-[15px] text-fg placeholder:text-fg-muted transition-colors focus:outline-none ${
                choice === 'custom' ? 'border-accent' : 'border-border'}`}
            />
            <span className="font-mono text-[13px] text-fg-muted">min · {MIN_MINUTES}–{MAX_MINUTES}</span>
          </label>
          {choice === 'custom' && !minutesValid && (
            <p className="mt-2 text-xs text-distracted">Enter a whole number of minutes from 1 to 180.</p>
          )}
        </section>

        <section className="flex animate-fade-up flex-col gap-4 [animation-delay:120ms]" aria-label="Camera check">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-border bg-surface">
            {/* Shown until the camera is ready */}
            <svg viewBox="0 0 560 420" fill="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
              <circle cx="280" cy="180" r="72" stroke={colors.border.strong} strokeWidth="1.5" />
              <path d="M130 420c10-90 70-140 150-140s140 50 150 140" stroke={colors.border.strong} strokeWidth="1.5" />
            </svg>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-500 ${
                camera === 'ready' ? 'opacity-100' : 'opacity-0'}`}
              aria-label="Your camera preview"
            />
            <div className="absolute left-4 top-4">
              <StatusPill
                state={camera === 'ready' ? 'focused' : cameraProblem ? 'distracted' : 'off'}
                label={CAMERA_LABELS[camera]}
              />
            </div>
            <div className="absolute inset-x-4 bottom-4 flex justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-fg-secondary">
              <span>Mirrored preview</span>
              <span>Not recorded</span>
            </div>
          </div>
          <div role="status" className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {cameraProblem && <p className="text-sm text-fg-secondary">{CAMERA_MESSAGES[camera]}</p>}
            {cameraProblem && camera !== 'unsupported' && (
              <Button variant="secondary" onClick={() => setCameraAttempt((n) => n + 1)}>
                Try again
              </Button>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
};

export default Setup;
