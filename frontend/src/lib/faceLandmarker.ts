import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// CDN URLs from the official @mediapipe/tasks-vision README
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Give up on loading the model after this many failed attempts; every later call then fails straight away
const MAX_LOAD_ATTEMPTS = 3;

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let loadFailures = 0;

// True once the model has failed to load MAX_LOAD_ATTEMPTS times
export const faceModelFailed = () => loadFailures >= MAX_LOAD_ATTEMPTS;

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        numFaces: 2, // so the backend can flag a second face (faceCount > 1)
      });
    })();
    // Allow a retry on the next call if initialization failed, up to MAX_LOAD_ATTEMPTS. This runs before any
    // caller's own rejection handler, so faceModelFailed() is already up to date when a caller sees the error
    landmarkerPromise.catch(() => {
      loadFailures += 1;
      if (!faceModelFailed()) landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

// timestampMs must increase monotonically across calls in VIDEO mode
export async function detectFaces(video: HTMLVideoElement, timestampMs: number ):  Promise<FaceLandmarkerResult>
 {
  const landmarker = await getFaceLandmarker(); //unwrapping the  Promise<FaceLandmarker> 
  return landmarker.detectForVideo(video, timestampMs);
}
