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
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg.includes('auth/user-disabled')) setError('This account has been disabled. Please contact the administrator.');
      else if (msg.includes('auth/')) setError('Invalid email or password.');
      else setError(msg);
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const user = await loginWithGoogle();
      const tokenResult = await user.getIdTokenResult();
      handleRedirect(tokenResult.claims.role as string || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google login failed';
      if (msg.includes('auth/user-disabled')) setError('This account has been disabled. Please contact the administrator.');
      else if (!msg.includes('popup-closed')) setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#0a1628' }}>
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-5/12 flex-col items-center justify-center relative px-12"
        style={{ background: 'linear-gradient(160deg, #0a1628 0%, #0d3b2e 40%, #1a4a3a 70%, #0a1628 100%)' }}>
        <div className="absolute top-20 left-20 w-40 h-40 rounded-full opacity-10"
          style={{ border: '1px solid #22c55e' }} />
        <div className="absolute bottom-24 right-12 w-28 h-28 rounded-full opacity-10"
          style={{ border: '1px solid #22c55e' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full opacity-5"
          style={{ border: '1px solid #22c55e' }} />

        <div className="relative z-10 text-center">
          <Image src="/logo.png" alt="Sangeeta Gurukulam" width={240} height={240}
            className="mx-auto drop-shadow-2xl" priority />
          <h1 className="mt-8 text-2xl font-light tracking-[0.15em] uppercase"
            style={{ color: '#f5deb3', fontFamily: 'Georgia, serif' }}>
            Sangeeta Gurukulam
          </h1>
          <p className="mt-2 text-base tracking-wide" style={{ color: '#d97706' }}>
            సంగీత గురుకులం
          </p>
          <div className="mt-8 flex items-center justify-center gap-4 text-xs tracking-widest uppercase"
            style={{ color: '#a16207' }}>
            <span>Live Classes</span>
            <span style={{ color: '#d97706' }}>✦</span>
            <span>Daily Bhajans</span>
          </div>
          <div className="mt-12 w-px h-16 mx-auto opacity-20" style={{ background: '#22c55e' }} />
        </div>
      </div>

      {/* Right — form panel */}
      <div className="w-full lg:w-7/12 flex items-center justify-center px-8 py-16"
        style={{ background: '#fdf6ec' }}>
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <Image src="/logo.png" alt="Sangeeta Gurukulam" width={80} height={80} className="mx-auto" />
            <p className="mt-3 text-xs tracking-widest uppercase" style={{ color: '#92400e' }}>Sangeeta Gurukulam</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-light" style={{ color: '#1c0a00', fontFamily: 'Georgia, serif' }}>
              Welcome back
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#92400e' }}>Sign in to continue your journey</p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg text-sm" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          {/* Google */}
          <button onClick={handleGoogleLogin} disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 mb-5"
            style={{ background: '#fff', border: '1.5px solid #e5d5b0', color: '#3c1a00' }}
            onMouseOver={e => (e.currentTarget.style.borderColor = '#d97706')}
            onMouseOut={e => (e.currentTarget.style.borderColor = '#e5d5b0')}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px" style={{ background: '#e5d5b0' }} />
            <span className="text-xs tracking-widest uppercase" style={{ color: '#a16207' }}>or</span>
            <div className="flex-1 h-px" style={{ background: '#e5d5b0' }} />
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold tracking-widest uppercase mb-2"
                style={{ color: '#7c2d12' }}>Email</label>
              <input id="email" type="email" required value={email}
                onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all duration-200"
                style={{ background: '#fff', border: '1.5px solid #e5d5b0', color: '#1c0a00' }}
                onFocus={e => (e.target.style.borderColor = '#d97706')}
                onBlur={e => (e.target.style.borderColor = '#e5d5b0')} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-xs font-semibold tracking-widest uppercase"
                  style={{ color: '#7c2d12' }}>Password</label>
                <Link href="/forgot-password" className="text-xs underline opacity-60 hover:opacity-100"
                  style={{ color: '#7c2d12' }}>Forgot?</Link>
              </div>
              <input id="password" type="password" required minLength={6} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="Your password"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all duration-200"
                style={{ background: '#fff', border: '1.5px solid #e5d5b0', color: '#1c0a00' }}
                onFocus={e => (e.target.style.borderColor = '#d97706')}
                onBlur={e => (e.target.style.borderColor = '#e5d5b0')} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-lg text-sm font-semibold tracking-widest uppercase transition-all duration-200 mt-2"
              style={{ background: loading ? '#d1d5db' : 'linear-gradient(135deg, #92400e, #b45309)', color: '#fff' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs" style={{ color: '#92400e' }}>
            New student?{' '}
            <Link href="/register" className="font-semibold underline" style={{ color: '#7c2d12' }}>Register here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
