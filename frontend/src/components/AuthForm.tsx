import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Button from './ui/Button';
import Card from './ui/Card';
import Eyebrow from './ui/Eyebrow';
import PageShell, { GUTTER } from './ui/PageShell';
import { apiFetch, errorDetail, getToken, saveToken } from '../lib/api';

type AuthFormProps = {
  // POST /signup or /login (backend/routes_auth.py): both take {email, password} and return {token}
  endpoint: '/signup' | '/login';
  eyebrow: string;
  title: string;
  submitLabel: string;
  busyLabel: string;
  switchPrompt: string;
  switchTo: string;
  switchLabel: string;
};

const INPUT = 'mt-2 h-11 w-full rounded-[10px] border border-border bg-surface-raised px-3.5 text-[15px] text-fg '
  + 'placeholder:text-fg-muted transition-colors focus:border-accent focus:outline-none';

// The Login and Signup pages: email and password, then on to Setup with the token stored. A failure shows the
// backend's message ("Invalid email or password", "Email already registered") under the fields
export default function AuthForm({ endpoint, eyebrow, title, submitLabel, busyLabel, switchPrompt, switchTo,
  switchLabel }: AuthFormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: nothing to do here
  if (getToken()) return <Navigate to="/setup" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ email, password }) });
      if (!res.ok) {
        setError(await errorDetail(res, 'Something went wrong. Try again.'));
        return;
      }
      const { token } = await res.json();
      saveToken(token);
      navigate('/setup', { replace: true });
    } catch (err) {
      console.error(`${endpoint} failed:`, err);
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      actions={
        <Link to="/" className="rounded-md px-1 py-3 text-sm text-fg-secondary transition-colors hover:text-fg">
          Home
        </Link>
      }
    >
      <div className={`flex flex-1 items-center justify-center py-16 ${GUTTER}`}>
        <Card padding="lg" className="w-full max-w-[400px] animate-fade-up">
          <Eyebrow tone="accent">{eyebrow}</Eyebrow>
          <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em]">{title}</h1>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
            <label className="text-sm text-fg-secondary">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="text-sm text-fg-secondary">
              Password
              <input
                type="password"
                autoComplete={endpoint === '/signup' ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT}
              />
            </label>
            {error && <p role="alert" className="text-sm text-distracted">{error}</p>}
            <Button type="submit" size="lg" disabled={busy} className="mt-2 w-full">
              {busy ? busyLabel : submitLabel}
            </Button>
          </form>
          <p className="mt-6 text-sm text-fg-muted">
            {switchPrompt}{' '}
            <Link to={switchTo} replace className="text-fg-secondary underline-offset-4 hover:text-fg hover:underline">
              {switchLabel}
            </Link>
          </p>
        </Card>
      </div>
    </PageShell>
  );
}
