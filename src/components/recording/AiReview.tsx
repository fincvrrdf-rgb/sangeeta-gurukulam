/**
 * Shared UI for the AI preliminary review of a practice recording:
 *  - SaPicker: the student's Sa (shruti), remembered on this device
 *  - RagaPicker: raga to check swaras against (optional)
 *  - AiReviewCard: the review points, clearly labelled as preliminary
 */

'use client';

import { useEffect, useState } from 'react';
import { SA_PITCHES, PITCH_FREQS, RAGA_NAMES } from '@/lib/music/ragas';

export interface AiReviewData {
  points: string[];
  source: 'ai' | 'rules';
  generatedAt: string;
}

const SA_KEY = 'sg.saPitch';

/** The remembered Sa (pitch name), default C. */
export function useSaPitch(): [string, (p: string) => void] {
  const [sa, setSa] = useState('C');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SA_KEY);
      if (saved && PITCH_FREQS[saved]) setSa(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const update = (p: string) => {
    setSa(p);
    try { localStorage.setItem(SA_KEY, p); } catch { /* ignore */ }
  };
  return [sa, update];
}

export const saHzOf = (pitch: string) => PITCH_FREQS[pitch] ?? 261.63;

export function SaPicker({ value, onChange, disabled }: { value: string; onChange: (p: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-charcoal mb-1.5">Your Sa (shruti)</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {SA_PITCHES.map((p) => (
          <option key={p} value={p}>{p} — {PITCH_FREQS[p].toFixed(0)} Hz</option>
        ))}
      </select>
    </label>
  );
}

export function RagaPicker({ value, onChange, disabled }: { value: string; onChange: (r: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-charcoal mb-1.5">Raga</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">Other / not listed (check all 12 swaras)</option>
        {RAGA_NAMES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </label>
  );
}

export function AiReviewCard({ review, compact }: { review: AiReviewData; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">
        🤖 AI preliminary review
      </p>
      <ul className={`list-disc pl-5 space-y-1 text-indigo-950 ${compact ? 'text-xs' : 'text-sm'}`}>
        {review.points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
      <p className="text-[11px] text-indigo-600">
        Automatic pitch check only — gamakas can look like pitch errors. Your teacher&apos;s review is final.
      </p>
    </div>
  );
}
