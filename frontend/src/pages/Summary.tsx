import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import PageShell from '../components/ui/PageShell';
import StatusDot from '../components/ui/StatusDot';

// GET /summary (backend/ws_routes/charts.py): the most recent session, in whole seconds. A stretch is distracted
// only if the score stayed below 40 for at least 2 seconds
type Segment = { start: number; end: number; state: 'focused' | 'distracted' };
type SessionSummary = {
  total_seconds: number;
  focused_seconds: number;
  longest_focused_seconds: number;
  segments: Segment[];
};

const API_URL = import.meta.env.VITE_MEDIAPIPE_API_URL || 'http://localhost:8001';

// m:ss, for the timeline's time labels
function formatClock(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The whole session from start to end, with time labels at the start, middle and end
function Timeline({ segments, total }: { segments: Segment[]; total: number }) {
  return (
    <div>
      <div className="relative h-2 overflow-hidden rounded-full bg-border">
        {segments.map((segment) => (
          <div
            key={segment.start}
            className={`absolute inset-y-0 ${segment.state === 'focused' ? 'bg-accent' : 'bg-distracted'}`}
            style={{ left: `${(segment.start / total) * 100}%`, width: `${((segment.end - segment.start) / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-fg-muted">
        <span>{formatClock(0)}</span>
        <span>{formatClock(total / 2)}</span>
        <span>{formatClock(total)}</span>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-fg-secondary">
        <span className="inline-flex items-center gap-1.5"><StatusDot state="focused" size="sm" /> Focused</span>
        <span className="inline-flex items-center gap-1.5"><StatusDot state="distracted" size="sm" /> Distracted</span>
      </div>
    </div>
  );
}

const Summary = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/summary`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SessionSummary) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        console.error('Failed to load the session summary:', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let body;
  if (failed) {
    body = <p className="text-fg-secondary">Couldn't load this session's summary.</p>;
  } else if (!summary) {
    body = <p className="text-fg-secondary">Loading your summary...</p>;
  } else if (summary.total_seconds === 0) {
    body = <p className="text-fg-secondary">No focus data was recorded for this session.</p>;
  } else {
    const { total_seconds: total, focused_seconds: focused, longest_focused_seconds: longest } = summary;
    // Minutes, or seconds for a session under a minute
    const inSeconds = total < 60;
    const amount = (seconds: number) => (inSeconds ? `${seconds} sec` : `${Math.round(seconds / 60)} min`);
    const pct = Math.round((focused / total) * 100);
    body = (
      <>
        <h1 className="text-4xl font-semibold tracking-tight">{amount(focused)} focused</h1>
        <p className="mt-2 text-fg-secondary">of {amount(total)} · {pct}%</p>
        <p className="mt-6 text-sm">Longest focused stretch: {amount(longest)}</p>
        <div className="mt-8">
          <Timeline segments={summary.segments} total={total} />
        </div>
      </>
    );
  }

  return (
    <PageShell wide>
      <div className="mt-8">{body}</div>
      <Button className="mt-10" onClick={() => navigate('/setup')}>Start another session</Button>
    </PageShell>
  );
};

export default Summary;
