import type { ReactNode } from 'react';
import Logo from './Logo';

type PageShellProps = {
  children: ReactNode;
  // Top bar: the logo at the left, then `center` (hidden on narrow screens) and `actions` at the right
  header?: boolean;
  center?: ReactNode;
  actions?: ReactNode;
  // A bottom bar under a hairline rule, for the page's main action
  footer?: ReactNode;
};

export const GUTTER = 'px-4 sm:px-10 lg:px-16';

// The full-viewport frame every page sits in
export default function PageShell({ children, header = true, center, actions, footer }: PageShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-page text-fg">
      {header && (
        <header className={`grid grid-cols-[1fr_auto] items-center gap-6 border-b border-border-subtle py-5 md:grid-cols-[1fr_auto_1fr] ${GUTTER}`}>
          <div><Logo /></div>
          {center ? <div className="hidden md:block">{center}</div> : <div className="hidden md:block" />}
          <div className="flex items-center justify-end gap-2">{actions}</div>
        </header>
      )}
      <main className="flex flex-1 flex-col">{children}</main>
      {footer && (
        <footer className={`flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle py-5 ${GUTTER}`}>
          {footer}
        </footer>
      )}
    </div>
  );
}
