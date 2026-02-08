import React from 'react';
import { useAuth } from '@/contexts/auth';
import LoginPage from './LoginPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, mode } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // In single-user mode, always allow access
  if (mode === 'single-user') {
    return <>{children}</>;
  }

  // In multi-user mode, check authentication
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;