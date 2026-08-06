import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorCode: string | null;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false, errorCode: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    const errorCode = typeof (error as Error & { code?: unknown }).code === 'string'
      ? (error as Error & { code: string }).code
      : 'APP_SHELL_RENDER_ERROR';

    return { hasError: true, errorCode };
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
