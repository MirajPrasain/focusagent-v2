import { useRef, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Square, RotateCcw } from 'lucide-react';
import FocusAgentMessage from '../components/FocusAgentMessage'
import MicroNudge from '../components/MicroNudge'
import axios from "axios"; 

type VibeType = 'calm' | 'beast' | 'gamified';

interface DistractionEvent {
  timestamp: number;
  type: string;
  count: number;
}

interface NudgeData {
  type: 'breathing' | 'posture' | 'stretch';
  message: string;
}

function Session() {
  const [searchParams] = useSearchParams();
  const duration = parseInt(searchParams.get("duration") || "25");
  const goal = decodeURIComponent(searchParams.get("goal") || "");
  const vibe = (searchParams.get("vibe") || "calm") as VibeType;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState("--");
  const [focusScore, setFocusScore] = useState<number | null>(null);
  const [distraction, setDistraction] = useState(false);
  const [sessionProgress, setSessionProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [backendConnected, setBackendConnected] = useState(false);
  const navigate = useNavigate();

  const [aiMessage, setAiMessage] = useState("")
  const [currentNudge, setCurrentNudge] = useState<NudgeData | null>(null);
  const [distractionHistory, setDistractionHistory] = useState<DistractionEvent[]>([]);
  const [recentDistractions, setRecentDistractions] = useState(0);

  // API URL - MediaPipe backend for face detection, AI messages, and TTS
  const MEDIAPIPE_API_URL = import.meta.env.VITE_MEDIAPIPE_API_URL || 'http://localhost:8001';

  // Vibe-based styling
  const vibeStyles = {
    calm: {
      accent: 'blue',
      bg: 'from-blue-500/10 to-cyan-500/10',
      glow: 'shadow-blue-500/25',
      border: 'border-blue-500/30',
      text: 'text-blue-300',
      button: 'from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
    },
    beast: {
      accent: 'red',
      bg: 'from-red-500/10 to-orange-500/10',
      glow: 'shadow-red-500/25',
      border: 'border-red-500/30',
      text: 'text-red-300',
      button: 'from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700'
    },
    gamified: {
      accent: 'green',
      bg: 'from-green-500/10 to-emerald-500/10',
      glow: 'shadow-green-500/25',
      border: 'border-green-500/30',
      text: 'text-green-300',
      button: 'from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
    }
  };

  const currentVibe = vibeStyles[vibe] || vibeStyles.calm;

  // Start webcam stream
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStatus("Camera Active");
        }
      })
      .catch((err) => {
        console.error("Camera access error:", err);
        setStatus("Camera access denied");
      });
  }, []);

  // Session timer and progress
  useEffect(() => {
    const startTime = Date.now();
    const totalDurationMs = duration * 60 * 1000;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / totalDurationMs) * 100, 100);
      
      setElapsedTime(Math.floor(elapsed / 1000));
      setSessionProgress(progress);

      if (progress >= 100) {
        clearInterval(timer);
        handleEndSession();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [duration]);
  
const hasPlayed = useRef(false);
const sessionStartTime = useRef(Date.now());
  
useEffect(() => {
  const segments = 4;
  const triggerCount = segments + 1;
  const sessionStart = Date.now();
  const triggerTimeouts: NodeJS.Timeout[] = [];

  for (let i = 0; i < triggerCount; i++) {
    const triggerMs = (i * duration * 60000) / segments;

    const timeout = setTimeout(async () => {
      const minutesPassed = Math.floor((Date.now() - sessionStart) / 60000);

      console.log(`⏰ Triggering AI message at ~${minutesPassed} min`);

      try {
        const aiRes = await axios.get(`${MEDIAPIPE_API_URL}/ai-messages`, {
          params: {
            duration,
            vibe,
            minute: minutesPassed,
            cheat_count: 0,
          }
        });

        setAiMessage(aiRes.data.message || " ");
        hasPlayed.current = false;
      } catch (err) {
        console.error("❌ Failed to fetch AI message:", err);
      }
    }, triggerMs);

    triggerTimeouts.push(timeout);
  }

  return () => {
    triggerTimeouts.forEach(clearTimeout);
  };
}, [duration, vibe, MEDIAPIPE_API_URL]);

