// Web Speech API text-to-speech, shared by DataCollect.tsx (guided script) and Session.tsx (calibration).
// Cancel anything queued first, so speech never lags behind what's on screen.
export const speak = (text: string) => {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  synth.speak(new SpeechSynthesisUtterance(text));
};
