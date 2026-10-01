import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AccountActions from '../components/AccountActions';
import Button from '../components/ui/Button';
import Eyebrow from '../components/ui/Eyebrow';
import PageShell, { GUTTER } from '../components/ui/PageShell';
import SegmentBar, { type SegmentTone } from '../components/ui/SegmentBar';
import StatusDot from '../components/ui/StatusDot';
import { apiFetch } from '../lib/api';

// GET /summary (backend/ws_routes/charts.py): this user's most recent session, in whole seconds. A stretch is distracted
// only if the score stayed below 40 for at least 2 seconds; not tracked where the browser sent no landmark message
// for more than 2 seconds
type Segment = { start: number; end: number; state: 'focused' | 'distracted' | 'not_tracked' };
type SessionSummary = {
  total_seconds: number;
  focused_seconds: number;
  not_tracked_seconds: number;
  longest_focused_seconds: number;
  segments: Segment[];
};

const SEGMENT_TONES: Record<Segment['state'], SegmentTone> = {
  focused: 'focused',
  distracted: 'distracted',
  not_tracked: 'away',
};

// m:ss, for the timeline's time labels
function formatClock(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The whole session from start to end, with time labels at every quarter
function Timeline({ segments, total }: { segments: Segment[]; total: number }) {
  const notTracked = segments.some((segment) => segment.state === 'not_tracked');
  return (
    <div className="rounded-[20px] border border-border bg-surface px-5 pb-5 pt-6 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Your session, start to finish</Eyebrow>
        <div className="flex gap-[18px] text-[13px] text-fg-secondary">
          <span className="inline-flex items-center gap-2"><StatusDot state="focused" size="sm" />Focused</span>
          <span className="inline-flex items-center gap-2"><StatusDot state="distracted" size="sm" />Distracted</span>
          {notTracked && <span className="inline-flex items-center gap-2"><StatusDot state="away" size="sm" />Not tracked</span>}
        </div>
      </div>
      <SegmentBar
        segments={segments.map((segment) => ({
          key: segment.start,
          left: (segment.start / total) * 100,
          width: ((segment.end - segment.start) / total) * 100,
          tone: SEGMENT_TONES[segment.state],
        }))}
        className="mt-6 h-14 rounded-lg"
        segmentClassName="rounded-lg"
      />
      <div className="mt-3 flex justify-between font-mono text-[11px] text-fg-muted tabular-nums">
        {[0, 0.25, 0.5, 0.75, 1].map((at) => <span key={at}>{formatClock(total * at)}</span>)}
      </div>
    </div>
  );
}

// One figure in the stats row, as a number and its unit
function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="px-6 py-5 sm:px-8 sm:py-6">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-3 text-[44px] font-light leading-none tracking-[-0.04em] tabular-nums">
        {value}
        <span className="ml-1.5 text-lg tracking-normal text-fg-secondary">{unit}</span>
      </div>
    </div>
  );
}

const Summary = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The planned length in minutes, passed only by Session as it ends: its presence means this session is unsaved
    const duration = (location.state as { duration?: number } | null)?.duration;
    apiFetch('/summary')
      .then((res) => {
        // The token was turned down (and dropped by apiFetch): sign in again
        if (res.status === 401) {
          if (!cancelled) navigate('/login', { replace: true });
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SessionSummary | null) => {
        if (cancelled || !data) return;
        setSummary(data);
        if (typeof duration === 'number' && data.total_seconds > 0) saveSession(data, duration);
      })
      .catch((err) => {
        console.error('Failed to load the session summary:', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // Once, on arrival: the state it reads is cleared by the save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // POST /sessions (backend/routes_sessions.py) takes the summary's fields plus the planned length in seconds. The
  // arrival state is cleared first, so a reload of this page can't save the session twice. A failed save is only
  // logged: the summary still shows
  const saveSession = (data: SessionSummary, duration: number) => {
    navigate(location.pathname, { replace: true, state: null });
    apiFetch('/sessions', { method: 'POST', body: JSON.stringify({ ...data, duration_seconds: duration * 60 }) })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      })
      .catch((err) => console.error('Failed to save the session to your history:', err));
  };

  const again = (
    <Button size="lg" onClick={() => navigate('/setup')}>
      Start another session
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Button>
  );

  let body;
  if (failed || !summary || summary.total_seconds === 0) {
    const message = failed ? "Couldn't load this session's summary."
      : !summary ? 'Loading your summary...' : 'No focus data was recorded for this session.';
    body = (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <p role="status" className="text-xl text-fg-secondary">{message}</p>
        {(failed || summary) && <div className="mt-8">{again}</div>}
      </div>
    );
  } else {
    const { total_seconds: total, focused_seconds: focused, not_tracked_seconds: notTracked,
      longest_focused_seconds: longest } = summary;
    // Minutes, or seconds for a session under a minute
    const inSeconds = total < 60;
    const unit = inSeconds ? 'sec' : 'min';
    const value = (seconds: number) => (inSeconds ? seconds : Math.round(seconds / 60));
    // Focused share of the time that was tracked
    const tracked = total - notTracked;
    const pct = tracked > 0 ? Math.round((focused / tracked) * 100) : 0;
    const distracted = Math.max(tracked - focused, 0);
    body = (
      <div className="flex flex-1 animate-fade-up flex-col justify-center py-12 xl:px-12">
        <Eyebrow tone="accent">Session complete · {value(total)} {unit}</Eyebrow>
        <div className="mt-6 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-baseline gap-5">
              <span className="text-[clamp(120px,17vw,240px)] font-extralight leading-[0.82] tracking-[-0.065em] tabular-nums">
                {value(focused)}
              </span>
              <span className="flex flex-col">
                <span className="text-4xl font-light leading-none tracking-[-0.03em] sm:text-[56px]">{unit}</span>
                <span className="font-serif text-[40px] italic leading-none text-accent sm:text-[64px]">focused</span>
              </span>
            </h1>
            <p className="mt-7 text-xl text-fg-secondary sm:text-[22px]">
              of {value(total)} {inSeconds ? 'seconds' : 'minutes'} · <span className="text-fg">{pct}%</span>
              {notTracked > 0 && ' of tracked time'}
            </p>
          </div>
          <div className="flex flex-wrap self-start rounded-[18px] border border-border bg-surface lg:self-auto [&>*+*]:border-l [&>*+*]:border-border">
            <Stat label="Longest stretch" value={value(longest)} unit={unit} />
            <Stat label="Distracted" value={value(distracted)} unit={unit} />
            {notTracked > 0 && (
              <Stat label="Not tracked" value={inSeconds ? notTracked : Math.max(1, Math.round(notTracked / 60))} unit={unit} />
            )}
          </div>
        </div>
        <div className="mt-16">
          <Timeline segments={summary.segments} total={total} />
        </div>
        <div className="mt-11 flex flex-wrap items-center gap-3">
          {again}
          <Link to="/" className="rounded-md px-5 py-4 text-[15px] text-fg-secondary transition-colors hover:text-fg">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PageShell actions={<AccountActions />}>
      <div className={`flex flex-1 flex-col ${GUTTER}`}>{body}</div>
    </PageShell>
  );
};

export default Summary;
