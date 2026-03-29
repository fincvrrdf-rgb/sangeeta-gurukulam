/**
 * Practice Recording — /student/practice/record
 *
 * Students select a teaching unit, record audio in-browser via InAppRecorder,
 * then upload the blob to Firebase Storage and submit metadata to /api/recordings.
 * Wrapped in ConsentGate so recording only begins after explicit consent.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { ConsentGate } from '@/components/recording/ConsentGate';
import { InAppRecorder } from '@/components/recording/InAppRecorder';
import { STORAGE_PATHS } from '@/domain/constants';

interface TeachingUnit {
  id: string;
  unitName: string;
  unitType: string;
  ragam: string | null;
  taalam: string | null;
  lessonId: string;
}

type UploadStage = 'idle' | 'uploading' | 'saving' | 'success' | 'error';

/** Returns the ISO week string YYYY-WW for the current date */
function currentWeekOf(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), 0, 1));
  const diff = now.getTime() - start.getTime();
  const week = Math.ceil((diff / 86_400_000 + start.getUTCDay() + 1) / 7);
  return `${now.getFullYear()}-${String(week).padStart(2, '0')}`;
}

function SkeletonSelect() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 w-32 bg-gray-200 rounded" />
      <div className="h-10 w-full bg-gray-200 rounded-lg" />
    </div>
  );
}

