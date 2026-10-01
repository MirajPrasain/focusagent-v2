import AuthForm from '../components/AuthForm';

const Login = () => (
  <AuthForm
    endpoint="/login"
    eyebrow="Welcome back"
    title="Log in"
    submitLabel="Log in"
    busyLabel="Logging in…"
    switchPrompt="No account yet?"
    switchTo="/signup"
    switchLabel="Sign up"
  />
);

export default Login;
