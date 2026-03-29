'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

export default function OnboardStudentPage() {
  const router = useRouter();
  const { apiFetch } = useAuthContext();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [billingRegion, setBillingRegion] = useState<'india' | 'international'>('india');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) { setError('Name and email are required.'); return; }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({ email, displayName: name, phone, guardianName, billingRegion }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to add student.');
        return;
      }

      setSuccess(`${name} added as student! They can now sign in with ${email}.`);
      setName(''); setEmail(''); setPhone(''); setGuardianName('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <button onClick={() => router.push('/admin/students')} className="text-sm text-saffron-700 hover:underline mb-2">
          ← Back to Students
        </button>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Add New Student</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create a student account. They can sign in with Google or set a password via &quot;Forgot Password&quot;.
        </p>
        <div className="mt-3 rounded-lg bg-saffron-50 border border-saffron-200 px-4 py-3">
          <p className="text-xs text-saffron-800">
            Our syllabus follows{' '}
            <a
              href="https://www.amazon.in/dp/B0DFHZG1J6"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-saffron-700 hover:underline"
            >
              Ganamrutha Bodhini by A.S. Panchapakesa Iyer
            </a>
            . Students are encouraged to purchase a copy for reference.
          </p>
        </div>
      </div>

      {success && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Student's full name" className="input" required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Email *</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="student@email.com" className="input" required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="+91 9876543210" className="input" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Guardian Name</label>
          <input type="text" value={guardianName} onChange={e => setGuardianName(e.target.value)}
            placeholder="Parent/guardian name (if minor)" className="input" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Billing Region</label>
          <div className="flex gap-4">
            {(['india', 'international'] as const).map(region => (
              <label key={region} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="region" value={region}
                  checked={billingRegion === region}
                  onChange={() => setBillingRegion(region)}
                  className="accent-saffron-600" />
                <span className="text-sm capitalize">{region}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Adding Student…' : 'Add Student'}
        </button>
      </form>
    </div>
  );
}
