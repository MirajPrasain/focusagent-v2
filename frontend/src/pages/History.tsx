import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Trash2 } from 'lucide-react';
import AccountActions from '../components/AccountActions';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Eyebrow from '../components/ui/Eyebrow';
import PageShell, { GUTTER } from '../components/ui/PageShell';
import { apiFetch, errorDetail } from '../lib/api';

// GET /sessions (backend/routes_sessions.py): the signed-in user's sessions, newest first, in whole seconds
type SessionRow = {
  id: string;
  duration_seconds: number;
  focused_seconds: number;
  total_seconds: number;
  not_tracked_seconds: number;
  longest_stretch_seconds: number;
  created_at: string;
};

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Minutes, or seconds under a minute, as on the summary
function formatLength(seconds: number) {
  return seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
}

// Focused share of the time that was tracked, as on the summary
function focusedPct({ focused_seconds: focused, total_seconds: total, not_tracked_seconds: notTracked }: SessionRow) {
  const tracked = total - notTracked;
  return tracked > 0 ? Math.round((focused / tracked) * 100) : 0;
}

const History = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The session whose delete is in flight, so its button can't be pressed twice
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/sessions')
      .then((res) => {
        // The token was turned down (and dropped by apiFetch): sign in again
        if (res.status === 401) {
          if (!cancelled) navigate('/login', { replace: true });
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SessionRow[] | null) => {
        if (!cancelled && data) setSessions(data);
      })
      .catch((err) => {
        console.error('Failed to load session history:', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // DELETE /sessions/{id}, after a confirm, then drops the row from the list here rather than refetching.
  // A 404 means it's already gone, so the row goes too
  async function deleteSession(session: SessionRow) {
    if (!window.confirm(`Delete the session from ${DATE_FORMAT.format(new Date(session.created_at))}? This can't be undone.`)) return;
    setDeletingId(session.id);
    try {
      const res = await apiFetch(`/sessions/${session.id}`, { method: 'DELETE' });
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (!res.ok && res.status !== 404) {
        window.alert(await errorDetail(res, "Couldn't delete that session."));
        return;
      }
      setSessions((current) => current && current.filter((s) => s.id !== session.id));
    } catch (err) {
      console.error('Failed to delete session:', err);
      window.alert("Couldn't delete that session.");
    } finally {
      setDeletingId(null);
    }
  }

  const start = (
    <Button size="lg" onClick={() => navigate('/setup')}>
      Start a session
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Button>
  );

  let body;
  if (failed || !sessions || sessions.length === 0) {
    const message = failed ? "Couldn't load your sessions." : !sessions ? 'Loading your sessions...' : 'No sessions yet.';
    body = (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <p role="status" className="text-xl text-fg-secondary">{message}</p>
        {(failed || sessions) && <div className="mt-8">{start}</div>}
      </div>
    );
  } else {
    body = (
      <div className="animate-fade-up py-12 xl:px-12">
        <Eyebrow tone="accent">History · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</Eyebrow>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.03em]">Your sessions</h1>
        <Card padding="sm" className="mt-10 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">
                <th scope="col" className="px-3 pb-3 font-normal">Date</th>
                <th scope="col" className="px-3 pb-3 font-normal">Length</th>
                <th scope="col" className="px-3 pb-3 font-normal">Focused</th>
                <th scope="col" className="px-3 pb-3 font-normal">Longest stretch</th>
                <th scope="col" className="px-3 pb-3 font-normal"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {/* A row opens the session's summary. Its date is also a link, so a keyboard can open it */}
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-surface-raised"
                  onClick={() => navigate(`/history/${session.id}`)}
                >
                  <td className="whitespace-nowrap px-3 py-3.5 text-fg">
                    <Link
                      to={`/history/${session.id}`}
                      className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {DATE_FORMAT.format(new Date(session.created_at))}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-fg-secondary">{formatLength(session.total_seconds)}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-accent">{focusedPct(session)}%</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-fg-secondary">
                    {formatLength(session.longest_stretch_seconds)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      variant="text"
                      className="p-2 hover:text-distracted"
                      aria-label={`Delete session from ${DATE_FORMAT.format(new Date(session.created_at))}`}
                      disabled={deletingId === session.id}
                      onClick={(e) => {
                        e.stopPropagation(); // not the row's click, which opens the session
                        deleteSession(session);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="mt-11">{start}</div>
      </div>
    );
  }

  return (
    <PageShell actions={<AccountActions />}>
      <div className={`flex flex-1 flex-col ${GUTTER}`}>{body}</div>
    </PageShell>
  );
};

export default History;
