/**
 * services/lyrics/versions.ts
 *
 * Lyrics versioning service. Creates an immutable snapshot every time
 * lyrics content is saved. Supports version history and rollback.
 */

import { createDoc, queryDocs, type QueryConstraint } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { Lyrics, LyricVersion, LyricsTranslation } from '@/domain/types';

/**
 * Create a version snapshot of the current lyrics state before saving changes.
 * Called every time lyrics content fields are modified.
 */
export async function snapshotLyricsVersion(
  lyricsId: string,
  currentLyrics: Lyrics,
  changedBy: string,
  changeReason: string
): Promise<string> {
  // Determine next version number
  const existing = await queryDocs<LyricVersion>(COLLECTIONS.LYRIC_VERSIONS, [
    { type: 'where', field: 'lyricsId', op: '==', value: lyricsId },
    { type: 'orderBy', field: 'versionNumber', direction: 'desc' },
    { type: 'limit', value: 1 },
  ]);
  const nextVersion = existing.length > 0 ? existing[0].versionNumber + 1 : 1;

  return createDoc(COLLECTIONS.LYRIC_VERSIONS, {
    lyricsId,
    versionNumber: nextVersion,
    changedBy,
    changedAt: new Date().toISOString(),
    snapshotSourceText: currentLyrics.sourceText,
    snapshotTransliteration: currentLyrics.transliteration,
    snapshotTranslations: currentLyrics.translations,
    changeReason,
  });
}

/**
 * Get the version history of a lyrics entry, most recent first.
 */
export async function getLyricsVersionHistory(lyricsId: string): Promise<LyricVersion[]> {
  return queryDocs<LyricVersion>(COLLECTIONS.LYRIC_VERSIONS, [
    { type: 'where', field: 'lyricsId', op: '==', value: lyricsId },
    { type: 'orderBy', field: 'versionNumber', direction: 'desc' },
  ]);
}
