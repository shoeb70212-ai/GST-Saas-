import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ 
  title = "Something went wrong", 
  message = "We couldn't load this data. Please check your connection and try again.", 
  onRetry 
}: ErrorStateProps) {
  return (
    <div 
      className="card p-8 border-error/20 bg-error-subtle flex flex-col items-center justify-center text-center max-w-md mx-auto my-8"
      role="alert"
      aria-live="assertive"
    >
      <AlertTriangle className="w-12 h-12 text-error mb-4" />
      <h3 className="text-xl font-bold text-text-primary mb-2">{title}</h3>
      <p className="text-sm text-text-secondary mb-6">{message}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  );
}
