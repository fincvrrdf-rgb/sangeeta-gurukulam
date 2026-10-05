/**
 * Practice Recording — /student/practice/record
 *
 * Students pick what they're practising (a syllabus unit, or general practice),
 * record in the browser, and submit. Before upload the recording is
 * pitch-analysed in the browser against their Sa and the raga; the server
 * turns that into AI preliminary review points.
 *
 * Upload goes straight from the browser to storage (no server size limit):
 * Supabase via a signed URL, falling back to Firebase Storage if Supabase
 * isn't available. Wrapped in ConsentGate so recording only begins after
 * explicit consent.
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { ConsentGate } from '@/components/recording/ConsentGate';
import { InAppRecorder } from '@/components/recording/InAppRecorder';
import { ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';
import { uploadFile } from '@/lib/storage/upload-client';
import { STORAGE_PATHS } from '@/domain/constants';
import { analyzeRecording } from '@/lib/music/analyze-audio';
import { findRaga } from '@/lib/music/ragas';
import type { RecordingAnalysis } from '@/lib/music/analyze';
import {
  AiReviewCard, RagaPicker, SaPicker, saHzOf, useSaPitch, type AiReviewData,
} from '@/components/recording/AiReview';

interface TeachingUnit {
  id: string;
  unitName: string;
  unitType: string;
  ragam: string | null;
  taalam: string | null;
  lessonId: string;
}

type UploadStage = 'idle' | 'analysing' | 'uploading' | 'saving' | 'success' | 'error';

const GENERAL = 'general';

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

  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [studentNote, setStudentNote] = useState('');
  const [pieceName, setPieceName] = useState('');
  const [saPitch, setSaPitch] = useSaPitch();
  const [ragaName, setRagaName] = useState('');
  const [aiReview, setAiReview] = useState<AiReviewData | null>(null);

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
        setSelectedUnitId(unitList.length > 0 ? unitList[0].id : GENERAL);
      })
      .catch(() => {
        // Units are optional — fall back to general practice
        setSelectedUnitId(GENERAL);
      })
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
    if (!pendingBlob || !user) return;

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
      const unitForPath = selectedUnitId || GENERAL;

      // 1. Pitch analysis in the browser (never blocks submitting)
      setUploadStage('analysing');
      let analysis: RecordingAnalysis | undefined;
      try {
        analysis = await analyzeRecording(pendingBlob, saHzOf(saPitch), ragaName || null, (p) =>
          setUploadProgress(Math.round(p * 100)),
        );
      } catch (err) {
        console.warn('Recording analysis failed', err);
      }

      // 2. Upload straight to storage
      setUploadStage('uploading');
      setUploadProgress(0);
      let storagePath: string;
      let storageProvider: 'supabase' | 'firebase';
      try {
        const file = new File([pendingBlob], fileName, { type: pendingMime });
        const up = await uploadFile(
          apiFetch,
          { kind: 'recording', teachingUnitId: unitForPath, weekOf },
          file,
          setUploadProgress,
        );
        storagePath = up.path;
        storageProvider = 'supabase';
      } catch (supabaseErr) {
        console.warn('Supabase upload failed, trying Firebase Storage', supabaseErr);
        storagePath = STORAGE_PATHS.recording(user.uid, unitForPath, weekOf, fileName);
        storageProvider = 'firebase';
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef(storage, storagePath), pendingBlob, { contentType: pendingMime });
          task.on(
            'state_changed',
            (snap) => setUploadProgress(Math.round((snap.bytesTransferred / Math.max(1, snap.totalBytes)) * 100)),
            (err) => reject(new Error(
              `Upload failed — ${supabaseErr instanceof Error ? supabaseErr.message : 'storage unavailable'}; ` +
              `backup storage: ${err.message}`,
            )),
            () => resolve(),
          );
        });
      }
      setUploadProgress(100);

      // Save metadata
      setUploadStage('saving');
      const res = await apiFetch('/api/recordings', {
        method: 'POST',
        body: JSON.stringify({
          teachingUnitId: unitForPath,
          pieceName: unitForPath === GENERAL ? pieceName.trim() || undefined : undefined,
          storagePath,
          storageProvider,
          fileName,
          mimeType: pendingMime,
          fileSizeBytes: pendingBlob.size,
          durationSeconds: pendingDuration,
          consentGiven: true,
          studentNote: studentNote.trim() || undefined,
          analysis,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error (${res.status})`);
      }

      const saved = await res.json();
      setSuccessRecordingId(saved.recordingId);
      setAiReview(saved.aiReview ?? null);
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
    pieceName,
    saPitch,
    ragaName,
    apiFetch,
  ]);

  const pendingBlobUrl = useMemo(() => {
    if (!pendingBlob) return null;
    return URL.createObjectURL(pendingBlob);
  }, [pendingBlob]);

  useEffect(() => {
    return () => { if (pendingBlobUrl) URL.revokeObjectURL(pendingBlobUrl); };
  }, [pendingBlobUrl]);

  const selectedUnit = units.find((u) => u.id === selectedUnitId) ?? null;
  const isUploading = uploadStage === 'analysing' || uploadStage === 'uploading' || uploadStage === 'saving';

  // Pre-select the unit's raga when we know it
  useEffect(() => {
    const r = findRaga(selectedUnit?.ragam);
    setRagaName(r ? r.name : '');
  }, [selectedUnit?.ragam]);

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
          {aiReview && <AiReviewCard review={aiReview} />}
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
                setAiReview(null);
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
              <h2 className="section-title text-base">1. What are you practising?</h2>

              {loadingUnits ? (
                <SkeletonSelect />
              ) : (
                <div className="space-y-3">
                  {units.length > 0 && (
                    <div>
                      <label
                        htmlFor="unitSelect"
                        className="block text-sm font-medium text-charcoal mb-1.5"
                      >
                        Lesson / piece
                      </label>
                      <select
                        id="unitSelect"
                        className="input"
                        value={selectedUnitId}
                        onChange={(e) => setSelectedUnitId(e.target.value)}
                        disabled={isUploading}
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.unitName}
                            {u.unitType ? ` (${u.unitType})` : ''}
                          </option>
                        ))}
                        <option value={GENERAL}>Something else / general practice</option>
                      </select>
                    </div>
                  )}

                  {selectedUnitId === GENERAL && (
                    <div>
                      <label htmlFor="pieceName" className="block text-sm font-medium text-charcoal mb-1.5">
                        What did you sing? <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        id="pieceName"
                        className="input"
                        placeholder="e.g. Sarali varisai 1–5, or the song name"
                        value={pieceName}
                        onChange={(e) => setPieceName(e.target.value)}
                        maxLength={120}
                        disabled={isUploading}
                      />
                    </div>
                  )}

                  {/* Selected unit info */}
                  {selectedUnit && (selectedUnit.ragam || selectedUnit.taalam) && (
                    <div className="flex flex-wrap gap-2">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SaPicker value={saPitch} onChange={setSaPitch} disabled={isUploading} />
                    <RagaPicker value={ragaName} onChange={setRagaName} disabled={isUploading} />
                  </div>
                  <p className="text-xs text-gray-400">
                    Used by the AI check to see whether each swara is in tune.
                  </p>
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
                    src={pendingBlobUrl ?? undefined}
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
                      {uploadStage === 'analysing'
                        ? `AI checking your pitch… ${uploadProgress}%`
                        : uploadStage === 'uploading'
                        ? `Uploading… ${uploadProgress}%`
                        : 'Saving and writing review points…'}
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
                    disabled={isUploading}
                    className="btn-primary flex-1"
                  >
                    {isUploading ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        {uploadStage === 'saving' ? 'Saving…' : uploadStage === 'analysing' ? 'Checking…' : `${uploadProgress}%`}
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
