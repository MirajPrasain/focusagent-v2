from fastapi import APIRouter
from ws_routes.study_ws import latest_session

router = APIRouter()

@router.get("/post-session")
async def get_summary_data(chart_type: str):
    # The most recent session's scores, one per scored landmark message (cv_project/landmark_pipeline.py)
    session = latest_session()
    focus_scores = session.gaze_scores if session else []
    session_duration = session.session_duration if session else 0

    if chart_type == "focus":
        if not focus_scores or session_duration == 0:
            print("⚠️ No focus data available. Returning empty chart.")
            return {
                "chart_data": [],
                "session_duration": session_duration,
            }

        timestamps = [
            round((i * session_duration) / len(focus_scores))
            for i in range(len(focus_scores))
        ]

        smoothed_scores = []
        for i in range(len(focus_scores)):
            window = focus_scores[max(0, i - 9): i + 1]
            avg = sum(window) / len(window)

            clamped = max(0, min(100, round(avg)))
            smoothed_scores.append(clamped)

        chart_data = [
            {"time": timestamps[i], "score": smoothed_scores[i]}
            for i in range(len(focus_scores))
        ]

        return {
            "chart_data": chart_data,
            "session_duration": session_duration,
        }
    
    elif chart_type == "focus-donut":
        focused = sum(1 for item in focus_scores if item > 40)
        distracted = len(focus_scores) - focused

        return {
            "focus_pie": focused,
            "cheat_pie": distracted
        }

    else:
        # Invalid chart_type
        return {
            "error": f"Invalid chart_type: {chart_type}. Must be 'focus' or 'focus-donut'",
            "chart_data": [],
            "session_duration": session_duration
        }
    