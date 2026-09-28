import { Component, type ErrorInfo, type ReactNode } from 'react';

// Without an error boundary, a render error unmounts the whole React tree and leaves a blank page. This catches it and
// shows a way out. Reloading is the recovery: the pages that own a camera or a socket release them as they unmount
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page px-6 text-center text-fg">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-fg-secondary">Reload the page to start again.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent px-6 py-3 font-medium text-white transition-colors hover:bg-accent/90"
        >
          Reload
        </button>
      </div>
    );
  }
}
