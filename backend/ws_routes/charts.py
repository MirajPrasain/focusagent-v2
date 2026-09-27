from fastapi import APIRouter
from cv_project.landmark_pipeline import DISTRACTED_BELOW
from ws_routes.study_ws import latest_session

router = APIRouter()

# A stretch counts as distracted only once the score has stayed below DISTRACTED_BELOW this long. Shorter dips
# (a blink, a quick glance) count as focused
MIN_DISTRACTED_SECONDS = 2


def distracted_intervals(timed_scores, session_seconds):
    """(start, end) in seconds of every stretch where the score stayed below DISTRACTED_BELOW for at least
    MIN_DISTRACTED_SECONDS. timed_scores are (seconds since the session started, score) in order; each score holds
    until the next one, and the last one until the session ended."""
    intervals = []
    run_start = None
    end = max(session_seconds, timed_scores[-1][0] if timed_scores else 0)
    for elapsed, score in [*timed_scores, (end, None)]:  # the sentinel closes a run still open at the end
        low = score is not None and score < DISTRACTED_BELOW
        if low and run_start is None:
            run_start = elapsed
        elif not low and run_start is not None:
            if elapsed - run_start >= MIN_DISTRACTED_SECONDS:
                intervals.append((run_start, elapsed))
            run_start = None
    return intervals


def summarize_focus(timed_scores, session_seconds):
    """The session summary: every whole second is distracted if its midpoint lies in a distracted interval, else
    focused (including seconds before the first score). Returns total_seconds, focused_seconds,
    longest_focused_seconds and the timeline as segments [{start, end, state}] (seconds, end exclusive)."""
    total = round(session_seconds)
    intervals = distracted_intervals(timed_scores, session_seconds)
    segments = []
    for second in range(total):
        state = "distracted" if any(start <= second + 0.5 < end for start, end in intervals) else "focused"
        if segments and segments[-1]["state"] == state:
            segments[-1]["end"] = second + 1
        else:
            segments.append({"start": second, "end": second + 1, "state": state})
    focused = [segment["end"] - segment["start"] for segment in segments if segment["state"] == "focused"]
    return {
        "total_seconds": total,
        "focused_seconds": sum(focused),
        "longest_focused_seconds": max(focused, default=0),
        "segments": segments,
    }


@router.get("/summary")
async def get_session_summary():
    """The most recent session's summary (see summarize_focus), from its scores (cv_project/landmark_pipeline.py)
    and how long it actually ran. All zeros before the first session."""
    session = latest_session()
    if session is None:
        return summarize_focus([], 0)
    return summarize_focus(session.gaze_scores, session.session_length())
