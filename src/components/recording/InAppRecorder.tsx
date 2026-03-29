/**
 * InAppRecorder — In-browser audio recorder using the MediaRecorder API.
 *
 * States: idle → recording → stopped
 * Calls onRecordingComplete with the recorded Blob, MIME type, and duration.
 * Prefers audio/webm;codecs=opus; falls back to the first supported type.
 */

'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface InAppRecorderProps {
  onRecordingComplete: (
    blob: Blob,
    mimeType: string,
    durationSeconds: number,
  ) => void;
  maxDurationSeconds?: number;
}

type RecorderState = 'idle' | 'recording' | 'stopped';

/** Ordered list of preferred MIME types */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

function getSupportedMimeType(): string | null {
  if (typeof window === 'undefined' || !window.MediaRecorder) return null;
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function InAppRecorder({
  onRecordingComplete,
  maxDurationSeconds = 300,
}: InAppRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedMime, setRecordedMime] = useState<string>('');
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [browserSupported, setBrowserSupported] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Revoke object URL on unmount or when replaced
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Check browser support on mount
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      !!window.MediaRecorder &&
      !!navigator.mediaDevices?.getUserMedia;
    setBrowserSupported(supported);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(secs);
      if (secs >= maxDurationSeconds) {
        // Auto-stop when max duration is reached
        mediaRecorderRef.current?.stop();
      }
    }, 500);
  }, [maxDurationSeconds, stopTimer]);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioUrl(null);
    setRecordedBlob(null);
    setElapsed(0);

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setError(
        'Your browser does not support audio recording. Please try Chrome, Firefox, or Edge.',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopTimer();
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);

        setRecordedBlob(blob);
        setRecordedMime(mimeType);
        setRecordedDuration(duration);
        setAudioUrl(url);
        setState('stopped');

        // Stop all tracks to release microphone
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.onerror = () => {
        stopTimer();
        setError('Recording failed unexpectedly. Please try again.');
        setState('idle');
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(200); // collect chunks every 200 ms
      setState('recording');
      startTimer();
    } catch (err: unknown) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Please allow microphone access and try again.'
          : err instanceof Error
          ? err.message
          : 'Could not start recording.';
      setError(msg);
    }
  }, [startTimer, stopTimer]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const discardRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordedBlob(null);
    setRecordedDuration(0);
    setElapsed(0);
    setState('idle');
    setError(null);
  }, [audioUrl]);

  const confirmRecording = useCallback(() => {
    if (recordedBlob) {
      onRecordingComplete(recordedBlob, recordedMime, recordedDuration);
    }
  }, [recordedBlob, recordedMime, recordedDuration, onRecordingComplete]);

  // Still checking browser support
  if (browserSupported === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 rounded-full border-2 border-saffron-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Browser not supported
  if (!browserSupported) {
    return (
      <div className="card border-red-300 bg-red-50 text-center space-y-3">
        <p className="text-2xl">&#x1F6AB;</p>
        <p className="font-semibold text-red-800 text-sm">
          Recording not supported
        </p>
        <p className="text-xs text-red-700">
          Your browser does not support in-app audio recording.
          Please use a recent version of Chrome, Firefox, or Edge.
        </p>
      </div>
    );
  }

  const mimeType = getSupportedMimeType();
  const pct = Math.min((elapsed / maxDurationSeconds) * 100, 100);
  const isNearMax = elapsed >= maxDurationSeconds - 30;

  return (
    <div className="space-y-5">
      {/* Format info */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="badge badge-neutral">{mimeType ?? 'Unknown format'}</span>
        <span>Max {Math.floor(maxDurationSeconds / 60)} min</span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Recording UI */}
      {state !== 'stopped' && (
        <div className="flex flex-col items-center gap-6 py-4">
          {/* Timer */}
          <div className="text-center">
            <p
              className={`text-5xl font-mono font-bold tabular-nums transition-colors ${
                state === 'recording'
                  ? isNearMax
                    ? 'text-red-600'
                    : 'text-saffron-700'
                  : 'text-gray-400'
              }`}
            >
              {formatTime(elapsed)}
            </p>
            {state === 'recording' && (
              <p className={`text-xs mt-1 ${isNearMax ? 'text-red-500' : 'text-gray-400'}`}>
                {isNearMax
                  ? `Less than ${maxDurationSeconds - elapsed}s remaining`
                  : `/ ${formatTime(maxDurationSeconds)}`}
              </p>
            )}
          </div>

          {/* Progress bar (only while recording) */}
          {state === 'recording' && (
            <div className="w-full max-w-xs">
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    isNearMax ? 'bg-red-500' : 'bg-saffron-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Record / Stop button */}
          {state === 'idle' ? (
            <button
              type="button"
              onClick={startRecording}
              className="flex flex-col items-center gap-2 focus:outline-none group"
              aria-label="Start recording"
            >
              <div
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 active:scale-95
                           flex items-center justify-center shadow-lg transition-all duration-150
                           group-focus:ring-4 group-focus:ring-red-300"
              >
                <svg
                  className="w-8 h-8 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-600">Tap to Record</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="flex flex-col items-center gap-2 focus:outline-none group"
              aria-label="Stop recording"
            >
              <div
                className="w-20 h-20 rounded-full bg-saffron-600 hover:bg-saffron-700 active:scale-95
                           flex items-center justify-center shadow-lg transition-all duration-150
                           group-focus:ring-4 group-focus:ring-saffron-300 relative"
              >
                {/* Pulsing ring */}
                <span className="absolute inset-0 rounded-full bg-saffron-400 animate-ping opacity-30" />
                <svg
                  className="w-8 h-8 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </div>
              <span className="text-sm font-medium text-saffron-700">Stop Recording</span>
            </button>
          )}
        </div>
      )}

      {/* Playback UI */}
      {state === 'stopped' && audioUrl && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 flex items-center gap-3">
            <span className="text-xl">&#x2705;</span>
            <div>
              <p className="font-semibold text-green-800 text-sm">
                Recording complete &mdash; {formatTime(recordedDuration)}
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                Review your recording below before uploading.
              </p>
            </div>
          </div>

          {/* Audio playback */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={audioUrl} className="w-full rounded-lg" />

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={discardRecording}
              className="btn-secondary flex-1"
            >
              &#x21BA; Re-record
            </button>
            <button
              type="button"
              onClick={confirmRecording}
              className="btn-primary flex-1"
            >
              Use This Recording
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
