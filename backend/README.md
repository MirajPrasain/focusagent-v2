# StudyFocus AI 🎯

An AI-powered study session monitoring application that uses computer vision to track focus, detect distractions, and provide motivational feedback to help users maintain concentration during deep work sessions.

## 🌟 Features

- **Real-time Focus Tracking**: Uses computer vision and MediaPipe to monitor eye movement, blink patterns, and head position
- **Distraction Detection**: Detects when users look away, use phones, or show signs of losing focus
- **AI-Powered Motivation**: Generates personalized motivational messages using Google's Gemini AI
- **Text-to-Speech**: Converts AI messages to speech using ElevenLabs API with different voice "vibes"
- **Session Analytics**: Provides detailed charts and statistics about focus levels and distraction events
- **WebSocket Support**: Real-time communication between frontend and backend for live monitoring

## 🛠️ Technology Stack

- **Backend**: FastAPI (Python)
- **Computer Vision**: OpenCV, MediaPipe, YOLO
- **AI/LLM**: Google Gemini (via LangChain)
- **Text-to-Speech**: ElevenLabs API
- **Data Processing**: NumPy, Pandas
- **Visualization**: Matplotlib
- **Real-time Communication**: WebSockets

## 📁 Project Structure

```
hackru/
├── main.py                     # FastAPI application entry point
├── backend/
│   └── routes/
│       └── tts.py             # Text-to-speech API endpoints
├── cv_project/
│   ├── study_mode.py          # Core computer vision and focus tracking
│   └── langchain_utils.py     # AI message generation utilities
├── ws_routes/
│   ├── study_ws.py            # WebSocket endpoints for real-time monitoring
│   ├── charts.py              # Session analytics and chart data endpoints
│   └── messages.py            # AI message generation endpoints
└── .env                       # Environment variables
```

## 🚀 Getting Started

### Prerequisites

- Python 3.8+
- Webcam access
- ElevenLabs API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hackru
   ```

2. **Install dependencies**
   ```bash
   pip install fastapi uvicorn opencv-python mediapipe ultralytics
   pip install numpy pandas matplotlib fpdf2 httpx langchain
   pip install google-generativeai
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   ELEVEN_API_KEY=your_elevenlabs_api_key_here
   ```

4. **Download YOLO model**
   
   The application uses YOLOv5s for object detection. It will be downloaded automatically on first run.

### Running the Application

1. **Start the FastAPI server**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Access the API**
   
   The API will be available at `http://localhost:8000`
   
   - API documentation: `http://localhost:8000/docs`
   - ReDoc documentation: `http://localhost:8000/redoc`

## 🔌 API Endpoints

### WebSocket Endpoints

- `ws://localhost:8000/ws/study` - Real-time study session monitoring

### REST Endpoints

- `POST /api/tts` - Convert text to speech with different voice vibes
- `GET /post-session` - Get session analytics and chart data
- `GET /ai-messages` - Generate AI motivational messages

### Text-to-Speech API

```json
POST /api/tts
{
  "text": "Stay focused! You're doing great!",
  "vibe": "calm"  // Options: "calm", "beast", "game"
}
```

### AI Messages API

```
GET /ai-messages?minute=15&duration=30&vibe=calm&cheat_count=2
```

## 🎮 Voice Vibes

The application supports different voice personalities for TTS:

- **calm**: Soothing, gentle encouragement
- **beast**: High-energy, intense motivation  
- **game**: Playful, gaming-inspired feedback

## 📊 Focus Tracking Features

- **Eye Tracking**: Monitors eye movement and blink patterns
- **Head Position**: Detects when user looks away from screen
- **Phone Detection**: Uses YOLO to detect phone usage
- **Attention Scoring**: Real-time focus score calculation
- **Event Logging**: Tracks distraction events with timestamps

## 🔧 Configuration

### Session Settings

- Default session duration: 30 minutes
- Configurable via `set_session_duration()` function
- Real-time session updates via WebSocket

### Detection Sensitivity

Adjust detection parameters in `cv_project/study_mode.py`:
- Face mesh confidence thresholds
- Blink detection sensitivity
- Object detection confidence levels

## 📈 Analytics

The application provides detailed session analytics:

- Focus score over time
- Distraction event timeline
- Session summary statistics
- Exportable charts and reports

## 🛡️ Privacy & Security

- All video processing happens locally
- No video data is stored or transmitted
- Only focus metrics and events are logged
- API keys should be kept secure in environment variables

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **MediaPipe** for face mesh and pose detection
- **YOLO** for object detection capabilities
- **ElevenLabs** for high-quality text-to-speech
- **Google Gemini** for AI-powered motivational content
- **FastAPI** for the robust web framework

## 📞 Support

If you encounter any issues or have questions, please open an issue on GitHub or contact the development team.

---

**Built with ❤️ for better focus and productivity**