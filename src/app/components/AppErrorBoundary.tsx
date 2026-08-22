import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorCode: string | null;
  // Shown on screen so a crash reports itself instead of only living in a
  // console nobody has open.
  errorMessage: string | null;
  errorStack: string | null;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorCode: null,
    errorMessage: null,
    errorStack: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    const errorCode = typeof (error as Error & { code?: unknown }).code === 'string'
      ? (error as Error & { code: string }).code
      : 'APP_SHELL_RENDER_ERROR';

    return {
      hasError: true,
      errorCode,
      errorMessage: error.message || String(error),
      errorStack: (error.stack ?? '').split('\n').slice(0, 4).join('\n'),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary caught render error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3">
            <h1 className="text-2xl font-semibold">Something broke after login</h1>
            <p className="text-sm text-muted-foreground">
              The app shell crashed while loading. Use a safer route while the map is being fixed.
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Error code: {this.state.errorCode ?? 'APP_SHELL_RENDER_ERROR'}
            </p>
            {this.state.errorMessage ? (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/50 p-3 text-left font-mono text-[11px] leading-snug text-white/70">
                {this.state.errorMessage}
                {this.state.errorStack ? `\n${this.state.errorStack}` : ''}
              </pre>
            ) : null}
            <a className="underline" href="/feed">
              Open Feed
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
