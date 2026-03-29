/**
 * LyricsViewer — Tabbed display of lyrics with original, transliteration,
 * translation, and meaning tabs. Ragam/taalam metadata shown at top.
 */

'use client';

import { useState } from 'react';

interface LyricsViewerProps {
  originalText: string;
  transliteration?: string;
  translation?: string;
  meaning?: string;
  ragam?: string;
  taalam?: string;
}

type TabKey = 'original' | 'transliteration' | 'translation' | 'meaning';

interface Tab {
  key: TabKey;
  label: string;
  content: string;
}

export function LyricsViewer({
  originalText,
  transliteration,
  translation,
  meaning,
  ragam,
  taalam,
}: LyricsViewerProps) {
  const tabs: Tab[] = [
    { key: 'original', label: 'Original', content: originalText },
    transliteration
      ? { key: 'transliteration', label: 'Transliteration', content: transliteration }
      : null,
    translation
      ? { key: 'translation', label: 'Translation', content: translation }
      : null,
    meaning
      ? { key: 'meaning', label: 'Meaning', content: meaning }
      : null,
  ].filter(Boolean) as Tab[];

  const [activeTab, setActiveTab] = useState<TabKey>('original');

  const currentContent = tabs.find((t) => t.key === activeTab)?.content ?? originalText;

  const hasMetadata = ragam || taalam;

  return (
    <div className="w-full space-y-4">
      {/* Ragam / Taalam info */}
      {hasMetadata && (
        <div className="flex flex-wrap gap-3">
          {ragam && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-saffron-50 border border-saffron-200 px-3 py-1">
              <span className="text-xs font-medium text-saffron-700 uppercase tracking-wide">
                Ragam
              </span>
              <span className="text-sm text-saffron-900 font-semibold">{ragam}</span>
            </div>
          )}
          {taalam && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1">
              <span className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                Taalam
              </span>
              <span className="text-sm text-amber-900 font-semibold">{taalam}</span>
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label="Lyrics views"
          className="flex w-full border-b border-gray-200 overflow-x-auto scrollbar-none"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`lyrics-panel-${tab.key}`}
              id={`lyrics-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-[80px] px-3 py-2.5 text-sm font-medium whitespace-nowrap
                transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-saffron-500
                ${
                  activeTab === tab.key
                    ? 'border-b-2 border-saffron-600 text-saffron-700 bg-saffron-50/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-b-2 border-transparent'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content panel */}
      <div
        id={`lyrics-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`lyrics-tab-${activeTab}`}
        className="min-h-[120px]"
      >
        <p className="text-lg leading-relaxed text-charcoal whitespace-pre-wrap font-body">
          {currentContent || (
            <span className="text-gray-400 italic text-base">No content available.</span>
          )}
        </p>
      </div>
    </div>
  );
}
