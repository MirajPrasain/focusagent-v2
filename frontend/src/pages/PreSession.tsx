import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageShell from '../components/ui/PageShell';

const INPUT = 'w-full rounded-lg border border-border bg-page px-4 py-3 text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none transition-colors';

const PreSession = () => {
  const [sessionMin, setSessionMin] = useState("");
  const [goal, setGoal] = useState("");

  const navigate = useNavigate();

  const handleStartSession = () => {
     // if sessionMinutes is empty, or less than 1 minute
    if (!sessionMin || parseInt(sessionMin) < 1) {
      alert("Please enter a valid duration in minutes.");
      return;
    }

    // Encode query params to avoid breaking URL
    const encodedGoal = encodeURIComponent(goal); //this goal will be updated once user types via controlled input
    navigate(`/session?duration=${sessionMin}&goal=${encodedGoal}`);
  };

  return (
    <PageShell>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">New session</h1>

      <Card className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Duration</span>
          <div className="relative mt-2">
            <input
              type="number"
              min="1"
              placeholder="e.g. 25, 45, 90"
              value={sessionMin}
              onChange={(e) => setSessionMin(e.target.value)}
              className={`${INPUT} pr-14`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-fg-muted">min</span>
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Goal</span>
          <input
            type="text"
            placeholder="e.g. Finish my essay"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className={`${INPUT} mt-2`}
          />
        </label>
      </Card>

      <Button className="mt-6 w-full" onClick={handleStartSession}>Begin session</Button>
    </PageShell>
  );
};

export default PreSession;
