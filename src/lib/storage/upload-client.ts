/**
 * Browser helper: upload a file to Supabase Storage via a signed upload URL
 * from POST /api/files/upload-url, with progress.
 */

type ApiFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface UploadedFile {
  bucket: string;
  path: string;
  publicUrl: string | null;
}

export async function uploadFile(
  apiFetch: ApiFetch,
  request: {
    kind: 'lyrics' | 'resource' | 'payment' | 'recording';
    lyricsId?: string;
    cycleMonth?: string;
    teachingUnitId?: string;
    weekOf?: string;
  },
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedFile> {
  const res = await apiFetch('/api/files/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, fileName: file.name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Could not start upload (${res.status})`);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });

  return { bucket: data.bucket, path: data.path, publicUrl: data.publicUrl ?? null };
}
