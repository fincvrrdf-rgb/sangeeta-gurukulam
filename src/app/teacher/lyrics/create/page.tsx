/**
 * Create Lyrics — /teacher/lyrics/create
 *
 * Form to create new lyrics with all fields.
 * Fetches syllabus units for the teaching unit selector.
 */

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface SyllabusUnit {
  id: string;
  title: string;
}

interface FormFields {
  title: string;
  teachingUnitId: string;
  ragam: string;
  taalam: string;
  originalText: string;
  transliteration: string;
  translation: string;
  meaning: string;
}

const EMPTY: FormFields = {
  title: '',
  teachingUnitId: '',
  ragam: '',
  taalam: '',
  originalText: '',
  transliteration: '',
  translation: '',
  meaning: '',
};

export default function CreateLyricsPage() {
  const { user, apiFetch } = useAuthContext();
  const router = useRouter();

  const [form, setForm] = useState<FormFields>(EMPTY);
  const [units, setUnits] = useState<SyllabusUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/admin/syllabus')
      .then((r) => r.json())
      .then((data) => setUnits(Array.isArray(data) ? data : data.units ?? []))
      .catch(() => setUnits([]))
      .finally(() => setLoadingUnits(false));
  }, [user, apiFetch]);

  function set(field: keyof FormFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const created = await res.json();
      router.push(`/teacher/lyrics/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create lyrics.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Create New Lyrics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Saved as draft — publish when ready</p>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div className="card space-y-4">
          <h2 className="section-title">Basic Info</h2>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Venkatesha Suprabhatam"
              className="input"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Teaching Unit</label>
            {loadingUnits ? (
              <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <select value={form.teachingUnitId} onChange={set('teachingUnitId')} className="input">
                <option value="">— Select unit —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.title}</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Ragam</label>
              <input
                type="text"
                value={form.ragam}
                onChange={set('ragam')}
                placeholder="e.g. Bhairavi"
                className="input"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Taalam</label>
              <input
                type="text"
                value={form.taalam}
                onChange={set('taalam')}
                placeholder="e.g. Adi"
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Text Fields */}
        <div className="card space-y-4">
          <h2 className="section-title">Lyrics Content</h2>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Original Text</label>
            <textarea
              rows={5}
              value={form.originalText}
              onChange={set('originalText')}
              placeholder="Paste the original lyrics here..."
              className="input resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Transliteration</label>
            <textarea
              rows={4}
              value={form.transliteration}
              onChange={set('transliteration')}
              placeholder="Roman script transliteration..."
              className="input resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Translation</label>
            <textarea
              rows={4}
              value={form.translation}
              onChange={set('translation')}
              placeholder="English translation..."
              className="input resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Meaning / Commentary</label>
            <textarea
              rows={3}
              value={form.meaning}
              onChange={set('meaning')}
              placeholder="Deeper meaning or teaching notes..."
              className="input resize-y"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Lyrics'}
          </button>
        </div>
      </form>
    </div>
  );
}
