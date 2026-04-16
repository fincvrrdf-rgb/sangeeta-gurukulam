'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface BatchBand { id: string; code: string; name: string; }

export default function OnboardStudentPage() {
  const router = useRouter();
  const { apiFetch } = useAuthContext();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [billingRegion, setBillingRegion] = useState<'india' | 'international'>('india');
  const [isDependent, setIsDependent] = useState(false);
  const [dependentName, setDependentName] = useState('');
  const [batchBandId, setBatchBandId] = useState('');
  const [batches, setBatches] = useState<BatchBand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/batches').then(r => r.json()).then(d => setBatches(d.batches ?? [])).catch(() => {});
  }, [apiFetch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) { setError('Name and email are required.'); return; }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          email, displayName: name, phone, guardianName, billingRegion,
          isDependent, dependentName: isDependent ? dependentName : undefined,
          batchBandId: batchBandId || undefined,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to add student.');
        return;
      }

      // Redirect back to the students list and force a fresh fetch
      router.refresh();
      router.push('/admin/students?added=' + encodeURIComponent(name));
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

      {/* Class Guidelines — Dos and Don'ts */}
      <div className="card bg-gray-50 border-gray-200">
        <h2 className="font-heading text-sm font-semibold text-charcoal mb-3">Class Guidelines (shared with student on onboarding)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-green-700 mb-1.5">Do&apos;s</p>
            <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
              <li>Use headphones during class for better audio quality</li>
              <li>Join class on time (before scheduled start)</li>
              <li>Keep your mic muted until asked to sing</li>
              <li>Practice daily (minimum 15 minutes riyaz)</li>
              <li>Notify absence at least 6 hours before class</li>
              <li>Upload payment proof by the 5th of each month</li>
              <li>Keep the Ganamrutha Bodhini book handy during class</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-700 mb-1.5">Don&apos;ts</p>
            <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
              <li>Joining more than 15 minutes late counts as absent</li>
              <li>Do not skip classes without prior notification</li>
              <li>4 consecutive violations trigger compulsory payment</li>
              <li>Do not share Google Meet links with non-students</li>
              <li>Do not record or share class recordings without permission</li>
              <li>Do not use speakers — headphones are mandatory</li>
            </ul>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-3">
          Attendance is tracked automatically via Google Meet. No manual attendance needed.
        </p>
      </div>

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

        {/* Dependent / Parent-Child */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isDependent"
              checked={isDependent}
              onChange={(e) => setIsDependent(e.target.checked)}
              className="accent-saffron-600 w-4 h-4"
            />
            <label htmlFor="isDependent" className="text-sm font-medium text-charcoal cursor-pointer">
              Joining with a co-learner (shared session)
            </label>
          </div>
          {isDependent && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Co-learner&apos;s Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={dependentName}
                onChange={(e) => setDependentName(e.target.value)}
                placeholder="Co-learner's full name"
                className="input"
                required={isDependent}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                When this student joins a class, attendance is automatically recorded for the co-learner too.
              </p>
            </div>
          )}
        </div>

        {/* Batch Band Selection */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Assign to Batch</label>
          {batches.length === 0 ? (
            <p className="text-xs text-orange-600">
              No batches found. Go to{' '}
              <a href="/admin/batches" className="underline">Admin → Batches</a>{' '}
              and create the standard batches first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBatchBandId('')}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  batchBandId === '' ? 'bg-saffron-600 text-white border-saffron-600' : 'bg-white border-gray-300 text-charcoal'
                }`}
              >
                Unassigned
              </button>
              {batches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBatchBandId(b.id)}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                    batchBandId === b.id ? 'bg-saffron-600 text-white border-saffron-600' : 'bg-white border-gray-300 text-charcoal hover:border-saffron-400'
                  }`}
                >
                  Batch {b.code}
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-400 mt-1">
            Mon/Wed → Batch A (morning) / B (evening) · Tue/Thu → Batch C (morning) / D (evening)
          </p>
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
