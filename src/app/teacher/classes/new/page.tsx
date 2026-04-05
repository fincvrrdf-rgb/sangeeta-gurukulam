/**
 * Create Class Slot — /teacher/classes/new
 *
 * Teacher creates a recurring class slot with batch, day, time, and type.
 * Pre-fills with the standard schedule:
 *   Mon/Wed → Batch A (morning) / Batch B (evening)
 *   Tue/Fri → Batch C (morning) / Batch D (evening)
 *   Saturday → Testing day
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface BatchBand {
  id: string;
  code: string;
  name: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Standard schedule presets
const SCHEDULE_PRESETS = [
  { label: 'Mon/Wed — Batch A Morning', dayOfWeek: 1, start: '05:30', end: '06:30', batchCode: 'A', slotType: 'regular' },
  { label: 'Mon/Wed — Batch B Evening', dayOfWeek: 1, start: '16:30', end: '17:30', batchCode: 'B', slotType: 'regular' },
  { label: 'Mon/Wed — Batch A Morning (Wed)', dayOfWeek: 3, start: '05:30', end: '06:30', batchCode: 'A', slotType: 'regular' },
  { label: 'Mon/Wed — Batch B Evening (Wed)', dayOfWeek: 3, start: '16:30', end: '17:30', batchCode: 'B', slotType: 'regular' },
  { label: 'Tue/Fri — Batch C Morning', dayOfWeek: 2, start: '05:30', end: '06:30', batchCode: 'C', slotType: 'regular' },
  { label: 'Tue/Fri — Batch D Evening', dayOfWeek: 2, start: '16:30', end: '17:30', batchCode: 'D', slotType: 'regular' },
  { label: 'Tue/Fri — Batch C Morning (Fri)', dayOfWeek: 5, start: '05:30', end: '06:30', batchCode: 'C', slotType: 'regular' },
  { label: 'Tue/Fri — Batch D Evening (Fri)', dayOfWeek: 5, start: '16:30', end: '17:30', batchCode: 'D', slotType: 'regular' },
  { label: 'Saturday — Testing Day', dayOfWeek: 6, start: '09:00', end: '10:00', batchCode: null, slotType: 'testing' },
];

export default function CreateSlotPage() {
  const router = useRouter();
  const { apiFetch } = useAuthContext();

  const [bands, setBands] = useState<BatchBand[]>([]);
  const [loadingBands, setLoadingBands] = useState(true);

  const [batchBandId, setBatchBandId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('05:30');
  const [endTime, setEndTime] = useState('06:30');
  const [slotType, setSlotType] = useState<'regular' | 'makeup' | 'testing'>('regular');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/batches')
      .then((r) => r.json())
      .then((d) => setBands(d.batches ?? []))
      .catch(() => {})
      .finally(() => setLoadingBands(false));
  }, [apiFetch]);

  function applyPreset(preset: typeof SCHEDULE_PRESETS[number]) {
    setDayOfWeek(preset.dayOfWeek);
    setStartTime(preset.start);
    setEndTime(preset.end);
    setSlotType(preset.slotType as 'regular' | 'makeup' | 'testing');
    if (preset.batchCode) {
      const match = bands.find((b) => b.code === preset.batchCode);
      if (match) setBatchBandId(match.id);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!batchBandId && slotType !== 'testing') {
      setError('Please select a batch band.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await apiFetch('/api/classes/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchBandId,
          dayOfWeek,
          startTimeIST: startTime,
          endTimeIST: endTime,
          slotType,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to create slot.');
        return;
      }
      setSuccess(`Slot created! (${DAY_NAMES[dayOfWeek]} ${startTime}–${endTime})`);
      setTimeout(() => router.push('/teacher/classes'), 1500);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/teacher/classes" className="text-sm text-saffron-700 hover:underline">
          ← Back to Classes
        </Link>
        <h1 className="font-heading text-2xl font-bold text-charcoal mt-2">Create Class Slot</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set up a recurring weekly slot. The standard schedule is pre-populated below.
        </p>
      </div>

      {/* Standard schedule reference */}
      <div className="card bg-saffron-50 border-saffron-200 text-xs space-y-1">
        <p className="font-semibold text-saffron-900 mb-2">Standard Schedule (IST)</p>
        <p>📅 <strong>Mon, Wed</strong> — Batch A: 5:30–6:30 AM · Batch B: 4:30–5:30 PM</p>
        <p>📅 <strong>Tue, Fri</strong> — Batch C: 5:30–6:30 AM · Batch D: 4:30–5:30 PM</p>
        <p>📅 <strong>Saturday</strong> — Testing / Bhajan (open to all)</p>
      </div>

      {/* Quick presets */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">Quick Presets</p>
        <div className="flex flex-wrap gap-2">
          {SCHEDULE_PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applyPreset(p)}
              className="text-xs px-3 py-1.5 rounded-lg border border-saffron-300 bg-white text-saffron-700 hover:bg-saffron-50 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {success && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Batch Band */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Batch Band {slotType !== 'testing' && <span className="text-red-500">*</span>}
          </label>
          {loadingBands ? (
            <div className="input animate-pulse bg-gray-100" />
          ) : (
            <select
              className="input"
              value={batchBandId}
              onChange={(e) => setBatchBandId(e.target.value)}
              required={slotType !== 'testing'}
            >
              <option value="">— Select batch —</option>
              {bands.map((b) => (
                <option key={b.id} value={b.id}>
                  Batch {b.code} — {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Day of Week */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Day of Week</label>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDayOfWeek(d)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  dayOfWeek === d
                    ? 'bg-saffron-600 text-white border-saffron-600'
                    : 'bg-white border-gray-300 text-charcoal hover:border-saffron-400'
                }`}
              >
                {DAY_NAMES[d].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {/* Start / End Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Start Time (IST)</label>
            <input
              type="time"
              className="input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">End Time (IST)</label>
            <input
              type="time"
              className="input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Slot Type */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Slot Type</label>
          <div className="flex gap-3">
            {(['regular', 'makeup', 'testing'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="slotType"
                  value={t}
                  checked={slotType === t}
                  onChange={() => setSlotType(t)}
                  className="accent-saffron-600"
                />
                <span className="text-sm capitalize">{t}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? 'Creating…' : 'Create Slot'}
        </button>
      </form>
    </div>
  );
}
