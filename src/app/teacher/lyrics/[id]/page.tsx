/**
 * View / Edit Lyrics — /teacher/lyrics/[id]
 *
 * Loads a single lyrics entry and allows editing all fields.
 * Supports publish with confirm dialog and links to AI assist.
 */

'use client';

import { useEffect, useState, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { storage } from '@/lib/firebase/client';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { STORAGE_PATHS } from '@/domain/constants';

interface AttachedFile {
  name: string;
  storageRef: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

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
  attachedFiles?: AttachedFile[];
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

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/lyrics/${id}`)
      .then((r) => r.json())
      .then((data) => {
        // API returns { lyrics: {...} } — unwrap and map field names
        const raw = data.lyrics ?? data;
        const mapped: LyricsDetail = {
          id: raw.id,
          title: raw.title ?? '',
          teachingUnitName: raw.teachingUnitName ?? '',
          ragam: raw.ragam ?? '',
          taalam: raw.taalam ?? '',
          originalText: raw.sourceText ?? raw.originalText ?? '',
          transliteration: raw.transliteration ?? '',
          translation: raw.translations?.en?.text ?? raw.translation ?? '',
          meaning: raw.meaning ?? '',
          status: raw.verificationStatus === 'published' ? 'published' : 'draft',
          versionCount: raw.versionCount ?? 0,
          updatedAt: raw.updatedAt ?? '',
          attachedFiles: raw.attachedFiles ?? [],
        };
        setLyrics(mapped);
        setTitle(mapped.title);
        setRagam(mapped.ragam);
        setTaalam(mapped.taalam);
        setOriginalText(mapped.originalText);
        setTransliteration(mapped.transliteration);
        setTranslation(mapped.translation);
        setMeaning(mapped.meaning);
        setAttachedFiles(mapped.attachedFiles ?? []);
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

  async function handleFileUpload(file: File) {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('Only PDF, JPEG, PNG, or WebP files are allowed.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File must be under 20 MB.');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
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
      const newFile: AttachedFile = {
        name: file.name,
        storageRef: downloadUrl,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
      };
      const res = await apiFetch(`/api/lyrics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appendAttachedFile: newFile }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setAttachedFiles((prev) => [...prev, newFile]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      flash('File uploaded and attached.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleRemoveFile(storageRef: string, fileName: string) {
    if (!confirm(`Remove "${fileName}"?`)) return;
    setError(null);
    try {
      const res = await apiFetch(`/api/lyrics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeAttachedFile: storageRef }),
      });
      if (!res.ok) throw new Error(`Remove failed (${res.status})`);
      setAttachedFiles((prev) => prev.filter((f) => f.storageRef !== storageRef));
      flash('File removed.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove file.');
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

      {/* Attached Files */}
      <div className="card space-y-4">
        <h2 className="section-title">Attached Files</h2>
        <p className="text-xs text-gray-500">
          Attach PDF or image files (sheet music, notation scans, etc.) — students can download them.
        </p>

        {/* Existing files */}
        {attachedFiles.length > 0 && (
          <ul className="space-y-2">
            {attachedFiles.map((file) => (
              <li key={file.storageRef} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg flex-shrink-0">
                    {file.mimeType === 'application/pdf' ? '📄' : '🖼️'}
                  </span>
                  <a
                    href={file.storageRef}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-saffron-700 hover:underline font-medium"
                  >
                    {file.name}
                  </a>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {file.sizeBytes ? `${(file.sizeBytes / 1024).toFixed(0)} KB` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file.storageRef, file.name)}
                  className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Upload input */}
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-saffron-50 file:text-saffron-700 hover:file:bg-saffron-100 cursor-pointer disabled:opacity-50"
          />
          <p className="text-xs text-gray-400">PDF, JPEG, PNG, or WebP · max 20 MB</p>
          {uploading && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-saffron-500 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">Uploading… {uploadProgress}%</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
