'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';
import { STORAGE_PATHS } from '@/domain/constants';

type LyricsStatus = 'draft' | 'published';

interface LyricsItem {
  id: string;
  title: string;
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
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LyricsListPage() {
  const { user, apiFetch } = useAuthContext();
  const router = useRouter();

  const [lyrics, setLyrics] = useState<LyricsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  // Quick-add state
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/lyrics')
      .then((r) => r.json())
      .then((data) => {
        const raw: Record<string, unknown>[] = Array.isArray(data) ? data : data.lyrics ?? [];
        setLyrics(raw.map((l) => ({
          id: l.id as string,
          title: (l.title as string) ?? '(Untitled)',
          status: l.verificationStatus === 'published' ? 'published' : 'draft',
          updatedAt: (l.updatedAt as string) ?? (l.createdAt as string) ?? '',
        })));
      })
      .catch(() => setError('Failed to load lyrics.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    setAddError(null);
    setUploadProgress(0);

    try {
      // 1. Create the lyrics entry
      const res = await apiFetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), originalText: ' ' }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const created = await res.json();
      const id = created.id as string;

      // 2. Upload file if provided
      if (file) {
        const storagePath = STORAGE_PATHS.lyricsAttachment(id, `${Date.now()}_${file.name}`);
        const storageRef = ref(storage, storagePath);
        const task = uploadBytesResumable(storageRef, file);
        await new Promise<void>((resolve, reject) => {
          task.on(
            'state_changed',
            (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            reject,
            resolve,
          );
        });
        const downloadUrl = await getDownloadURL(storageRef);
        await apiFetch(`/api/lyrics/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appendAttachedFile: {
              name: file.name,
              storageRef: downloadUrl,
              mimeType: file.type,
              sizeBytes: file.size,
              uploadedAt: new Date().toISOString(),
            },
          }),
        });
      }

      router.push(`/teacher/lyrics/${id}`);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add lyrics.');
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this lyrics entry? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await apiFetch(`/api/lyrics/${id}`, { method: 'DELETE' });
      setLyrics((prev) => prev.filter((l) => l.id !== id));
    } catch {
      setError('Failed to delete.');
    } finally {
      setDeleting(null);
    }
  }

  const filtered = filter === 'all' ? lyrics : lyrics.filter((l) => l.status === filter);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-heading text-2xl font-bold text-charcoal">Lyrics</h1>

      {/* ── Quick Add ── */}
      <form onSubmit={handleAdd} className="card space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add New</p>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Song title (e.g. Venkatesha Suprabhatam)"
          className="input"
          disabled={adding}
        />

        <div className="flex items-center gap-3 flex-wrap">
          {/* File pick */}
          <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors ${adding ? 'opacity-50 pointer-events-none' : ''}`}>
            📎 {file ? file.name : 'Attach PDF / Photo'}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={adding}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-xs text-gray-400 hover:text-red-500">
              ✕ Remove
            </button>
          )}

          <button
            type="submit"
            className="btn-primary ml-auto"
            disabled={adding || !title.trim()}
          >
            {adding ? (file && uploadProgress > 0 ? `Uploading ${uploadProgress}%…` : 'Creating…') : '+ Add'}
          </button>
        </div>

        {addError && <p className="text-xs text-red-600">{addError}</p>}
      </form>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f.value ? 'bg-white text-saffron-700 shadow-sm' : 'text-gray-500 hover:text-charcoal'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm">
          {filter === 'all' ? 'No lyrics yet — add one above.' : `No ${filter} lyrics.`}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="card flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-charcoal truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={item.status === 'published' ? 'badge badge-success' : 'badge badge-warning'}>
                    {item.status}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(item.updatedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href={`/teacher/lyrics/${item.id}`} className="btn-secondary text-xs">Edit</Link>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
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
