from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from ws_routes import study_ws, charts, messages, tts

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# Only include study mode WebSocket
app.include_router(study_ws.router)

# Include charts router
app.include_router(charts.router)

app.include_router(messages.router)
app.include_router(tts.router)