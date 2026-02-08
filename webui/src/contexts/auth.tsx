import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/lib/api/client';
import { setGlobalAuthCheck } from '@/lib/auth/globalCheck';

export interface User {
  userId: string;
  email: string;
  isAdmin: boolean;
  canExecuteCode: boolean;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mode: 'single-user' | 'multi-user';
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'single-user' | 'multi-user'>('multi-user');

  const isAuthenticated = !!user;

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      // First check the auth mode
      const modeResponse = await apiClient<{
        mode: 'single-user' | 'multi-user';
        user?: User;
      }>('/auth/mode');

      setMode(modeResponse.mode);

      if (modeResponse.mode === 'single-user') {
        // In single-user mode, use the local user
        setUser(modeResponse.user || null);
      } else {
        // In multi-user mode, check if we have a valid session
        try {
          const meResponse = await apiClient<{ user: User }>('/auth/me');
          setUser(meResponse.user);
        } catch (error) {
          // Not authenticated or session expired
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string): Promise<void> => {
    try {
      await apiClient<{ success: boolean; message: string }>('/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(error.data.error.message);
      }
      throw new Error('Failed to send magic link');
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setUser(null);
      // Force a page reload to clear any cached data
      window.location.href = '/';
    }
  };

  useEffect(() => {
    checkAuth();
    // Register the checkAuth function globally for error handling
    setGlobalAuthCheck(checkAuth);
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    mode,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthProvider;