/**
 * Shows how many files are still on the old Firebase storage and moves them
 * to Supabase with one click (POST /api/files/migrate). Hidden when there's
 * nothing left to move.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface Result {
  moved: number;
  failed: { what: string; reason: string }[];
}

export function MigrateFilesBanner({ onMoved }: { onMoved?: () => void }) {
  const { user, apiFetch } = useAuthContext();
  const [pending, setPending] = useState<number | null>(null);
  const [configured, setConfigured] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/files/migrate')
      .then((r) => r.json())
      .then((d) => {
        setPending(typeof d.pending === 'number' ? d.pending : 0);
        setConfigured(d.configured !== false);
      })
      .catch(() => setPending(0));
  }, [user, apiFetch]);

  async function run() {
    setRunning(true);
    setErr(null);
    try {
      const res = await apiFetch('/api/files/migrate', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Move failed (${res.status})`);
      setResult({ moved: json.moved ?? 0, failed: json.failed ?? [] });
      setPending(json.failed?.length ?? 0);
      onMoved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Move failed');
    } finally {
      setRunning(false);
    }
  }

  if (!configured) {
    return (
      <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
        File storage isn&apos;t switched on yet, so uploads won&apos;t work. The storage key needs to be added
        to the website settings — see the message from your developer.
      </div>
    );
  }
  if (!result && !pending) return null;

  return (
    <div className="card border-teal-200 bg-teal-50 space-y-2 text-sm">
      {!result && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-teal-900">
            <strong>{pending}</strong> older file{pending === 1 ? ' is' : 's are'} still on the old storage and may not open.
          </p>
          <button onClick={run} disabled={running} className="btn-primary text-xs px-3 py-1.5">
            {running ? 'Moving files…' : 'Move them now'}
          </button>
        </div>
      )}
      {result && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-teal-900">
            Moved {result.moved} file{result.moved === 1 ? '' : 's'}.
            {result.failed.length === 0 ? ' Everything now opens from the new storage.' : ''}
          </p>
          <div className="flex gap-2">
            {result.failed.length > 0 && (
              <button onClick={run} disabled={running} className="btn-primary text-xs px-3 py-1.5">
                {running ? 'Trying again…' : 'Try again'}
              </button>
            )}
            <button onClick={() => window.location.reload()} className="text-xs text-teal-700 underline">
              Refresh list
            </button>
          </div>
        </div>
      )}
      {result && result.failed.length > 0 && (
        <div className="text-xs text-amber-900 space-y-1">
          <p className="font-medium">These couldn&apos;t be moved — please upload them again:</p>
          <ul className="list-disc pl-5">
            {result.failed.map((f, i) => (
              <li key={i}>{f.what} <span className="text-amber-700">({f.reason})</span></li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
