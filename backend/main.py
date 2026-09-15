from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ws_routes import study_ws, charts

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


@app.get("/")
async def health():
    return {"status": "ok"}