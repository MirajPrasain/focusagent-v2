from fastapi import APIRouter, Depends
from cv_project.landmark_pipeline import DISTRACTED_BELOW
from models import User
from routes_auth import get_current_user
from ws_routes.study_ws import session_for

router = APIRouter()

# A stretch counts as distracted only once the score has stayed below DISTRACTED_BELOW this long. Shorter dips
# (a blink, a quick glance) count as focused
MIN_DISTRACTED_SECONDS = 2
# No landmark message for longer than this means the browser wasn't tracking (a hidden tab without the pop-out
# window, a camera or connection problem): that stretch counts as not tracked
MAX_MESSAGE_GAP_SECONDS = 2


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


def untracked_intervals(message_times, session_seconds):
    """(start, end) in seconds of every stretch longer than MAX_MESSAGE_GAP_SECONDS without a landmark message,
    including before the first message and after the last one. message_times are in order."""
    intervals = []
    previous = 0
    for arrived in [*message_times, session_seconds]:  # the sentinel catches a gap that runs to the session's end
        if arrived - previous > MAX_MESSAGE_GAP_SECONDS:
            intervals.append((previous, arrived))
        previous = max(previous, arrived)
    return intervals


def summarize_focus(timed_scores, message_times, session_seconds):
    """The session summary: every whole second is not tracked if its midpoint lies in a stretch without landmark
    messages, else distracted if it lies in a distracted interval, else focused. Returns total_seconds,
    focused_seconds, not_tracked_seconds, longest_focused_seconds and the timeline as segments [{start, end, state}]
    (seconds, end exclusive)."""
    total = round(session_seconds)
    untracked = untracked_intervals(message_times, session_seconds)
    distracted = distracted_intervals(timed_scores, session_seconds)
    segments = []
    for second in range(total):
        midpoint = second + 0.5
        if any(start <= midpoint < end for start, end in untracked):
            state = "not_tracked"
        elif any(start <= midpoint < end for start, end in distracted):
            state = "distracted"
        else:
            state = "focused"
        if segments and segments[-1]["state"] == state:
            segments[-1]["end"] = second + 1
        else:
            segments.append({"start": second, "end": second + 1, "state": state})
    def lengths(state):
        return [segment["end"] - segment["start"] for segment in segments if segment["state"] == state]

    focused = lengths("focused")
    return {
        "total_seconds": total,
        "focused_seconds": sum(focused),
        "not_tracked_seconds": sum(lengths("not_tracked")),
        "longest_focused_seconds": max(focused, default=0),
        "segments": segments,
    }


@router.get("/summary")
async def get_session_summary(current_user: User = Depends(get_current_user)):
    """The current user's most recent session's summary (see summarize_focus), from its scores and landmark message
    times (cv_project/landmark_pipeline.py) and how long it actually ran. All zeros before their first session."""
    session = session_for(str(current_user.id))
    if session is None:
        return summarize_focus([], [], 0)
    return summarize_focus(session.gaze_scores, session.message_times, session.session_length())
