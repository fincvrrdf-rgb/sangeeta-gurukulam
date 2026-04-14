/**
 * Lyrics Viewer — /student/lyrics/[id]
 *
 * Displays a single lyrics document with tabbed views:
 * Original | Transliteration | Translation | Meaning
 * Shows ragam, taalam, and teaching unit information.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface AttachedFile {
  name: string;
  storageRef: string;
  mimeType: string;
  sizeBytes: number;
}

interface LyricsDetail {
  id: string;
  title: string;
  ragam: string;
  taalam?: string;
  composer?: string;
  language?: string;
  teachingUnit?: {
    title: string;
    type: string;
    level?: string;
  };
  original?: string;
  transliteration?: string;
  translation?: string;
  meaning?: string;
  attachedFiles?: AttachedFile[];
}

type Tab = 'original' | 'transliteration' | 'translation' | 'meaning';

const TABS: { key: Tab; label: string }[] = [
  { key: 'original',        label: 'Original' },
  { key: 'transliteration', label: 'Transliteration' },
  { key: 'translation',     label: 'Translation' },
  { key: 'meaning',         label: 'Meaning' },
];

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center bg-saffron-50 rounded-lg px-3 py-2 text-center min-w-[80px]">
      <span className="text-xs text-saffron-600 font-medium">{label}</span>
      <span className="text-sm font-semibold text-charcoal mt-0.5">{value}</span>
    </div>
  );
}

function LyricsTextBlock({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap text-base leading-relaxed text-charcoal font-body tracking-wide">
      {text}
    </div>
  );
}

function SkeletonDetail() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-7 w-48 bg-gray-200 rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2">
        {TABS.map((t) => (
          <div key={t.key} className="h-9 w-24 bg-gray-200 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={`h-3 bg-gray-200 rounded ${i % 3 === 2 ? 'w-1/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

export default function LyricsViewerPage() {
  const { user, apiFetch } = useAuthContext();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [lyrics, setLyrics] = useState<LyricsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('original');

  useEffect(() => {
    if (!user || !id) return;
    apiFetch(`/api/lyrics/${id}`)
      .then((r) => {
        if (r.status === 404) throw new Error('Lyrics not found.');
        if (!r.ok) throw new Error(`Failed to load lyrics (${r.status})`);
        return r.json();
      })
      .then((data) => {
        // API returns { lyrics: {...} } — unwrap and map field names
        const raw = data.lyrics ?? data;
        const mapped: LyricsDetail = {
          id: raw.id,
          title: raw.title,
          ragam: raw.ragam ?? '',
          taalam: raw.taalam ?? undefined,
          composer: raw.composer ?? undefined,
          language: raw.originalLanguage ?? undefined,
          original: raw.sourceText ?? raw.original ?? undefined,
          transliteration: raw.transliteration ?? undefined,
          translation: raw.translations?.en?.text ?? raw.translation ?? undefined,
          meaning: raw.meaning ?? undefined,
          attachedFiles: raw.attachedFiles ?? [],
          teachingUnit: raw.teachingUnit ?? undefined,
        };
        setLyrics(mapped);
        // Auto-select first populated tab
        const first = TABS.find(
          (t) => mapped[t.key] && (mapped[t.key] as string).trim().length > 0
        );
        if (first) setActiveTab(first.key);
      })
      .catch((err) => setError(err.message ?? 'Could not load lyrics.'))
      .finally(() => setLoading(false));
  }, [user, id, apiFetch]);

  const activeContent = lyrics?.[activeTab];
  const availableTabs = TABS.filter(
    (t) => lyrics && lyrics[t.key] && (lyrics[t.key] as string).trim().length > 0
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
      >
        <span>&#x2190;</span> Back to Lyrics
      </button>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Loading */}
      {loading && <SkeletonDetail />}

      {/* Content */}
      {!loading && lyrics && (
        <div className="space-y-5">
          {/* Title & metadata */}
          <div>
            <h1 className="font-heading text-2xl font-bold text-charcoal">
              {lyrics.title}
            </h1>
            {lyrics.composer && (
              <p className="text-sm text-gray-500 mt-0.5">{lyrics.composer}</p>
            )}
          </div>

          {/* Info chips */}
          <div className="flex flex-wrap gap-2">
            <InfoChip label="Ragam" value={lyrics.ragam} />
            {lyrics.taalam && (
              <InfoChip label="Taalam" value={lyrics.taalam} />
            )}
            {lyrics.language && (
              <InfoChip label="Language" value={lyrics.language} />
            )}
            {lyrics.teachingUnit && (
              <InfoChip
                label={lyrics.teachingUnit.type}
                value={lyrics.teachingUnit.title}
              />
            )}
          </div>

          {/* Teaching unit detail */}
          {lyrics.teachingUnit?.level && (
            <div className="flex items-center gap-2">
              <span className="badge badge-info">
                Level: {lyrics.teachingUnit.level}
              </span>
            </div>
          )}

          {/* Tabs */}
          {availableTabs.length > 0 && (
            <div className="border-b border-gray-200">
              <div className="flex gap-0 overflow-x-auto no-scrollbar">
                {availableTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-saffron-500 text-saffron-700'
                        : 'border-transparent text-gray-500 hover:text-charcoal hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab content */}
          <div className="card">
            {activeContent ? (
              <LyricsTextBlock text={activeContent} />
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">
                This section is not yet available.
              </p>
            )}
          </div>

          {/* No content at all */}
          {availableTabs.length === 0 && (
            <div className="card text-center text-gray-400 py-12 text-sm">
              Lyrics content is being prepared. Check back soon!
            </div>
          )}

          {/* Attached files */}
          {lyrics.attachedFiles && lyrics.attachedFiles.length > 0 && (
            <div className="card space-y-3">
              <h2 className="text-sm font-semibold text-charcoal">Attached Files</h2>
              <ul className="space-y-2">
                {lyrics.attachedFiles.map((file) => (
                  <li key={file.storageRef} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base flex-shrink-0">
                        {file.mimeType === 'application/pdf' ? '📄' : '🖼️'}
                      </span>
                      <span className="text-sm text-charcoal truncate">{file.name}</span>
                      {file.sizeBytes ? (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {(file.sizeBytes / 1024).toFixed(0)} KB
                        </span>
                      ) : null}
                    </div>
                    <a
                      href={file.storageRef}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0"
                    >
                      {file.mimeType === 'application/pdf' ? '📄' : '🖼️'} View
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
