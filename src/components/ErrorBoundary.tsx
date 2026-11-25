import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-theme-canvas p-6 text-slate-900 dark:text-slate-100">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-theme-surface p-6 shadow-lg dark:border-rose-900/60">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="font-display text-lg font-bold">Application Recovery</h2>
            </div>
            <p className="mt-2 break-words text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-theme-accent px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reload Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