// TTS using backend API
useEffect(() => {
  console.log("📣 TTS useEffect triggered");
  
  if (!aiMessage || hasPlayed.current) {
    console.log("⏸ Skipping TTS:", { aiMessage, hasPlayed: hasPlayed.current });
    return;
  }

  const cleanText = aiMessage.replace(/[*_`~>#]/g, '').trim();

  const playTTS = async () => {
    try {
      console.log("🎵 Calling backend TTS API...");
      
      const response = await axios.post(`${MEDIAPIPE_API_URL}/session/api/tts`, {
        text: cleanText,
        vibe: vibe
      }, {
        responseType: 'blob', // Important: Tell axios to expect binary data
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Create audio from blob response
      const audioBlob = response.data;
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        console.log("🎵 Audio playback completed");
      };

      audio.onerror = (err) => {
        URL.revokeObjectURL(audioUrl);
        console.error("🛑 Audio playback error:", err);
      };

      await audio.play();
      hasPlayed.current = true;
      console.log("🎵 TTS audio played successfully");
      
    } catch (err) {
      console.error("🛑 Backend TTS error:", err);
      
      // Log more details about the error
      if (axios.isAxiosError(err) && err.response) {
        console.error("Response status:", err.response.status);
        console.error("Response data:", err.response.data);
      }
    }
  };

  playTTS();
}, [aiMessage, vibe, MEDIAPIPE_API_URL]);

// Track distractions and trigger micro-nudges
useEffect(() => {
  if (!distraction) {
    setRecentDistractions(0);
    return;
  }

  setRecentDistractions(prev => prev + 1);

  // Track distraction event
  const now = Date.now();
  setDistractionHistory(prev => [...prev, {
    timestamp: now,
    type: 'distraction',
    count: recentDistractions + 1
  }]);

  // Trigger nudge after 3 consecutive distractions within 2 minutes
  const twoMinutesAgo = now - 2 * 60 * 1000;
  const recentEvents = distractionHistory.filter(e => e.timestamp > twoMinutesAgo);
  
  if (recentEvents.length >= 2 && !currentNudge) {
    fetchPersonalizedNudge();
  }
}, [distraction]);

// Local nudges only; the Gemini micro-nudge endpoint lived on the retired Express server
const fetchPersonalizedNudge = () => {
  const defaultNudges: NudgeData[] = [
    { type: 'breathing', message: 'Take a deep breath. Inhale for 4, hold for 4, exhale for 4.' },
    { type: 'posture', message: 'Sit up straight. Roll your shoulders back and relax.' },
    { type: 'stretch', message: 'Stand up and stretch for 30 seconds. Your body will thank you!' }
  ];
  setCurrentNudge(defaultNudges[Math.floor(Math.random() * defaultNudges.length)]);
};
  
  // Setup WebSocket connection and frame sending
  useEffect(() => {
    console.log('🔌 Attempting to connect to MediaPipe backend:', MEDIAPIPE_API_URL);
    const protocol = MEDIAPIPE_API_URL.startsWith('https://') ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${MEDIAPIPE_API_URL.replace('http://', '').replace('https://', '')}/ws/study`;
    console.log('🔌 WebSocket URL:', wsUrl);
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("✅ Connected to backend Study WebSocket server");
      socket.send(JSON.stringify({ duration }));
      setStatus("Connected");
      setBackendConnected(true);

      frameIntervalRef.current = setInterval(() => {
        if (
          socket.readyState === WebSocket.OPEN &&
          videoRef.current &&
          canvasRef.current
        ) {
          const video = videoRef.current as HTMLVideoElement;
          const canvas = canvasRef.current as HTMLCanvasElement;

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // ✅ Send as Blob (binary), not DataURL
          canvas.toBlob((blob) => {
            if (blob && socket.readyState === WebSocket.OPEN) {
              socket.send(blob);
            }
          }, "image/jpeg", 0.8);
        }
      }, 200);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📊 Received from backend:', data);

        if (data.error) {
          const errorMessages: Record<string, string> = {
            invalid_json: "Invalid session data, please reconnect...",
            duration_error: "Session duration error, please reconnect...",
            frame_processing_failed: "Frame processing issue, retrying...",
            websocket_error: "Connection issue, retrying...",
          };
          setStatus(errorMessages[data.error] || `Backend error: ${data.error}`);
          return;
        }

        const score = data.score;
        const cheatEvents = data.cheat_events;

        // Debug logging
        console.log('Focus Score received:', score, 'Type:', typeof score);
        
        // Handle score
        if (typeof score === 'number') {
          setFocusScore(score);
          if (score === 0) {
            console.warn('⚠️ Score is 0 - Check if face is visible and well-lit');
          }
        } else {
          console.warn('⚠️ No score in response:', data);
          setFocusScore(null);
        }
        
        setDistraction(cheatEvents && cheatEvents.length > 0);

        const message = cheatEvents && cheatEvents.length > 0
          ? `Focus Score: ${score} (Distraction detected)`
          : `Focus Score: ${score || 'Processing...'}`;

        setStatus(message);
      } catch (err) {
        console.error("Failed to parse message:", err);
        console.error("Raw message:", event.data);
        setStatus(`Parse Error: ${event.data}`);
      }
    };

    socket.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      console.error("Is MediaPipe backend running on", MEDIAPIPE_API_URL, "?");
      setStatus("⚠️ Connection Error - Check if backend is running");
      setBackendConnected(false);
    };

    socket.onclose = (event) => {
      console.log("🔌 WebSocket connection closed. Code:", event.code, "Reason:", event.reason);
      setStatus("Disconnected - Backend may not be running");
      setBackendConnected(false);
    };

    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [duration, MEDIAPIPE_API_URL]);

