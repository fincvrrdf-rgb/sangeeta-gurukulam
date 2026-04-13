'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

export default function CreateLyricsPage() {
  const { apiFetch } = useAuthContext();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), originalText: ' ' }),
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
    <div className="max-w-lg mx-auto px-4 py-16 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Add Lyrics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter a title to create a draft. Fill in the rest on the next page.
        </p>
      </div>

      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Venkatesha Suprabhatam"
          className="input flex-1"
          autoFocus
          disabled={submitting}
        />
        <button type="submit" className="btn-primary" disabled={submitting || !title.trim()}>
          {submitting ? '…' : 'Add'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ← Back to lyrics
      </button>
    </div>
  );
}
