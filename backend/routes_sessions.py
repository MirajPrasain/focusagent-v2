from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from models import Session, User
from routes_auth import get_current_user

router = APIRouter()


class Segment(BaseModel):
    start: int
    end: int
    state: str


class SessionSummary(BaseModel):
    """What the frontend has at session end: the /summary response (ws_routes/charts.py, same field names) plus the
    planned length it chose on Setup. /summary's not_tracked_seconds is ignored, since the timeline already holds it."""
    duration_seconds: int
    total_seconds: int
    focused_seconds: int
    longest_focused_seconds: int
    segments: list[Segment]


@router.post("/sessions")
async def create_session(body: SessionSummary, current_user: User = Depends(get_current_user)):
    session = Session(
        user_id=str(current_user.id),
        duration_seconds=body.duration_seconds,
        focused_seconds=body.focused_seconds,
        total_seconds=body.total_seconds,
        longest_stretch_seconds=body.longest_focused_seconds,
        timeline=[segment.model_dump() for segment in body.segments],
        created_at=datetime.now(timezone.utc),
    )
    await session.insert()
    return {"id": str(session.id)}


@router.get("/sessions")
async def list_sessions(current_user: User = Depends(get_current_user)):
    """The current user's sessions, most recent first, without their timelines. not_tracked_seconds comes from the
    timeline, so a client can take the focused share of tracked time the way the summary page does."""
    sessions = await Session.find(Session.user_id == str(current_user.id)).sort(-Session.created_at).to_list()
    return [
        {
            "id": str(session.id),
            "duration_seconds": session.duration_seconds,
            "focused_seconds": session.focused_seconds,
            "total_seconds": session.total_seconds,
            "not_tracked_seconds": sum(
                segment["end"] - segment["start"] for segment in session.timeline if segment["state"] == "not_tracked"),
            "longest_stretch_seconds": session.longest_stretch_seconds,
            "created_at": session.created_at,
        }
        for session in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, current_user: User = Depends(get_current_user)):
    """Deletes one of the current user's sessions. 404 when there's no such session (an id that isn't an ObjectId
    can't name one), 403 when it belongs to someone else."""
    session = await Session.get(session_id) if ObjectId.is_valid(session_id) else None
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your session")
    await session.delete()
