// focused / distracted / away ("Can't see you") are the live focus states; off: not tracking yet, or anymore
export type DotState = 'focused' | 'distracted' | 'away' | 'off';

const STATES: Record<DotState, string> = {
  focused: 'bg-accent',
  distracted: 'bg-distracted',
  away: 'bg-away',
  off: 'border border-fg-muted',
};

// The soft halo of `glow`
const GLOWS: Record<DotState, string> = {
  focused: 'ring-4 ring-accent/20',
  distracted: 'ring-4 ring-distracted/20',
  away: 'ring-4 ring-away/20',
  off: '',
};

const SIZES = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
};

export default function StatusDot({ state, size = 'md', glow = false }:
  { state: DotState; size?: keyof typeof SIZES; glow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full transition-colors duration-300 ${SIZES[size]} ${STATES[state]} ${glow ? GLOWS[state] : ''}`}
    />
  );
}
