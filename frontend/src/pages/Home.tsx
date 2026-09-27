import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import PageShell from '../components/ui/PageShell';

const Home = () => {
  const navigate = useNavigate();

  return (
    <PageShell header={false}>
      <div className="pt-24">
        <h1 className="text-3xl font-semibold tracking-tight">FocusAgent</h1>
        <p className="mt-3 text-fg-secondary">
          Watches whether your eyes stay on your screen while you work, and shows how focused you stayed.
        </p>
        <p className="mt-2 text-sm text-fg-muted">Video never leaves your device.</p>
        <Button className="mt-8" onClick={() => navigate('/setup')}>Start a session</Button>
      </div>
    </PageShell>
  );
};

export default Home;
