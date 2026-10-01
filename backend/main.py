import os

from beanie import init_beanie
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from models import Session, User
from routes_auth import router as auth_router
from routes_sessions import router as sessions_router
from ws_routes import study_ws, charts

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

# Session summary endpoint
app.include_router(charts.router)

# Signup and login
app.include_router(auth_router)

# Saving and listing the logged-in user's sessions
app.include_router(sessions_router)


@app.on_event("startup")
async def startup_db():
    mongodb_uri = os.environ["MONGODB_URI"]
    # tz_aware so datetimes read back as UTC rather than naive (which clients would take as local time)
    client = AsyncIOMotorClient(mongodb_uri, tz_aware=True)
    # URI has no db name in its path, so name it explicitly.
    await init_beanie(database=client["focusagent"], document_models=[User, Session])


@app.get("/")
async def health():
    return {"status": "ok"}
