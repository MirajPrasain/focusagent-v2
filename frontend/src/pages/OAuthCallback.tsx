import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '../components/ui/PageShell';
import { saveToken } from '../lib/api';

// Where the backend's Google sign-in (GET /auth/google/callback, backend/routes_auth.py) lands with #token=<jwt>:
// the same token /login returns, sent in the fragment so it never reaches a server log. Stores it and goes on to
// Setup, or to /login if there's none. replace drops this URL, token and all, from the history
const OAuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (token) {
      saveToken(token);
      navigate('/setup', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return (
    <PageShell>
      <div className="flex flex-1 items-center justify-center">
        <p role="status" className="text-fg-secondary">Signing you in…</p>
      </div>
    </PageShell>
  );
};

export default OAuthCallback;