const handleEndSession = () => {
    console.log("🚀 Ending Study Session...");
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
    
    // Stop webcam
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track: MediaStreamTrack) => track.stop());
    }

    localStorage.setItem("lastSession", JSON.stringify({
      duration,
      vibe,
      minute: Math.floor((Date.now() - sessionStartTime.current) / 60000),
      distractionHistory: distractionHistory,
      totalDistractions: distractionHistory.length,
      focusScore: focusScore
    }));
    navigate("/post-session");
  };

  const handleReplay = () => {
    window.location.reload();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
      {/* Micro-Nudge */}
      {currentNudge && (
        <MicroNudge
          type={currentNudge.type}
          message={currentNudge.message}
          onDismiss={() => setCurrentNudge(null)}
          duration={15000}
        />
      )}

      {/* Background decorative elements */}
      <div className="absolute inset-0">
        <div className={`absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r ${currentVibe.bg} rounded-full blur-3xl opacity-30`}></div>
        <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-l ${currentVibe.bg} rounded-full blur-3xl opacity-20`}></div>
      </div>

      {/* Progress Bar - Fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-2 bg-gray-800/50 backdrop-blur-sm">
          <div 
            className={`h-full bg-gradient-to-r ${currentVibe.button} transition-all duration-1000 ease-out ${currentVibe.glow}`}
            style={{ width: `${sessionProgress}%` }}
          ></div>
        </div>
        
        {/* Session info overlay */}
        <div className="absolute top-4 left-6 bg-gray-900/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700">
          <div className="flex items-center space-x-4 text-sm">
            <div className="text-white font-medium">{formatTime(elapsedTime)} / {duration}:00</div>
            <div className={`${currentVibe.text} font-medium`}>{Math.round(sessionProgress)}%</div>
          </div>
        </div>

        <div className="absolute top-4 right-6 bg-gray-900/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 ${status.includes('Error') || status.includes('denied') ? 'bg-red-400' : 'bg-green-400'} rounded-full animate-pulse`}></div>
            <span className="text-white text-sm font-medium">{status}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pt-20 pb-32">
        
        {/* Goal Display */}
        <div className="mb-8 text-center">
          <div className={`inline-flex items-center space-x-2 bg-gray-800/30 border ${currentVibe.border} rounded-full px-6 py-3 backdrop-blur-sm`}>
            <div className={`w-2 h-2 ${currentVibe.text.replace('text-', 'bg-')} rounded-full animate-pulse`}></div>
            <span className="text-white font-medium">🎯 {goal}</span>
          </div>
        </div>

        {/* Webcam Video - Bigger and Centered */}
        <div className="relative group mb-6">
          <div className={`absolute inset-0 bg-gradient-to-r ${currentVibe.bg} rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity duration-300`}></div>
          <div className={`relative bg-gray-900/50 backdrop-blur-sm border-2 ${currentVibe.border} rounded-3xl overflow-hidden ${currentVibe.glow} shadow-2xl`}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-[480px] h-[360px] md:w-[640px] md:h-[480px] lg:w-[800px] lg:h-[600px] object-cover"
              aria-label="Live webcam feed for focus tracking"
            />
            
            {/* Video overlay indicators */}
            <div className="absolute top-6 left-6 flex items-center space-x-3">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50"></div>
              <span className="text-white text-base font-medium bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg">LIVE</span>
            </div>
          </div>
        </div>

        {/* Live Focus Score Box */}
        <div className="w-full max-w-4xl flex flex-col items-center space-y-4" aria-live="polite" aria-atomic="true">
          {focusScore !== null && (
            <div className={`flex items-center justify-center px-8 py-4 rounded-2xl shadow-lg border-2 ${distraction ? 'border-red-400 bg-red-900/30' : 'border-green-400 bg-green-900/30'} mb-2`}
              style={{ minWidth: 220 }}>
              <span className={`text-3xl font-bold ${distraction ? 'text-red-300' : 'text-green-300'} drop-shadow`}>{focusScore}</span>
              <span className="ml-2 text-lg text-white/80 font-medium">Focus Score</span>
              {distraction && <span className="ml-4 px-3 py-1 rounded-full bg-red-500/80 text-white text-xs font-semibold animate-pulse">Distraction detected</span>}
            </div>
          )}
          
          {/* Warning if backend connected but score is 0 */}
          {backendConnected && focusScore === 0 && (
            <div className="mt-2 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 max-w-md">
              <div className="text-yellow-300 font-medium mb-2">⚠️ Score is 0 - Possible Issues:</div>
              <ul className="text-yellow-200/80 text-sm space-y-1 list-disc list-inside">
                <li>Make sure your face is clearly visible to the camera</li>
                <li>Ensure good lighting (not too dark or bright)</li>
                <li>Look directly at the screen/camera</li>
                <li>Backend may still be initializing face detection</li>
              </ul>
            </div>
          )}
          
          {/* Warning if backend not connected */}
          {!backendConnected && (
            <div className="mt-2 bg-red-500/20 border border-red-500/50 rounded-xl p-4 max-w-md">
              <div className="text-red-300 font-medium mb-2">❌ Not Connected to MediaPipe Backend</div>
              <div className="text-red-200/80 text-sm">
                Check browser console (F12) for connection details.
                <br/>Backend should be running on: <code className="bg-black/30 px-2 py-1 rounded">{MEDIAPIPE_API_URL}</code>
              </div>
            </div>
          )}
          
          <FocusAgentMessage message={aiMessage} vibe={vibe} />
        </div>
      </div>

      {/* Bottom Controls - Fixed position */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleReplay}
            className={`group flex items-center space-x-2 bg-gray-800/80 hover:bg-gray-700/80 border ${currentVibe.border} text-white px-6 py-3 rounded-xl transition-all duration-300 backdrop-blur-sm ${currentVibe.glow}`}
            aria-label="Restart session"
          >
            <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            <span className="font-medium">Restart</span>
          </button>
          
          <button
            onClick={handleEndSession}
            className={`group flex items-center space-x-2 bg-gradient-to-r ${currentVibe.button} text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 ${currentVibe.glow} shadow-lg`}
            aria-label="End focus session"
          >
            <Square className="w-5 h-5" />
            <span>End Session</span>
          </button>
        </div>
      </div>

      {/* Hidden canvas for frame processing */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}

export default Session;