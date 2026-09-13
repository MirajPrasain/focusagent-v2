import os
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import httpx
from pydantic import BaseModel

router = APIRouter()

# Map vibes to ElevenLabs voice IDs
VOICE_MAP = {
    "calm": "EXAVITQu4vr4xnSDxMaL",  # Example calm voice ID
    "beast": "21m00Tcm4TlvDq8ikWAM", # Example beast voice ID
    "game": "AZnzlk1XvdvUeBnXmlld",  # Example game voice ID
}

class TTSRequest(BaseModel):
    text: str
    vibe: str = "calm"

@router.post("/session/api/tts")
async def tts_endpoint(body: TTSRequest):
    print(f"🎵 TTS Request received: text='{body.text[:50]}...', vibe='{body.vibe}'")
    
    api_key = os.getenv("ELEVEN_API_KEY")
    if not api_key:
        print("❌ ELEVEN_API_KEY not found in environment variables")
        raise HTTPException(status_code=500, detail="ELEVEN_API_KEY not set in environment.")
    
    print(f"✅ API Key found: {api_key[:10]}...")
    
    #vibe is received from the frontend as user selects it there.
    voice_id = VOICE_MAP.get(body.vibe, VOICE_MAP["calm"]) #but here, its set as default calm
    print(f"🎙️ Using voice ID: {voice_id} for vibe: {body.vibe}")
    
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {"text": body.text, "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}}

    print(f"🌐 Making request to: {url}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(url, headers=headers, json=payload)
        print(f"📡 ElevenLabs API response status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ TTS API error: {r.text}")
            raise HTTPException(status_code=502, detail=f"TTS API error: {r.text}")
        
        print("✅ TTS API success, returning audio stream")
        return StreamingResponse(r.aiter_bytes(), media_type="audio/mpeg") 