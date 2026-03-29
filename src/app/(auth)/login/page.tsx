/**
 * Login page — beautiful split-panel design matching brand aesthetic.
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthContext } from '@/components/layout/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const { loginWithEmail, loginWithGoogle } = useAuthContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRedirect = (userRole: string | null) => {
    if (redirect) router.push(redirect);
    else if (userRole === 'super_admin') router.push('/admin');
    else if (userRole === 'teacher') router.push('/teacher');
    else router.push('/student');
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await loginWithEmail(email, password);
      const tokenResult = await user.getIdTokenResult();
      handleRedirect(tokenResult.claims.role as string || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message.includes('auth/') ? 'Invalid email or password.' : message);
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const user = await loginWithGoogle();
      const tokenResult = await user.getIdTokenResult();
      handleRedirect(tokenResult.claims.role as string || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google login failed';
      if (!message.includes('popup-closed')) setError(message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — decorative brand side */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #7c2d12 0%, #b45309 40%, #d97706 70%, #92400e 100%)' }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-[-80px] left-[-80px] w-96 h-96 rounded-full border-4 border-white" />
          <div className="absolute bottom-[-60px] right-[-60px] w-80 h-80 rounded-full border-4 border-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-white" />
        </div>
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}
        />

        <div className="relative z-10 text-center px-12">
          <Image
            src="/logo.png" alt="Sangeeta Gurukulam"
            width={280} height={280}
            className="mx-auto drop-shadow-2xl" priority
          />
          <h1 className="mt-8 text-3xl font-bold text-white tracking-wide">Sangeeta Gurukulam</h1>
          <p className="mt-3 text-amber-200 text-lg font-medium">సంగీత గురుకులం</p>
          <div className="mt-6 flex items-center justify-center gap-3 text-amber-100 text-sm">
            <span>Carnatic Classical</span>
            <span className="text-amber-400">•</span>
            <span>Devotional Bhajans</span>
            <span className="text-amber-400">•</span>
            <span>Daily Bhajan Time</span>
          </div>

          <blockquote className="mt-10 bg-white/10 rounded-2xl p-6 backdrop-blur-sm text-left">
            <p className="text-amber-100 text-sm italic leading-relaxed">
              "Music is the shorthand of emotion — and in Carnatic tradition, every swara is a step closer to the divine."
            </p>
          </blockquote>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12"
        style={{ background: 'linear-gradient(180deg, #fffbf0 0%, #fef3c7 100%)' }}
      >
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <Image src="/logo.png" alt="Sangeeta Gurukulam" width={100} height={100} className="mx-auto" />
            <h1 className="mt-3 text-xl font-bold text-amber-900">Sangeeta Gurukulam</h1>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-amber-900">Welcome Back</h2>
            <p className="mt-2 text-amber-700 text-sm">Continue your musical journey</p>
          </div>

          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
              <span className="text-red-500 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleGoogleLogin} disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border-2 border-amber-300 bg-white text-gray-700 font-semibold text-sm hover:bg-amber-50 hover:border-amber-400 transition-all duration-200 shadow-sm mb-6"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-amber-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-amber-50 px-4 text-xs text-amber-600 font-medium">or sign in with email</span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-amber-900 mb-1.5">
                Email Address
              </label>
              <input
                id="email" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 rounded-xl border-2 border-amber-200 bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-amber-900">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-amber-600 hover:text-amber-800 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password" type="password" required minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full px-4 py-3 rounded-xl border-2 border-amber-200 bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all"
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-white text-sm tracking-wide transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: loading ? '#9ca3af' : 'linear-gradient(135deg, #b45309 0%, #d97706 100%)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-amber-700">
            New student?{' '}
            <Link href="/register" className="font-bold text-amber-900 hover:underline">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
