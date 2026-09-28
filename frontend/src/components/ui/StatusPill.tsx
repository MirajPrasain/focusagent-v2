import type { ReactNode } from 'react';
import StatusDot, { type DotState } from './StatusDot';

type StatusPillProps = {
  state: DotState;
  label: ReactNode;
  // Shown after the label, in the secondary color
  detail?: ReactNode;
  className?: string;
};

// A glowing dot and label in a rounded pill. Not a live region: wrap it in one where it changes
export default function StatusPill({ state, label, detail, className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-3 rounded-full border border-border bg-page/70 py-2.5 pl-4 pr-5 text-sm backdrop-blur ${className}`}
    >
      <StatusDot state={state} glow />
      <span className="font-medium text-fg">{label}</span>
      {detail && <span className="text-fg-secondary">· {detail}</span>}
    </span>
  );
}
