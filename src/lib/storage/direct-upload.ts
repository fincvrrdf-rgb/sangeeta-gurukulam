/**
 * Browser helper: upload a student's video/recording straight into Firebase
 * Storage through a session the server starts (POST /api/files/direct-upload),
 * with progress. Not limited by our server's request size or the Storage
 * security rules.
 */

type ApiFetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function uploadDirect(
  apiFetch: ApiFetch,
  request:
    | { kind: 'assessment'; assessmentId: string }
    | { kind: 'recording'; teachingUnitId: string; weekOf: string },
  file: Blob,
  fileName: string,
  onProgress?: (pct: number) => void,
): Promise<{ path: string }> {
  const contentType = file.type || (request.kind === 'assessment' ? 'video/mp4' : 'audio/webm');
  const res = await apiFetch('/api/files/direct-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, fileName, contentType, size: file.size }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Could not start the upload (${res.status})`);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.uploadUrl);
    xhr.setRequestHeader('Content-Type', data.contentType ?? contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('The connection dropped during the upload'));
    xhr.send(file);
  });

  return { path: data.path };
}
