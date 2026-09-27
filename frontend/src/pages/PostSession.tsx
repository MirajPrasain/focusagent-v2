import FocusChart from '../report-comps/FocusChart';
import FocusDonutChart from '../report-comps/FocusDonutChart';
import StudyDebrief from '../components/StudyDebrief';
import PageShell from '../components/ui/PageShell';

const PostSession = () => {

  return (
    <PageShell wide>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Session complete</h1>
      <p className="mt-2 text-fg-secondary">How your focus went during this session.</p>

      <div className="mt-6 space-y-6">
        <StudyDebrief />
        <FocusChart />
        <FocusDonutChart />
      </div>
    </PageShell>
  );
};

export default PostSession;
