/**
 * Lyrics List — /student/lyrics
 *
 * Shows all published lyrics grouped by ragam.
 * Supports client-side search/filter by ragam name.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface LyricsItem {
  id: string;
  title: string;
  ragam: string;
  taalam?: string;
  composer?: string;
  language?: string;
  hasFile?: boolean;
}

function SkeletonItem() {
  return (
    <div className="animate-pulse flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-48 bg-gray-200 rounded" />
        <div className="h-3 w-32 bg-gray-200 rounded" />
      </div>
      <div className="h-6 w-16 bg-gray-200 rounded-full" />
    </div>
  );
}

const STOTRAM_LINKS = [
  {
    title: 'Ganesha Pancharatnam',
    url: 'https://greenmesg.org/stotrams/ganesha_pancharatnam.php',
    deity: 'Ganesha',
  },
  {
    title: 'Shiva Panchakshara Stotram',
    url: 'https://greenmesg.org/stotrams/shiva_panchakshara_stotram.php',
    deity: 'Shiva',
  },
  {
    title: 'Suryashtakam',
    url: 'https://greenmesg.org/stotrams/suryashtakam.php',
    deity: 'Surya',
  },
  {
    title: 'Mahishasura Mardini Stotram',
    url: 'https://greenmesg.org/stotrams/mahishasura_mardini_stotram.php',
    deity: 'Devi',
  },
  {
    title: 'Durga Saptashloki',
    url: 'https://greenmesg.org/stotrams/durga_saptashloki.php',
    deity: 'Durga',
  },
];

export default function LyricsListPage() {
  const { user, apiFetch } = useAuthContext();
  const [lyrics, setLyrics] = useState<LyricsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/lyrics')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load lyrics (${r.status})`);
        return r.json();
      })
      .then((data) => {
        const raw: Record<string, unknown>[] = Array.isArray(data) ? data : data.lyrics ?? [];
        setLyrics(raw.map((l) => ({
          id: l.id as string,
          title: (l.title as string) ?? '',
          ragam: (l.ragam as string) ?? '',
          taalam: l.taalam as string | undefined,
          composer: l.composer as string | undefined,
          language: l.originalLanguage as string | undefined,
          hasFile: Array.isArray(l.attachedFiles) && (l.attachedFiles as unknown[]).length > 0,
        })));
      })
      .catch((err) => setError(err.message ?? 'Could not load lyrics.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  // Group by ragam, applying search filter first
  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? lyrics.filter(
          (l) =>
            l.ragam.toLowerCase().includes(term) ||
            l.title.toLowerCase().includes(term)
        )
      : lyrics;

    const map = new Map<string, LyricsItem[]>();
    for (const item of filtered) {
      const key = item.ragam || 'Unknown Ragam';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    // Sort ragam names alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [lyrics, search]);

  const totalFiltered = grouped.reduce((n, [, items]) => n + items.length, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Lyrics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Browse published song lyrics with transliterations and translations.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
          &#x1F50D;
        </span>
        <input
          type="search"
          className="input pl-8"
          placeholder="Search by title or ragam…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stotrams & Bhajans — direct links */}
      {!search && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="section-title">Stotrams &amp; Bhajans</h2>
            <span className="badge badge-neutral">{STOTRAM_LINKS.length}</span>
          </div>
          <div className="card p-0 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {STOTRAM_LINKS.map((item) => (
                <li key={item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-4 py-3.5
                               hover:bg-saffron-50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-charcoal group-hover:text-saffron-800 truncate">
                        {item.title}
                      </p>
                      <span className="text-xs text-gray-400">{item.deity}</span>
                    </div>
                    <span className="text-xs text-saffron-600 flex-shrink-0">greenmesg.org &#x2197;</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Lyrics sourced from <a href="https://greenmesg.org/stotrams/" target="_blank" rel="noopener noreferrer" className="underline hover:text-saffron-600">greenmesg.org</a>
          </p>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card space-y-0 p-0 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="px-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonItem key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Empty search result */}
      {!loading && !error && grouped.length === 0 && (
        <div className="card text-center text-gray-400 py-12 text-sm">
          {search
            ? `No lyrics found matching "${search}".`
            : 'No lyrics published yet. Check back soon!'}
        </div>
      )}

      {/* Grouped list */}
      {!loading &&
        grouped.map(([ragam, items]) => (
          <section key={ragam}>
            {/* Ragam header */}
            <div className="flex items-center gap-2 mb-2">
              <h2 className="section-title">{ragam}</h2>
              <span className="badge badge-neutral">{items.length}</span>
            </div>

            <div className="card p-0 overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/student/lyrics/${item.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3.5
                                 hover:bg-saffron-50 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-charcoal group-hover:text-saffron-800 truncate">
                          {item.title}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {item.taalam && (
                            <span className="badge badge-info text-xs">
                              {item.taalam}
                            </span>
                          )}
                          {item.language && (
                            <span className="badge badge-neutral text-xs">
                              {item.language}
                            </span>
                          )}
                          {item.composer && (
                            <span className="text-xs text-gray-400">
                              {item.composer}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.hasFile && (
                          <span className="text-xs text-gray-400" title="Sheet attached">📄</span>
                        )}
                        <span className="text-saffron-400 group-hover:text-saffron-600 text-sm">&#x2192;</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}

      {/* Result count (when searching) */}
      {!loading && search && totalFiltered > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {totalFiltered} result{totalFiltered !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  );
}
