/**
 * Admin — Add new devotional calendar event.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

const EVENT_TYPES = [
  'festival', 'auspicious_day', 'fasting_day', 'new_moon', 'full_moon',
  'deity_birthday', 'guru_purnima', 'special_puja', 'other'
];

export default function NewDevotionalEventPage() {
  const router = useRouter();
  const { apiFetch } = useAuthContext();
  const [form, setForm] = useState({ name: '', date: '', eventType: 'festival', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!form.name.trim() || !form.date) {
      setError('Name and date are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const r = await apiFetch('/api/admin/devotional-calendar', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (r.ok) {
        router.push('/admin/devotional-calendar');
      } else {
        const data = await r.json();
        setError(data.error ?? 'Failed to create event');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-saffron-700 hover:underline mb-4 block">← Back</button>
      <h1 className="section-title">Add Devotional Event</h1>

      <div className="card max-w-lg">
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
            <input
              type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input w-full" placeholder="e.g. Vinayaka Chaturthi"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
            <select
              value={form.eventType}
              onChange={e => setForm(f => ({ ...f, eventType: e.target.value }))}
              className="input w-full"
            >
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} className="input w-full"
              placeholder="Optional notes about this event..."
            />
          </div>

          <div className="text-xs text-gray-400 italic">
            Attribution: Event information referenced from Drik Panchang (drikpanchang.com)
          </div>

          <button onClick={submit} disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creating...' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
