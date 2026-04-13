/**
 * Lyrics Management List — /teacher/lyrics
 *
 * Lists all lyrics (including drafts), with status filter and link to create.
 * Card-based layout matching the student portal style.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type LyricsStatus = 'draft' | 'published';

interface LyricsItem {
  id: string;
  title: string;
  teachingUnitName: string;
  status: LyricsStatus;
  updatedAt: string;
}

type FilterValue = 'all' | LyricsStatus;

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function LyricsListPage() {
  const { user, apiFetch } = useAuthContext();

  const [lyrics, setLyrics] = useState<LyricsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('Delete this lyrics entry? This cannot be undone.')) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/lyrics/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setLyrics((prev) => prev.filter((l) => l.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete lyrics.');
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/lyrics')
      .then((r) => r.json())
      .then((data) => {
        const raw: Record<string, unknown>[] = Array.isArray(data) ? data : data.lyrics ?? [];
        setLyrics(raw.map((l) => ({
          id: l.id as string,
          title: (l.title as string) ?? '',
          teachingUnitName: '',
          status: l.verificationStatus === 'published' ? 'published' : 'draft',
          updatedAt: (l.updatedAt as string) ?? (l.createdAt as string) ?? '',
        })));
      })
      .catch((err) => setError(err.message ?? 'Failed to load lyrics.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  const filtered = filter === 'all' ? lyrics : lyrics.filter((l) => l.status === filter);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Lyrics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all song lyrics and drafts</p>
        </div>
        <Link href="/teacher/lyrics/create" className="btn-primary">
          + New
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-white text-saffron-700 shadow-sm'
                : 'text-gray-500 hover:text-charcoal'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-28 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">📝</span>
          <p className="text-gray-600 font-medium">
            {filter === 'all' ? 'No lyrics yet' : `No ${filter} lyrics`}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Create your first lyrics entry to get started.
          </p>
          <Link href="/teacher/lyrics/create" className="btn-primary mt-4">
            Create New Lyrics
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="card flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-charcoal truncate">{item.title}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{item.teachingUnitName}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={item.status === 'published' ? 'badge badge-success' : 'badge badge-warning'}>
                    {item.status}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(item.updatedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href={`/teacher/lyrics/${item.id}`} className="btn-secondary text-xs">
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting === item.id ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
