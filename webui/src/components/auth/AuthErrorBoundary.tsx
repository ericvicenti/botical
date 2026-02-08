import { Component, ErrorInfo, ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';

interface Props {
  children: ReactNode;
  onAuthError?: () => void;
}

interface State {
  hasError: boolean;
  isAuthError: boolean;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isAuthError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's an authentication error
    const isAuthError = error instanceof ApiError && 
                       error.data?.error?.code === 'AUTHENTICATION_ERROR';
    
    return {
      hasError: true,
      isAuthError,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Auth error boundary caught an error:', error, errorInfo);
    
    if (this.state.isAuthError) {
      // Trigger auth recheck
      this.props.onAuthError?.();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isAuthError) {
        // Let the auth context handle the redirect
        return null;
      }
      
      // Other errors - show a generic error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-primary">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-text-primary mb-4">
              Something went wrong
            </h2>
            <p className="text-text-secondary mb-4">
              We encountered an unexpected error. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/80 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AuthErrorBoundary;