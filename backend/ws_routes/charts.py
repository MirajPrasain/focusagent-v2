from fastapi import APIRouter
from cv_project.study_mode import get_focus_data, get_cheat_data, get_session_duration
import random

router = APIRouter()

@router.get("/post-session")
async def get_summary_data(chart_type: str):
    session_duration = get_session_duration()

    if chart_type == "focus": 
        focus_scores = get_focus_data()

        # Check if focus_scores is missing, empty, or flat (all same values)
        if not focus_scores or session_duration == 0:
            print("⚠️ No focus data available. Generating test data...")
            focus_scores = [random.randint(60, 100) for _ in range(60)]
            session_duration = 1800  # 30 minutes in seconds
        elif len(set(focus_scores)) <= 1:  # All values are the same (flat data)
            print("⚠️ Flat focus data detected. Generating test data...")
            focus_scores = [random.randint(60, 100) for _ in range(60)]
            session_duration = 1800  # 30 minutes in seconds

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
    
    elif chart_type == "cheat": 
        cheat_times, cheat_events = get_cheat_data()

        # Defensive fallback if cheat_times or cheat_events are missing
        if not cheat_times or not cheat_events:
            print("⚠️ No cheat data found. Returning empty chart.")
            return {
                "chart_data": [],
                "session_duration": session_duration
            }

        # Create chart-friendly format (time + label)
        chart_data = [
            {"time": round(cheat_times[i], 2), "event": cheat_events[i]}
            for i in range(min(len(cheat_times), len(cheat_events)))
        ]

        return {
            "chart_data": chart_data,
            "session_duration": session_duration
        }
    
    elif chart_type == "focus-donut":
        focus_scores = get_focus_data()

        focused = sum(1 for item in focus_scores if item > 40)
        distracted = len(focus_scores) - focused

        return {
            "focus_pie": focused,
            "cheat_pie": distracted
        }

    else:
        # Invalid chart_type
        return {
            "error": f"Invalid chart_type: {chart_type}. Must be 'focus', 'cheat', or 'circle'",
            "chart_data": [],
            "session_duration": session_duration
        }
    