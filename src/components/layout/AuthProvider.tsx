/**
 * AuthProvider — wraps the app to provide auth context to all pages.
 * Placed in the root layout so all client components can useAuthContext().
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useAuth, type AuthState } from '@/lib/auth/useAuth';
import type { User as FirebaseUser } from 'firebase/auth';
import type { UserRole } from '@/domain/enums';

interface AuthContextType extends AuthState {
  loginWithEmail: (email: string, password: string) => Promise<FirebaseUser>;
  registerWithEmail: (email: string, password: string) => Promise<FirebaseUser>;
  loginWithGoogle: () => Promise<FirebaseUser>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth as AuthContextType}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
