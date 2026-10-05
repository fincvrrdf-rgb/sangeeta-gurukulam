/**
 * lib/storage/supabase.ts — SERVER-ONLY
 *
 * Free replacement for Firebase Storage using Supabase Storage's REST API.
 * No SDK dependency — plain fetch with the service-role key, so all access
 * stays server-side behind our own requireAuth() checks.
 *
 * Required environment variables:
 *   SUPABASE_URL               e.g. https://abcdefgh.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  Project Settings → API → service_role (secret!)
 *   SUPABASE_STORAGE_BUCKET    optional, defaults to 'recordings' (create it PRIVATE)
 *
 * Free tier: 1 GB storage / 2 GB egress per month — roughly 300–500 practice
 * recordings at the 64 kbps opus bitrate the recorder uses.
 */

const RAW_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'recordings';

export function supabaseConfigured(): boolean {
  return Boolean(RAW_URL && SERVICE_KEY);
}

function baseUrl(): string {
  return RAW_URL.replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey': SERVICE_KEY,
  };
}

/** Upload a file. Overwrites if the path already exists. */
export async function uploadToSupabase(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/storage/v1/object/${BUCKET}/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(body),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ??
      `Supabase upload failed (${res.status})`,
    );
  }
}

/** Create a time-limited signed URL for playback/download. */
export async function getSupabaseSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const res = await fetch(
    `${baseUrl()}/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ??
      `Supabase sign failed (${res.status})`,
    );
  }
  const { signedURL } = (await res.json()) as { signedURL: string };
  // signedURL comes back as a path like /object/sign/bucket/path?token=...
  return `${baseUrl()}/storage/v1${signedURL}`;
}
