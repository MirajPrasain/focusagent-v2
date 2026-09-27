// focused / distracted / away ("Can't see you") are the live focus states; off: not tracking yet, or anymore
export type DotState = 'focused' | 'distracted' | 'away' | 'off';

const STATES: Record<DotState, string> = {
  focused: 'bg-accent',
  distracted: 'bg-distracted',
  away: 'bg-away',
  off: 'border border-fg-muted',
};

const SIZES = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
};

export default function StatusDot({ state, size = 'md' }: { state: DotState; size?: keyof typeof SIZES }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full ${SIZES[size]} ${STATES[state]}`} />;
}
