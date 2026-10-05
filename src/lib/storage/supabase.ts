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

// The project URL isn't secret; the service-role key is (server env only).
const RAW_URL = process.env.SUPABASE_URL || 'https://cqyndfjimosijmcpkolk.supabase.co';
// Tolerate common paste mistakes: whitespace, surrounding quotes, "Bearer ".
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/^Bearer\s+/i, '')
  .trim();

/**
 * What kind of key is configured — never the key itself. Used to tell the
 * teacher when the wrong value was pasted into Vercel.
 */
export function describeServiceKey():
  | 'missing' | 'secret' | 'publishable' | 'service_role' | 'anon' | 'other_jwt' | 'not_a_key' {
  if (!SERVICE_KEY) return 'missing';
  if (SERVICE_KEY.startsWith('sb_secret_')) return 'secret';
  if (SERVICE_KEY.startsWith('sb_publishable_')) return 'publishable';
  const parts = SERVICE_KEY.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (payload.role === 'service_role') return 'service_role';
      if (payload.role === 'anon') return 'anon';
      return 'other_jwt';
    } catch {
      return 'not_a_key';
    }
  }
  return 'not_a_key';
}
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'recordings';

/** Buckets: `materials` is public (lyrics, resources); the others are private. */
export const BUCKETS = {
  recordings: BUCKET,
  materials: 'materials',
  paymentProofs: 'payment-proofs',
} as const;

function objectPath(path: string): string {
  return encodeURIComponent(path).replace(/%2F/g, '/');
}

/** Permanent public URL of a file in a public bucket (e.g. materials). */
export function supabasePublicUrl(bucket: string, path: string): string {
  return `${baseUrl()}/storage/v1/object/public/${bucket}/${objectPath(path)}`;
}

/**
 * Short-lived URL the browser can PUT a file to directly (no size limit from
 * our own server). Returns the absolute upload URL.
 */
export async function createSignedUploadUrl(bucket: string, path: string): Promise<string> {
  const res = await fetch(`${baseUrl()}/storage/v1/object/upload/sign/${bucket}/${objectPath(path)}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `Supabase upload link failed (${res.status})`);
  }
  const { url } = (await res.json()) as { url: string };
  return `${baseUrl()}/storage/v1${url}`;
}

export function supabaseConfigured(): boolean {
  return Boolean(RAW_URL && SERVICE_KEY);
}

function baseUrl(): string {
  return RAW_URL.replace(/\/$/, '');
}

/**
 * New-style Supabase secret keys (`sb_secret_…`) aren't JWTs: they must go in
 * the `apikey` header only — sending one as `Authorization: Bearer` makes
 * Storage reject the request ("Invalid Compact JWS"). Legacy service_role
 * keys are JWTs and are sent in both headers.
 */
function authHeaders(): Record<string, string> {
  if (SERVICE_KEY.startsWith('sb_')) return { apikey: SERVICE_KEY };
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
  bucket: string = BUCKET,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/storage/v1/object/${bucket}/${objectPath(path)}`,
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
  bucket: string = BUCKET,
): Promise<string> {
  const res = await fetch(
    `${baseUrl()}/storage/v1/object/sign/${bucket}/${objectPath(path)}`,
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
