import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    window.location.href = '/';
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-lg glass-panel rounded-3xl border border-destructive/30 p-6 sm:p-8 shadow-2xl text-center space-y-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
            {/* Icon Header */}
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center text-destructive">
              <ShieldAlert className="w-7 h-7" />
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Something didn't load right
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An unexpected interface error occurred in this section. Your workspace data is safe in the cloud.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Reload Workspace
              </button>
              <button
                onClick={this.handleGoHome}
                className="w-full sm:w-auto px-5 py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold rounded-xl flex items-center justify-center gap-2 border border-border transition-all cursor-pointer"
              >
                <Home className="w-4 h-4" /> Go to Dashboard
              </button>
            </div>

            {/* Stack trace toggle for developers */}
            {this.state.error && (
              <div className="pt-4 border-t border-border/50 text-left">
                <button
                  onClick={this.toggleDetails}
                  className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors font-mono cursor-pointer py-1"
                >
                  <span>Technical Diagnostics</span>
                  {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {this.state.showDetails && (
                  <pre className="mt-2.5 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-red-400 font-mono overflow-x-auto max-h-48 leading-relaxed whitespace-pre-wrap select-text">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
