import AuthForm from '../components/AuthForm';

const Signup = () => (
  <AuthForm
    endpoint="/signup"
    eyebrow="Get started"
    title="Create an account"
    submitLabel="Sign up"
    busyLabel="Creating account…"
    switchPrompt="Already have an account?"
    switchTo="/login"
    switchLabel="Log in"
  />
);

export default Signup;
