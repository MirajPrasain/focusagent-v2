import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Crosshair, Lock } from 'lucide-react';
import AccountActions from '../components/AccountActions';
import Button from '../components/ui/Button';
import Eyebrow from '../components/ui/Eyebrow';
import PageShell, { GUTTER } from '../components/ui/PageShell';
import SegmentBar, { type BarSegment } from '../components/ui/SegmentBar';
import StatusDot from '../components/ui/StatusDot';
import { colors } from '../theme/tokens';

const POINTS = [
  { icon: Lock, title: 'Video stays here', detail: 'Frames are read in your browser' },
  { icon: Crosshair, title: 'Calibrated to you', detail: 'A 10-second scan of your screen' },
  { icon: BarChart3, title: 'An honest summary', detail: 'Minutes focused, longest stretch' },
];

// Illustration only: a made-up five minutes for the hero's focus bar
const SAMPLE_STRIP: BarSegment[] = [
  { key: 0, left: 0, width: 34, tone: 'focused' },
  { key: 1, left: 34, width: 4, tone: 'distracted' },
  { key: 2, left: 38, width: 48, tone: 'focused' },
  { key: 3, left: 86, width: 3, tone: 'distracted' },
  { key: 4, left: 89, width: 11, tone: 'focused' },
];

// The hero's picture of the idea: a gaze trace inside a screen outline, with one glance away below it
function GazeIllustration() {
  const { accent, distracted, border, fg } = colors;
  return (
    <svg viewBox="0 0 560 400" fill="none" aria-hidden="true" className="mt-4 block h-auto w-full">
      <rect x="20" y="10" width="520" height="310" rx="12" stroke={border.strong} />
      <path d="M20 40V22a12 12 0 0 1 12-12h18" stroke={accent} strokeWidth="1.5" />
      <path d="M510 10h18a12 12 0 0 1 12 12v18" stroke={accent} strokeWidth="1.5" />
      <path d="M540 290v18a12 12 0 0 1-12 12h-18" stroke={accent} strokeWidth="1.5" />
      <path d="M50 320H32a12 12 0 0 1-12-12v-18" stroke={accent} strokeWidth="1.5" />
      <path
        d="M70 250 C 110 200 150 100 220 120 S 320 210 370 170 S 460 70 490 110 S 470 250 400 262 S 300 240 290 290"
        stroke={accent} strokeOpacity="0.75" strokeWidth="1.6" strokeLinecap="round"
      />
      <path d="M290 290 C 286 320 298 352 318 372" stroke={distracted} strokeWidth="1.6" strokeDasharray="4 5" strokeLinecap="round" />
      <circle cx="318" cy="372" r="4" fill={distracted} />
      <text x="332" y="376" fill={distracted} fontFamily="Geist Mono, monospace" fontSize="11">looking down · 0:14</text>
      <circle cx="370" cy="170" r="18" fill={accent} fillOpacity="0.14" />
      <circle cx="370" cy="170" r="6" fill={fg.DEFAULT} />
    </svg>
  );
}

const Home = () => {
  const navigate = useNavigate();

  return (
    <PageShell
      actions={
        <>
          <span className="hidden items-center gap-2 rounded-full border border-border px-3.5 py-2 font-mono text-xs text-fg-secondary sm:inline-flex">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Runs on your device
          </span>
          <AccountActions />
        </>
      }
    >
      <div className={`grid flex-1 items-center gap-16 py-16 lg:grid-cols-[1.15fr_1fr] 2xl:pl-28 ${GUTTER}`}>
        <div className="animate-fade-up">
          <Eyebrow tone="accent">On-device focus tracking</Eyebrow>
          <h1 className="mt-7 text-[clamp(44px,4.8vw,88px)] font-medium leading-[0.98] tracking-[-0.045em]">
            Stay on the work.
            <span className="mt-2 block font-serif font-normal italic tracking-[-0.02em] text-fg-secondary">
              We’ll notice when you don’t.
            </span>
          </h1>
          <p className="mt-8 max-w-[520px] text-lg leading-relaxed text-fg-secondary sm:text-xl">
            FocusAgent follows where your eyes are while you work, then shows how much of the session you actually
            stayed on screen.
          </p>
          <div className="mt-11 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Button size="lg" onClick={() => navigate('/setup')}>
              Start a session
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <span className="font-mono text-[13px] text-fg-muted">25 · 50 · 90 min, or your own</span>
          </div>
          <ul className="mt-14 grid gap-6 border-t border-border-subtle pt-7 sm:grid-cols-3 sm:gap-8">
            {POINTS.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" strokeWidth={1.8} aria-hidden="true" />
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="mt-1 text-[13px] text-fg-muted">{detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex animate-fade-up flex-col gap-4 [animation-delay:120ms]" aria-hidden="true">
          <div className="rounded-[20px] border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <Eyebrow>Live gaze · Main screen</Eyebrow>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                <StatusDot state="focused" size="sm" glow />
                Focused
              </span>
            </div>
            <GazeIllustration />
          </div>
          <div className="rounded-2xl border border-border bg-surface px-5 py-[18px]">
            <div className="flex justify-between">
              <Eyebrow>Last 5 minutes</Eyebrow>
              <Eyebrow>92% focused</Eyebrow>
            </div>
            <SegmentBar segments={SAMPLE_STRIP} className="mt-3.5 h-2.5 rounded-full" />
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default Home;
