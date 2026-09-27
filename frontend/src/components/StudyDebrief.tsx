import { useState } from 'react';
import Card from './ui/Card';

interface LastSession {
  duration?: number;
  focusScore?: number | null;
  totalDistractions?: number;
}

const loadLastSession = (): LastSession | null => {
  try {
    const raw = localStorage.getItem('lastSession');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const StudyDebrief = () => {
  const [session] = useState<LastSession | null>(loadLastSession);

  // No real session data: show nothing rather than a made-up debrief
  if (!session) {
    return null;
  }

  const hasScore = typeof session.focusScore === 'number';

  return (
    <Card className="grid grid-cols-2 gap-4 text-center">
      <div>
        <div className="text-4xl font-semibold tabular-nums">{hasScore ? session.focusScore : '--'}</div>
        <div className="mt-1 text-sm text-fg-secondary">Focus score</div>
      </div>
      <div>
        <div className="text-4xl font-semibold tabular-nums">{session.totalDistractions ?? 0}</div>
        <div className="mt-1 text-sm text-fg-secondary">Distractions</div>
      </div>
    </Card>
  );
};

export default StudyDebrief;
