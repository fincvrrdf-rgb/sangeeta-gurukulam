/**
 * Student Onboarding — /student/onboarding
 *
 * New students select their batch after registration.
 * Shows the 4 batch cards with schedule details.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

const BATCHES = [
  {
    code: 'A',
    label: 'Batch A',
    time: '5:30 AM – 6:30 AM IST',
    days: 'Monday & Wednesday',
    icon: '🌅',
    description: 'Morning batch — Mon & Wed',
  },
  {
    code: 'B',
    label: 'Batch B',
    time: '4:30 PM – 5:30 PM IST',
    days: 'Monday & Wednesday',
    icon: '🌇',
    description: 'Evening batch — Mon & Wed',
  },
  {
    code: 'C',
    label: 'Batch C',
    time: '5:30 AM – 6:30 AM IST',
    days: 'Tuesday & Thursday',
    icon: '🌅',
    description: 'Morning batch — Tue & Thu',
  },
  {
    code: 'D',
    label: 'Batch D',
    time: '4:30 PM – 5:30 PM IST',
    days: 'Tuesday & Thursday',
    icon: '🌇',
    description: 'Evening batch — Tue & Thu',
  },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { apiFetch } = useAuthContext();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/student/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchCode: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save batch selection.');
      }
      router.push('/student');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(160deg, #0a1628 0%, #0d3b2e 50%, #0a1628 100%)' }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-5xl">🎵</span>
          <h1 className="mt-4 text-2xl font-bold text-white font-heading">
            Welcome to Sangeeta Gurukulam
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Please select your class batch to get started
          </p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {BATCHES.map((batch) => (
            <button
              key={batch.code}
              onClick={() => setSelected(batch.code)}
              className="rounded-xl p-4 text-left transition-all duration-200 border-2"
              style={{
                background: selected === batch.code
                  ? 'rgba(180, 83, 9, 0.25)'
                  : 'rgba(255,255,255,0.07)',
                borderColor: selected === batch.code ? '#d97706' : 'rgba(255,255,255,0.12)',
                color: '#fff',
              }}
            >
              <span className="text-2xl block mb-2">{batch.icon}</span>
              <p className="font-semibold text-sm">{batch.label}</p>
              <p className="text-xs mt-1" style={{ color: '#fcd34d' }}>{batch.time}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{batch.days}</p>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selected || loading}
          className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wider uppercase transition-all duration-200"
          style={{
            background: selected && !loading
              ? 'linear-gradient(135deg, #92400e, #b45309)'
              : '#374151',
            color: '#fff',
            opacity: selected && !loading ? 1 : 0.6,
          }}
        >
          {loading ? 'Saving…' : selected ? `Confirm Batch ${selected}` : 'Select a batch above'}
        </button>

        <p className="text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Your teacher assigned you a batch — please confirm the right one. You can contact admin to change it later.
        </p>
      </div>
    </div>
  );
}
