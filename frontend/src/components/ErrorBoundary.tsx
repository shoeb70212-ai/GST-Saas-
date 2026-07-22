import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_KEY = 'khatalens_chunk_reload';

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = `${error.name} ${error.message}`;
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // After a deploy, browsers can hold a stale module graph while hashed chunks
    // are replaced (502 / missing file). One hard reload usually recovers.
    if (isChunkLoadError(error)) {
      try {
        const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
        if (!alreadyReloaded) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
          return;
        }
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // sessionStorage may be blocked; fall through to the UI reload button
      }
    }
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const chunkError = isChunkLoadError(this.state.error);
      return (
        <div 
          className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-4 text-text-primary"
          role="alert"
          aria-live="assertive"
        >
          <div className="card max-w-md w-full text-center border-error/20 bg-error-subtle">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6" aria-hidden="true">
              <AlertTriangle className="w-8 h-8 text-error" />
            </div>
            <h1 className="text-2xl font-bold mb-4 font-display">Application Error</h1>
            <p className="text-text-secondary mb-8 text-sm">
              {chunkError
                ? 'A new version of KhataLens was just deployed. Reload to load the latest app files.'
                : 'An unexpected error occurred. Our team has been notified. Please try refreshing the page.'}
            </p>
            <button
              onClick={this.handleReload}
              className="btn-primary w-full flex items-center justify-center gap-2"
              aria-label="Reload application"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
            
            {/* Development-only error details */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-8 w-full text-left bg-black/5 p-4 rounded-lg overflow-auto">
                <p className="text-sm font-mono text-error font-bold mb-2">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
