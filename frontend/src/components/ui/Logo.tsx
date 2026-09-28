import { Link } from 'react-router-dom';
import { colors } from '../../theme/tokens';

// The mark: a ring with the accent "pupil"
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke={colors.fg.DEFAULT} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.5" fill={colors.accent} />
    </svg>
  );
}

// Mark and wordmark, linking home
export default function Logo() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-3 rounded-md text-[17px] font-semibold tracking-tight text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <LogoMark />
      FocusAgent
    </Link>
  );
}
