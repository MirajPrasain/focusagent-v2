// Web Speech API text-to-speech, shared by DataCollect.tsx (guided script) and Session.tsx (calibration).
// Cancel anything queued first, so speech never lags behind what's on screen.
export const speak = (text: string) => {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  synth.speak(new SpeechSynthesisUtterance(text));
};

// Some browsers occasionally never fire onend; don't let a caller wait forever
const SPEECH_TIMEOUT_MS = 8000;

// Like speak(), but resolves when the utterance has finished (or was cancelled, or speech is unavailable)
export const speakAndWait = (text: string) =>
  new Promise<void>((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const timeout = setTimeout(resolve, SPEECH_TIMEOUT_MS);
    utterance.onend = utterance.onerror = () => {
      clearTimeout(timeout);
      resolve();
    };
    synth.speak(utterance);
  });

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
