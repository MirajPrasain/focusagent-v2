from fastapi import APIRouter, Query
from cv_project.langchain_utils import generate_focus_message

router = APIRouter()

@router.get("/ai-messages")
def get_ai_message(
    minute: int = Query(...),
    duration: int = Query(...),
    vibe: str = Query("calm"),
    cheat_count: int = Query(0)
):
    message = generate_focus_message(duration, vibe, minute, cheat_count)
    return {"message": message}