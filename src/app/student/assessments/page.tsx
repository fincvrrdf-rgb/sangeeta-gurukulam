/**
 * Student — My Assessments (/student/assessments)
 *
 * Shows the tests the teacher has set. For each one still awaiting work the
 * student records or picks a VIDEO (so the taalam is visible) and uploads it.
 * Once submitted the teacher is notified automatically; the grade and feedback
 * appear here when it comes back.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { ASSESSMENT_ALLOWED_MIME_TYPES, ASSESSMENT_MAX_SIZE_BYTES, STORAGE_PATHS } from '@/domain/constants';

type Status = 'assigned' | 'submitted' | 'graded';

interface Assessment {
  id: string;
  title?: string;
  instructions?: string | null;
  teachingUnitId: string;
  assessmentType: string;
  status: Status;
  dueDate?: string | null;
  submittedAt?: string | null;
  videoFileName?: string | null;
  result?: 'pass' | 'fail' | 'needs_improvement' | null;
  totalScore?: number | null;
  maxScore?: number | null;
  feedback?: string | null;
  createdAt: string;
}

const MAX_MB = Math.floor(ASSESSMENT_MAX_SIZE_BYTES / 1024 / 1024);

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'graded') return <span className="badge badge-success">Graded</span>;
  if (status === 'submitted') return <span className="badge badge-warning">Awaiting grade</span>;
  return <span className="badge badge-info">To do</span>;
}

function ResultBadge({ result }: { result: Assessment['result'] }) {
  if (!result) return null;
  if (result === 'pass') return <span className="badge badge-success">Passed</span>;
  if (result === 'needs_improvement') return <span className="badge badge-warning">Needs improvement</span>;
  return <span className="badge badge-error">Not passed</span>;
}

export default function StudentAssessmentsPage() {
  const { user, apiFetch } = useAuthContext();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-assessment upload state
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(() => {
    if (!user) return;
    apiFetch('/api/assessments')
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load assessments (${r.status})`);
        return r.json();
      })
      .then((data) => setAssessments(data.assessments ?? []))
      .catch((e) => setError(e.message ?? 'Could not load assessments.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function handleFile(assessment: Assessment, file: File) {
    setUploadError(null);
    setSuccessId(null);

    // Video only — the taalam has to be visible
    const isVideo = file.type.startsWith('video/') || ASSESSMENT_ALLOWED_MIME_TYPES.includes(file.type);
    if (!isVideo) {
      setUploadError('Please choose a video file (MP4, WebM or MOV) — your taalam needs to be visible.');
      return;
    }
    if (file.size > ASSESSMENT_MAX_SIZE_BYTES) {
      setUploadError(`That video is ${Math.round(file.size / 1024 / 1024)} MB. Please keep it under ${MAX_MB} MB.`);
      return;
    }

    setUploadingId(assessment.id);
    setProgress(0);

    try {
      let videoPath: string;
      let videoProvider: 'supabase' | 'firebase';

      // Preferred path: signed URL straight to Supabase (no server size limit)
      try {
        const res = await apiFetch('/api/files/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'assessment',
            assessmentId: assessment.id,
            fileName: file.name,
            contentType: file.type,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Could not start upload (${res.status})`);

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', data.uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.setRequestHeader('x-upsert', 'true');
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(file);
        });

        videoPath = data.path;
        videoProvider = 'supabase';
      } catch (primaryErr) {
        // Fallback: Firebase Storage, same as practice recordings
        console.warn('Supabase upload failed, trying Firebase Storage', primaryErr);
        videoPath = STORAGE_PATHS.assessmentVideo(user!.uid, assessment.id, `${Date.now()}_${file.name}`);
        videoProvider = 'firebase';
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef(storage, videoPath), file, { contentType: file.type });
          task.on(
            'state_changed',
            (snap) => setProgress(Math.round((snap.bytesTransferred / Math.max(1, snap.totalBytes)) * 100)),
            (err) => reject(new Error(
              `Upload failed — ${primaryErr instanceof Error ? primaryErr.message : 'storage unavailable'}; ` +
              `backup storage: ${err.message}`,
            )),
            () => resolve(),
          );
        });
      }

      // Attach the video to the assessment (this notifies the teacher)
      const submitRes = await apiFetch(`/api/assessments/${assessment.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath,
          videoProvider,
          mimeType: file.type || 'video/mp4',
          fileName: file.name,
          fileSizeBytes: file.size,
        }),
      });
      const submitData = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) throw new Error(submitData.error ?? `Could not submit (${submitRes.status})`);

      setSuccessId(assessment.id);
      load();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
    } finally {
      setUploadingId(null);
      setProgress(0);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">My Assessments</h1>
        <p className="text-sm text-gray-500 mt-1">
          Record a <strong>video</strong> of yourself performing the piece — your taalam must be visible — and upload it here.
        </p>
      </div>

      {error && <div className="card border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>}
      {uploadError && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-red-500 font-bold flex-shrink-0">×</button>
        </div>
      )}
      {successId && (
        <div className="card border-green-300 bg-green-50 text-green-800 text-sm">
          ✅ Video submitted — your teacher has been notified and will grade it soon.
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="card animate-pulse h-24" />)}
        </div>
      )}

      {!loading && assessments.length === 0 && (
        <div className="card text-center py-14">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-gray-600 font-medium">No assessments yet</p>
          <p className="text-gray-400 text-sm mt-1">Your teacher will set one when you&apos;re ready.</p>
        </div>
      )}

      <div className="space-y-3">
        {assessments.map((a) => {
          const isUploading = uploadingId === a.id;
          const canSubmit = a.status !== 'graded';

          return (
            <div key={a.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-charcoal">{a.title || 'Assessment'}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {a.assessmentType.replace('_', ' ')}
                    {a.dueDate ? ` · due ${formatDate(a.dueDate)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ResultBadge result={a.result} />
                  <StatusBadge status={a.status} />
                </div>
              </div>

              {a.instructions && (
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                  {a.instructions}
                </p>
              )}

              {/* Graded result */}
              {a.status === 'graded' && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 space-y-1">
                  {a.totalScore != null && a.maxScore != null && (
                    <p className="text-sm font-semibold text-green-900">
                      Score: {a.totalScore} / {a.maxScore}
                    </p>
                  )}
                  {a.feedback && <p className="text-sm text-green-800 whitespace-pre-wrap">{a.feedback}</p>}
                </div>
              )}

              {/* Submitted, waiting */}
              {a.status === 'submitted' && (
                <p className="text-xs text-gray-500">
                  📹 {a.videoFileName || 'Video'} submitted {formatDate(a.submittedAt)} — waiting for your teacher&apos;s grade.
                </p>
              )}

              {/* Upload control */}
              {canSubmit && (
                <div className="space-y-2">
                  <input
                    ref={(el) => { fileInputs.current[a.id] = el; }}
                    type="file"
                    accept="video/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(a, file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputs.current[a.id]?.click()}
                    className="btn-primary w-full text-sm disabled:opacity-60"
                  >
                    {isUploading
                      ? `Uploading… ${progress}%`
                      : a.status === 'submitted' ? '🎥 Replace video' : '🎥 Record / upload video'}
                  </button>
                  {isUploading && (
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-saffron-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 text-center">
                    Video only · up to {MAX_MB} MB · keep your hands in frame for taalam
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
