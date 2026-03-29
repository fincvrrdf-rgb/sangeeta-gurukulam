/**
 * View / Edit Lyrics — /teacher/lyrics/[id]
 *
 * Loads a single lyrics entry and allows editing all fields.
 * Supports publish with confirm dialog and links to AI assist.
 */

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface LyricsDetail {
  id: string;
  title: string;
  teachingUnitName: string;
  ragam: string;
  taalam: string;
  originalText: string;
  transliteration: string;
  translation: string;
  meaning: string;
  status: 'draft' | 'published';
  versionCount: number;
  updatedAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function LyricsDetailPage() {
  const { user, apiFetch } = useAuthContext();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [lyrics, setLyrics] = useState<LyricsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editable fields
  const [title, setTitle] = useState('');
  const [ragam, setRagam] = useState('');
  const [taalam, setTaalam] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [transliteration, setTransliteration] = useState('');
  const [translation, setTranslation] = useState('');
  const [meaning, setMeaning] = useState('');

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/lyrics/${id}`)
      .then((r) => r.json())
      .then((data: LyricsDetail) => {
        setLyrics(data);
        setTitle(data.title);
        setRagam(data.ragam ?? '');
        setTaalam(data.taalam ?? '');
        setOriginalText(data.originalText ?? '');
        setTransliteration(data.transliteration ?? '');
        setTranslation(data.translation ?? '');
        setMeaning(data.meaning ?? '');
      })
      .catch((err) => setError(err.message ?? 'Failed to load lyrics.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch, id]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/lyrics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, ragam, taalam, originalText, transliteration, translation, meaning }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const updated: LyricsDetail = await res.json();
      setLyrics(updated);
      flash('Lyrics saved.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save lyrics.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!lyrics) return;
    if (!confirm('Publish these lyrics? Students will be able to see them.')) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/lyrics/${id}/publish`, { method: 'POST' });
      if (!res.ok) throw new Error(`Publish failed (${res.status})`);
      setLyrics((prev) => prev ? { ...prev, status: 'published' } : prev);
      flash('Lyrics published successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not publish lyrics.');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="card animate-pulse space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!lyrics && !loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card text-center py-16 text-gray-500">
          <p>Lyrics not found.</p>
          <button onClick={() => router.back()} className="btn-secondary mt-4">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">{title || 'Lyrics Detail'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lyrics?.teachingUnitName && <span>{lyrics.teachingUnitName} · </span>}
            <span className={lyrics?.status === 'published' ? 'text-green-600' : 'text-yellow-600'}>
              {lyrics?.status === 'published' ? 'Published' : 'Draft'}
            </span>
            {lyrics?.versionCount != null && (
              <span className="text-gray-400"> · {lyrics.versionCount} version{lyrics.versionCount !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/teacher/lyrics/${id}/ai`} className="btn-secondary text-sm">
            ✨ AI Assist
          </Link>
          {lyrics?.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="btn-primary text-sm"
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="card border-green-300 bg-green-50 text-green-800 text-sm">
          ✅ {successMsg}
        </div>
      )}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Basic Info */}
        <div className="card space-y-4">
          <h2 className="section-title">Basic Info</h2>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Ragam</label>
              <input type="text" value={ragam} onChange={(e) => setRagam(e.target.value)} className="input" placeholder="e.g. Bhairavi" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Taalam</label>
              <input type="text" value={taalam} onChange={(e) => setTaalam(e.target.value)} className="input" placeholder="e.g. Adi" />
            </div>
          </div>
        </div>

        {/* Lyrics Content */}
        <div className="card space-y-4">
          <h2 className="section-title">Lyrics Content</h2>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Original Text</label>
            <textarea rows={5} value={originalText} onChange={(e) => setOriginalText(e.target.value)} className="input resize-y" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Transliteration</label>
            <textarea rows={4} value={transliteration} onChange={(e) => setTransliteration(e.target.value)} className="input resize-y" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Translation</label>
            <textarea rows={4} value={translation} onChange={(e) => setTranslation(e.target.value)} className="input resize-y" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Meaning / Commentary</label>
            <textarea rows={3} value={meaning} onChange={(e) => setMeaning(e.target.value)} className="input resize-y" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            Last updated: {lyrics?.updatedAt ? formatDate(lyrics.updatedAt) : '—'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push('/teacher/lyrics')} className="btn-secondary">
              Back
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
