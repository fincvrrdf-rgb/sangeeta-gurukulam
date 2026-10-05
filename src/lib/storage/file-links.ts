/**
 * lib/storage/file-links.ts — SERVER-ONLY
 *
 * A viewable link for a stored file: a signed Supabase URL for new uploads,
 * or a signed Firebase URL for files uploaded before the move to Supabase.
 */

import { adminStorage } from '@/lib/firebase/admin';
import { getSupabaseSignedUrl, supabaseConfigured } from '@/lib/storage/supabase';

export async function fileLinkFor(file: {
  provider?: string;
  bucket: string;
  path: string;
}): Promise<string | null> {
  if (!file.path) return null;
  if (/^https?:\/\//.test(file.path)) return file.path;
  try {
    if (file.provider === 'supabase') {
      if (!supabaseConfigured()) return null;
      return await getSupabaseSignedUrl(file.path, 3600, file.bucket);
    }
    const [url] = await adminStorage.bucket().file(file.path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return url;
  } catch (error) {
    console.error('[FILE_LINK]', file.path, error);
    return null;
  }
}
