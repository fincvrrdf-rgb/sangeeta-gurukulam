/**
 * lib/auth/useAuth.ts
 *
 * Client-side auth hook. Provides the current user state,
 * login/logout functions, and role information.
 *
 * This hook manages:
 *   - Firebase Auth state listener
 *   - ID token refresh and custom claims extraction
 *   - __session cookie for middleware route protection
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase/client';
import type { UserRole } from '@/domain/enums';

export interface AuthState {
  user: FirebaseUser | null;
  role: UserRole | null;
  loading: boolean;
  idToken: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
    idToken: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const tokenResult = await user.getIdTokenResult();
        const role = (tokenResult.claims.role as UserRole) || null;
        const idToken = tokenResult.token;

        // Set cookie for middleware route protection
        document.cookie = `__session=${idToken}; path=/; max-age=3600; SameSite=Lax`;

        setState({ user, role, loading: false, idToken });
      } else {
        // Clear cookie
        document.cookie = '__session=; path=/; max-age=0';
        setState({ user: null, role: null, loading: false, idToken: null });
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  }, []);

  const logout = useCallback(async () => {
    document.cookie = '__session=; path=/; max-age=0';
    await signOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  /**
   * Helper to make authenticated API calls.
   * Automatically attaches the Bearer token.
   */
  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!state.idToken) throw new Error('Not authenticated');

    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.idToken}`,
        ...options.headers,
      },
    });
  }, [state.idToken]);

  return {
    ...state,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logout,
    resetPassword,
    apiFetch,
  };
}
