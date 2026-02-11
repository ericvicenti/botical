import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { login, pollLogin } = useAuth();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startPolling = async (loginToken: string) => {
    setIsPolling(true);
    setMessage('Check your email and click the magic link to sign in...');
    
    // Set 15 minute timeout
    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setError('Login timeout. Please try again.');
    }, 15 * 60 * 1000);
    
    // Poll every 2 seconds
    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await pollLogin(loginToken);
        
        if (result.status === 'completed') {
          stopPolling();
          setMessage('Login successful! Redirecting...');
          // Auth context will handle the redirect after checkAuth
        }
      } catch (err) {
        console.error('Poll error:', err);
        // Continue polling on errors (network issues, etc.)
      }
    }, 2000);
  };
  
  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setIsPolling(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      const loginToken = await login(email);
      setEmail('');
      await startPolling(loginToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="max-w-md w-full space-y-8 p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Welcome to Botical
          </h1>
          <p className="text-text-secondary">
            Enter your email to receive a magic login link
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-3 border border-border rounded-lg bg-bg-elevated text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent text-base"
              placeholder="Email address"
              disabled={isLoading || isPolling}
            />
          </div>

          {error && (
            <div className="text-accent-error text-sm bg-accent-error/10 border border-accent-error/20 rounded p-3">
              {error}
            </div>
          )}

          {message && (
            <div className="text-accent-success text-sm bg-accent-success/10 border border-accent-success/20 rounded p-3">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || isPolling}
            className="w-full py-3 px-4 bg-accent-primary hover:bg-accent-primary/80 disabled:bg-accent-primary/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 text-base"
          >
            {isLoading ? 'Sending...' : isPolling ? 'Waiting for login...' : 'Send Magic Link'}
          </button>
          
          {isPolling && (
            <button
              type="button"
              onClick={stopPolling}
              className="w-full py-3 px-4 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors mt-2 text-base"
            >
              Cancel
            </button>
          )}
        </form>

        <div className="text-center text-text-muted text-sm">
          <p>
            You'll receive a secure login link via email.
          </p>
        </div>
      </div>
    </div>
  );
}