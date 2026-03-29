/**
 * Registration page — new students register with email/password or Google.
 * After registration, calls /api/auth/set-role to assign 'student' role.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { Logo } from '@/components/ui/Logo';

export default function RegisterPage() {
  const router = useRouter();
  const { registerWithEmail, loginWithGoogle } = useAuthContext();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const assignStudentRole = async (uid: string, userEmail: string, name: string, idToken: string) => {
    const res = await fetch('/api/auth/set-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        targetUserId: uid,
        role: 'student',
        displayName: name,
        email: userEmail,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to assign role');
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptTerms) {
      setError('Please accept the terms and privacy policy.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const user = await registerWithEmail(email, password);
      const idToken = await user.getIdToken();
      await assignStudentRole(user.uid, email, displayName, idToken);

      // Force token refresh to pick up the new custom claim
      await user.getIdToken(true);
      router.push('/student');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      if (message.includes('email-already-in-use')) {
        setError('This email is already registered. Please sign in instead.');
      } else if (message.includes('weak-password')) {
        setError('Password must be at least 6 characters.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    if (!acceptTerms) {
      setError('Please accept the terms and privacy policy.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const user = await loginWithGoogle();
      const idToken = await user.getIdToken();
      await assignStudentRole(
        user.uid,
        user.email || '',
        user.displayName || '',
        idToken
      );

      await user.getIdToken(true);
      router.push('/student');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google registration failed';
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
            Join Sangeeta Gurukulam
          </p>
        </div>

        <div className="card">
          <h2 className="section-title text-center mb-6">Register as Student</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailRegister} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>

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
                placeholder="At least 6 characters"
                required
                minLength={6}
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                id="terms"
                type="checkbox"
                className="mt-1"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <label htmlFor="terms" className="text-xs text-gray-600">
                I accept the{' '}
                <Link href="/terms" className="text-saffron-700 hover:underline">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" className="text-saffron-700 hover:underline">Privacy Policy</Link>.
                I understand that my class recordings will be stored securely for practice review.
              </label>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Registering...' : 'Register'}
            </button>
          </form>

          <div className="my-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            onClick={handleGoogleRegister}
            className="btn-secondary w-full"
            disabled={loading}
          >
            Register with Google
          </button>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already registered?{' '}
            <Link href="/login" className="text-saffron-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
