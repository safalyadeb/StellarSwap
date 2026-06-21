'use client';

import { Component, ReactNode } from 'react';
import { initMonitoring, captureError } from '../lib/monitoring';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * App-wide React error boundary. Initialises monitoring on mount, reports any
 * uncaught render error to Sentry (no-op without a DSN), and shows a friendly
 * recovery screen instead of a white page or raw stack trace.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  componentDidMount() {
    initMonitoring();
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    captureError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="card p-8 max-w-md">
          <h1 className="text-xl font-semibold text-txt-primary mb-2">Something went wrong</h1>
          <p className="text-txt-tertiary text-sm mb-6">
            An unexpected error occurred. Your funds are safe — no transaction was sent.
            Try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-pink w-full py-3"
          >
            Reload StellarSwap
          </button>
        </div>
      </div>
    );
  }
}
