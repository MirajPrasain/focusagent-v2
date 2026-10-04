// Pre-recorded voice lines for Session.tsx's calibration, in public/sounds/calibration/<key>.mp3. Each clip keeps the
// text it says: shown on screen, and spoken with text-to-speech instead if the clip fails to load or play, so
// calibration is never silent.
import { speak, speakAndWait } from './speech';

const secondScreenPoint = (label: string) =>
  `Look at the ${label} of your second screen. Keep looking until you hear 'okay'.`;

const CLIPS = {
  'follow-dot': 'Follow the dot with your eyes.',
  'count-3': '3',
  'count-2': '2',
  'count-1': '1',
  'okay': 'Okay',
  'second-screen-question': 'Do you use a second screen?',
  'second-screen-top-left': secondScreenPoint('top left corner'),
  'second-screen-top-right': secondScreenPoint('top right corner'),
  'second-screen-bottom-right': secondScreenPoint('bottom right corner'),
  'second-screen-bottom-left': secondScreenPoint('bottom left corner'),
  'second-screen-center': secondScreenPoint('center'),
};

export type ClipKey = keyof typeof CLIPS;

export const clipText = (key: ClipKey) => CLIPS[key];

const clipUrl = (key: ClipKey) => `${import.meta.env.BASE_URL}sounds/calibration/${key}.mp3`;

// Some clips might never fire ended; don't let a caller wait forever (as in speakAndWait)
const CLIP_TIMEOUT_MS = 8000;

// The clip playing now, and how to release whoever waits on it
let current: { audio: HTMLAudioElement; finish: () => void } | null = null;

// Stops and rewinds the clip playing now, if any. A caller waiting on it resolves, and it doesn't fall back to speech
export const stopClip = () => {
  if (!current) return;
  const { audio, finish } = current;
  current = null;
  audio.pause();
  audio.currentTime = 0;
  finish();
};

// Plays a clip, stopping anything already playing first so audio never lags behind what's on screen. Resolves when
// it has ended (or was stopped, or timed out); a clip that can't load or play speaks its text instead
const startClip = (key: ClipKey, wait: boolean) =>
  new Promise<void>((resolve) => {
    stopClip();
    window.speechSynthesis?.cancel(); // a previous clip's fallback speech
    const audio = new Audio(clipUrl(key));
    const timeout = wait ? setTimeout(resolve, CLIP_TIMEOUT_MS) : undefined;
    const clip = {
      audio,
      finish: () => {
        clearTimeout(timeout);
        resolve();
      },
    };
    current = clip;
    audio.onended = () => {
      if (current === clip) current = null;
      clip.finish();
    };
    const fallBack = () => {
      if (current !== clip) return; // stopped or replaced: stay silent
      current = null;
      clearTimeout(timeout);
      if (wait) speakAndWait(CLIPS[key]).then(resolve);
      else {
        speak(CLIPS[key]);
        resolve();
      }
    };
    audio.onerror = fallBack;
    audio.play().catch(fallBack);
  });

// Like speak(): fire and forget
export const playClip = (key: ClipKey) => {
  startClip(key, false);
};

// Like speakAndWait(): resolves when the clip has finished (or was stopped, or after CLIP_TIMEOUT_MS)
export const playClipAndWait = (key: ClipKey) => startClip(key, true);
