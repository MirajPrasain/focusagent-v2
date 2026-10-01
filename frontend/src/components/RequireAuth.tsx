import { Navigate, Outlet } from 'react-router-dom';
import { getToken } from '../lib/api';

// Wraps the routes that need a signed-in user: without a stored token they go to /login instead
export default function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />;
}
