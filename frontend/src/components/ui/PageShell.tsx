import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// A centered column with the small "FocusAgent" header. wide: room for charts
export default function PageShell({ children, wide = false, header = true }:
  { children: ReactNode; wide?: boolean; header?: boolean }) {
  return (
    <div className="min-h-screen bg-page text-fg">
      <div className={`mx-auto w-full px-4 ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        {header && (
          <header className="py-5">
            <Link to="/" className="text-sm font-semibold tracking-tight text-fg hover:text-fg-secondary transition-colors">
              FocusAgent
            </Link>
          </header>
        )}
        <main className="pb-16">{children}</main>
      </div>
    </div>
  );
}