export default function PracticeRecordPage() {
  const { user, apiFetch } = useAuthContext();

  const [units, setUnits] = useState<TeachingUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [unitsError, setUnitsError] = useState<string | null>(null);

  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [studentNote, setStudentNote] = useState('');

  // Recording result
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingMime, setPendingMime] = useState('');
  const [pendingDuration, setPendingDuration] = useState(0);

  // Upload state
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successRecordingId, setSuccessRecordingId] = useState<string | null>(null);

  // Fetch teaching units on mount
  useEffect(() => {
    if (!user) return;
    apiFetch('/api/admin/syllabus')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load syllabus (${r.status})`);
        return r.json();
      })
      .then((data) => {
        const unitList: TeachingUnit[] = (data.units ?? []).filter(
          (u: TeachingUnit) => u.id && u.unitName,
        );
        setUnits(unitList);
        if (unitList.length > 0) setSelectedUnitId(unitList[0].id);
      })
      .catch((err) => setUnitsError(err.message ?? 'Could not load units.'))
      .finally(() => setLoadingUnits(false));
  }, [user, apiFetch]);

  const handleRecordingComplete = useCallback(
    (blob: Blob, mimeType: string, durationSeconds: number) => {
      setPendingBlob(blob);
      setPendingMime(mimeType);
      setPendingDuration(durationSeconds);
      setUploadStage('idle');
      setUploadError(null);
    },
    [],
  );

  const handleDiscard = useCallback(() => {
    setPendingBlob(null);
    setPendingMime('');
    setPendingDuration(0);
    setUploadStage('idle');
    setUploadError(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!pendingBlob || !user || !selectedUnitId) return;

    setUploadStage('uploading');
    setUploadProgress(0);
    setUploadError(null);

    try {
      const weekOf = currentWeekOf();
      const ext = pendingMime.includes('ogg')
        ? 'ogg'
        : pendingMime.includes('mp4')
        ? 'mp4'
        : 'webm';
      const fileName = `${Date.now()}.${ext}`;
      const storagePath = STORAGE_PATHS.recording(user.uid, selectedUnitId, weekOf, fileName);

      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, pendingBlob, {
        contentType: pendingMime,
      });

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snap) => {
            setUploadProgress(
              Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
            );
          },
          reject,
          () => resolve(),
        );
      });

      // Save metadata
      setUploadStage('saving');
      const res = await apiFetch('/api/recordings', {
        method: 'POST',
        body: JSON.stringify({
          teachingUnitId: selectedUnitId,
          storagePath,
          fileName,
          mimeType: pendingMime,
          fileSizeBytes: pendingBlob.size,
          durationSeconds: pendingDuration,
          consentGiven: true,
          studentNote: studentNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error (${res.status})`);
      }

      const { recordingId } = await res.json();
      setSuccessRecordingId(recordingId);
      setUploadStage('success');
      setPendingBlob(null);
    } catch (err: unknown) {
      setUploadStage('error');
      setUploadError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      );
    }
  }, [
    pendingBlob,
    pendingMime,
    pendingDuration,
    user,
    selectedUnitId,
    studentNote,
    apiFetch,
  ]);

  const selectedUnit = units.find((u) => u.id === selectedUnitId) ?? null;
  const isUploading = uploadStage === 'uploading' || uploadStage === 'saving';

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/student/practice/history"
          className="text-xs text-saffron-600 hover:underline mb-2 inline-block"
        >
          &#x2190; Recording History
        </Link>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Practice Recording
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Record and submit your practice to receive teacher feedback.
        </p>
      </div>

      {/* Success state */}
      {uploadStage === 'success' && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">&#x2705;</span>
            <p className="font-semibold text-green-800 text-sm">
              Recording submitted successfully!
            </p>
          </div>
          <p className="text-xs text-green-700">
            Your teacher will review it and provide feedback soon.
          </p>
          <div className="flex gap-3 pt-1">
            <Link
              href="/student/practice/history"
              className="btn-secondary text-xs px-3 py-1.5"
            >
              View History
            </Link>
            <button
              type="button"
              className="btn-primary text-xs px-3 py-1.5"
              onClick={() => {
                setUploadStage('idle');
                setSuccessRecordingId(null);
                setStudentNote('');
              }}
            >
              Record Another
            </button>
          </div>
          {successRecordingId && (
            <p className="text-xs text-gray-400">ID: {successRecordingId}</p>
          )}
        </div>
      )}

      {uploadStage !== 'success' && (
        <ConsentGate onConsent={() => {}}>
          <div className="space-y-6">
            {/* Teaching unit selector */}
            <div className="card space-y-4">
              <h2 className="section-title text-base">1. Select Teaching Unit</h2>

              {loadingUnits ? (
                <SkeletonSelect />
              ) : unitsError ? (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  &#9888;&#65039; {unitsError}
                </div>
              ) : units.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No teaching units found. Please contact your teacher.
                </p>
              ) : (
                <div>
                  <label
                    htmlFor="unitSelect"
                    className="block text-sm font-medium text-charcoal mb-1.5"
                  >
                    Unit <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="unitSelect"
                    className="input"
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    disabled={!!pendingBlob}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitName}
                        {u.unitType ? ` (${u.unitType})` : ''}
                      </option>
                    ))}
                  </select>

                  {/* Selected unit info */}
                  {selectedUnit && (selectedUnit.ragam || selectedUnit.taalam) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedUnit.ragam && (
                        <span className="badge badge-info">
                          Ragam: {selectedUnit.ragam}
                        </span>
                      )}
                      {selectedUnit.taalam && (
                        <span className="badge badge-neutral">
                          Taalam: {selectedUnit.taalam}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Recorder */}
            {!pendingBlob && (
              <div className="card space-y-4">
                <h2 className="section-title text-base">2. Record Your Practice</h2>
                <InAppRecorder
                  onRecordingComplete={handleRecordingComplete}
                  maxDurationSeconds={300}
                />
              </div>
            )}

            {/* Review & upload */}
            {pendingBlob && (
              <div className="card space-y-4">
                <h2 className="section-title text-base">3. Review &amp; Upload</h2>

                {/* Playback */}
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">
                    Duration:{' '}
                    <span className="font-medium text-charcoal">
                      {Math.floor(pendingDuration / 60)}m {pendingDuration % 60}s
                    </span>
                  </p>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio
                    controls
                    src={URL.createObjectURL(pendingBlob)}
                    className="w-full rounded-lg"
                  />
                </div>

                {/* Optional note */}
                <div>
                  <label
                    htmlFor="studentNote"
                    className="block text-sm font-medium text-charcoal mb-1.5"
                  >
                    Note to teacher{' '}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="studentNote"
                    className="input min-h-[64px] resize-y"
                    placeholder="e.g. I struggled with the third line — please advise on the swara timing."
                    value={studentNote}
                    onChange={(e) => setStudentNote(e.target.value)}
                    maxLength={300}
                    disabled={isUploading}
                  />
                  <p className="text-xs text-gray-400 text-right mt-0.5">
                    {studentNote.length}/300
                  </p>
                </div>

                {/* Progress bar */}
                {isUploading && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">
                      {uploadStage === 'uploading'
                        ? `Uploading… ${uploadProgress}%`
                        : 'Saving record…'}
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-saffron-500 h-2 rounded-full transition-all duration-300"
                        style={{
                          width:
                            uploadStage === 'saving'
                              ? '100%'
                              : `${uploadProgress}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Upload error */}
                {uploadStage === 'error' && uploadError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    &#9888;&#65039; {uploadError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    disabled={isUploading}
                    className="btn-secondary flex-1"
                  >
                    &#x21BA; Re-record
                  </button>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={isUploading || !selectedUnitId}
                    className="btn-primary flex-1"
                  >
                    {isUploading ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        {uploadStage === 'saving' ? 'Saving…' : `${uploadProgress}%`}
                      </>
                    ) : (
                      'Submit Recording'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </ConsentGate>
      )}
    </div>
  );
}
