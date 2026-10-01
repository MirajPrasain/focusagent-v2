import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearToken, getToken } from '../lib/api';

const LINK = 'rounded-md px-2 py-3 text-sm text-fg-secondary transition-colors hover:text-fg focus-visible:outline '
  + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

// For a page header's actions: History and Log out when signed in, Log in when not
export default function AccountActions() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!getToken()) {
    return <Link to="/login" className={LINK}>Log in</Link>;
  }

  const logOut = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {pathname !== '/history' && <Link to="/history" className={LINK}>History</Link>}
      <button type="button" onClick={logOut} className={LINK}>Log out</button>
    </>
  );
}
