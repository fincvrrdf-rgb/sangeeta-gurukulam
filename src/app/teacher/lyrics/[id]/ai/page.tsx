/**
 * AI Lyrics Assist — /teacher/lyrics/[id]/ai
 *
 * Offers Transliterate, Translate, and Summarize actions via the AI API.
 * Shows result with an AI draft disclaimer and a copy button.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

type AiAction = 'transliterate' | 'translate' | 'summarize';

interface LyricsPreview {
  id: string;
  title: string;
  originalText: string;
}

interface AiResult {
  action: AiAction;
  result: string;
}

const ACTIONS: { action: AiAction; label: string; icon: string; description: string }[] = [
  {
    action: 'transliterate',
    label: 'Transliterate',
    icon: '🔤',
    description: 'Convert original text to Roman script',
  },
  {
    action: 'translate',
    label: 'Translate',
    icon: '🌐',
    description: 'Translate lyrics to English',
  },
  {
    action: 'summarize',
    label: 'Summarize',
    icon: '📋',
    description: 'Generate a brief meaning summary',
  },
];

const ACTION_FIELD_MAP: Record<AiAction, string> = {
  transliterate: 'transliteration',
  translate: 'translation',
  summarize: 'meaning',
};

export default function AiLyricsAssistPage() {
  const { user, apiFetch } = useAuthContext();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [preview, setPreview] = useState<LyricsPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [running, setRunning] = useState<AiAction | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/lyrics/${id}`)
      .then((r) => r.json())
      .then((data: LyricsPreview) => setPreview(data))
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  }, [user, apiFetch, id]);

  async function runAction(action: AiAction) {
    setRunning(action);
    setAiResult(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/lyrics/${id}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      setAiResult({ action, result: data.result ?? data.text ?? '' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI request failed. Please try again.');
    } finally {
      setRunning(null);
    }
  }

  async function copyToLyrics() {
    if (!aiResult) return;
    const field = ACTION_FIELD_MAP[aiResult.action];
    try {
      const res = await apiFetch(`/api/lyrics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: aiResult.result }),
      });
      if (!res.ok) throw new Error('Could not copy to lyrics.');
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to copy result to lyrics.');
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">AI Lyrics Assist</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loadingPreview ? 'Loading…' : preview?.title ?? 'Unknown lyrics'}
          </p>
        </div>
        <button onClick={() => router.back()} className="btn-secondary text-sm flex-shrink-0">
          ← Back
        </button>
      </div>

      {/* Persistent AI Disclaimer */}
      <div className="flex items-start gap-2 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3">
        <span className="text-lg flex-shrink-0">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-yellow-800">AI draft — review before publishing</p>
          <p className="text-xs text-yellow-700 mt-0.5">
            AI-generated content may contain errors. Always verify accuracy before publishing to students.
          </p>
        </div>
      </div>

      {/* Original Text Preview */}
      <div className="card space-y-2">
        <h2 className="section-title">Original Text</h2>
        {loadingPreview ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-3 bg-gray-200 rounded w-full" />
            ))}
          </div>
        ) : preview?.originalText ? (
          <p className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
            {preview.originalText}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">No original text found. Add text in the lyrics editor first.</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="card space-y-3">
        <h2 className="section-title">Choose an Action</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ACTIONS.map(({ action, label, icon, description }) => (
            <button
              key={action}
              onClick={() => runAction(action)}
              disabled={running !== null}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                ${running === action
                  ? 'border-saffron-400 bg-saffron-50'
                  : 'border-gray-200 bg-white hover:border-saffron-300 hover:bg-saffron-50 cursor-pointer'
                }`}
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-sm font-semibold text-charcoal">
                {running === action ? 'Processing…' : label}
              </span>
              <span className="text-xs text-gray-500">{description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* AI Result */}
      {aiResult && (
        <div className="card space-y-3 border-teal-200 bg-teal-50">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="section-title text-teal-800">
                {ACTIONS.find((a) => a.action === aiResult.action)?.label} Result
              </h2>
              <span className="badge bg-yellow-100 text-yellow-800">AI Draft</span>
            </div>
            <button
              onClick={copyToLyrics}
              className={`btn text-sm ${copied ? 'bg-green-600 text-white' : 'btn-secondary'}`}
            >
              {copied ? '✅ Copied to lyrics' : `Copy to ${ACTION_FIELD_MAP[aiResult.action]}`}
            </button>
          </div>

          <p className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed bg-white rounded-lg p-3 border border-teal-100 max-h-64 overflow-y-auto">
            {aiResult.result}
          </p>

          <p className="text-xs text-yellow-700 flex items-center gap-1">
            <span>⚠️</span>
            <span>AI draft — review before publishing</span>
          </p>
        </div>
      )}
    </div>
  );
}
