import React, { useState } from 'react';
import { useAuth } from '@/contexts/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

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
      await login(email);
      setMessage(
        'If this email is valid, a login link has been sent. Please check your email and click the link to sign in.'
      );
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

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
              className="w-full px-3 py-2 border border-border rounded-lg bg-bg-elevated text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
              placeholder="Email address"
              disabled={isLoading}
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
            disabled={isLoading}
            className="w-full py-2 px-4 bg-accent-primary hover:bg-accent-primary/80 disabled:bg-accent-primary/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
          >
            {isLoading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>

        <div className="text-center text-text-muted text-sm">
          <p>
            You'll receive a secure login link via email.{' '}
            <br />
            The first user to register becomes an admin.
          </p>
        </div>
      </div>
    </div>
  );
}