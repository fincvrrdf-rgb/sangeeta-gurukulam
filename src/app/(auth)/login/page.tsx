/**
 * Login page — Email/Password and Google OAuth sign-in.
 * Redirects to role-appropriate dashboard after authentication.
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { Logo } from '@/components/ui/Logo';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const { loginWithEmail, loginWithGoogle, role } = useAuthContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRedirect = (userRole: string | null) => {
    if (redirect) {
      router.push(redirect);
    } else if (userRole === 'super_admin') {
      router.push('/admin');
    } else if (userRole === 'teacher') {
      router.push('/teacher');
    } else {
      router.push('/student');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await loginWithEmail(email, password);
      const tokenResult = await user.getIdTokenResult();
      handleRedirect(tokenResult.claims.role as string || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message.includes('auth/') ? 'Invalid email or password.' : message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const user = await loginWithGoogle();
      const tokenResult = await user.getIdTokenResult();
      handleRedirect(tokenResult.claims.role as string || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google login failed';
      if (!message.includes('popup-closed')) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo className="justify-center mb-4" />
          <p className="text-gray-600 text-sm">
            Carnatic Devotional Music Classes
          </p>
        </div>

        <div className="card">
          <h2 className="section-title text-center mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="my-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            onClick={handleGoogleLogin}
            className="btn-secondary w-full"
            disabled={loading}
          >
            Sign in with Google
          </button>

          <div className="mt-6 text-center text-sm text-gray-600 space-y-2">
            <p>
              <Link href="/forgot-password" className="text-saffron-700 hover:underline">
                Forgot your password?
              </Link>
            </p>
            <p>
              New student?{' '}
              <Link href="/register" className="text-saffron-700 hover:underline">
                Register here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
