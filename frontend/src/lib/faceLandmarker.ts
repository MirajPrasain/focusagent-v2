import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// CDN URLs from the official @mediapipe/tasks-vision README
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

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
    // Allow a retry on the next call if initialization failed
    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
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
