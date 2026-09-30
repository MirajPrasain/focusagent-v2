import os
from datetime import datetime, timezone

from beanie import init_beanie
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from models import Session, User
from routes_auth import router as auth_router
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

# Signup/login and the auth dependency's test route
app.include_router(auth_router)


@app.on_event("startup")
async def startup_db():
    mongodb_uri = os.environ["MONGODB_URI"]
    client = AsyncIOMotorClient(mongodb_uri)
    # URI has no db name in its path, so name it explicitly.
    await init_beanie(database=client["focusagent"], document_models=[User, Session])


@app.get("/")
async def health():
    return {"status": "ok"}


# TEMPORARY: proves the Mongo/Beanie connection works. Delete this route
# once the real auth routes land.
@app.get("/db-check")
async def db_check():
    test_user = User(
        email="db-check@example.com",
        password_hash="not-a-real-hash",
        created_at=datetime.now(timezone.utc),
    )
    await test_user.insert()
    fetched = await User.get(test_user.id)
    await fetched.delete()
    return {"ok": True}