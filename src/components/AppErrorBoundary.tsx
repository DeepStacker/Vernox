/**
 * Last line of defence for the whole app: a render error or a missing code chunk shows a way forward instead of a
 * blank page. Self-contained (no store layout, no data hooks), because those may be what failed.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, reloadForNewBuild } from '@/lib/app/staleBuild';

type Props = { children: ReactNode; resetKey: string };
type State = { error: Error | null; resetKey: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  // Navigating away from the broken page clears the error.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadForNewBuild()) return;
    console.error('[app] render failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isChunkLoadError(error);
    return (
      <main role="alert" className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md text-center">
          <p className="eyebrow">{stale ? 'Update available' : 'Something went wrong'}</p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">
            {stale ? 'Vernox was just updated' : 'This page could not be shown'}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {stale
              ? 'Reload to get the latest version. Your cart is saved on this device.'
              : 'Please reload. If it happens again, go back to the home page; your cart is saved on this device.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn-primary min-h-11" onClick={() => window.location.reload()}>Reload</button>
            <a href="/" className="btn-secondary min-h-11">Home</a>
          </div>
        </div>
      </main>
    );
  }
}
