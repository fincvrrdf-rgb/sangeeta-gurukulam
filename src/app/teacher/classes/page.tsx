/**
 * Classes — /teacher/classes
 *
 * Top: each batch's ONE stable Meet link (copy / join).
 * Below: who joined each class, taken from students clicking their batch's
 * Join link (/api/attendance/joins). No per-date class list — classes are
 * generated in the background from the weekly schedule.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface BatchLinkRow {
  id: string;
  code: string;
  meetLink: string | null;
}

interface JoinEntry {
  studentId: string;
  name: string;
  status: string;
  joinedAt: string | null;
  lateByMinutes: number;
  viaLink: boolean;
}

interface ClassJoins {
  key: string;
  instanceId: string;
  batch: string;
  date: string;
  start: string;
  end: string;
  cancelled: boolean;
  enrolled: number;
  joined: JoinEntry[];
  notJoined: { studentId: string; name: string }[];
}

const BATCH_COLORS: Record<string, string> = {
  A: 'bg-amber-100 text-amber-800',
  B: 'bg-orange-100 text-orange-800',
  C: 'bg-teal-100 text-teal-800',
  D: 'bg-purple-100 text-purple-800',
};

const DEFAULT_SCHEDULE = [
  { batchBandCode: 'A', dayOfWeek: [1, 3], start: '05:30', end: '06:30' },
  { batchBandCode: 'B', dayOfWeek: [1, 3], start: '16:30', end: '17:30' },
  { batchBandCode: 'C', dayOfWeek: [2, 4], start: '05:30', end: '06:30' },
  { batchBandCode: 'D', dayOfWeek: [2, 4], start: '16:30', end: '17:30' },
] as const;

function istTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
}

function formatDay(date: string): string {
  const fmt = (offset: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86_400_000));
  if (date === fmt(0)) return 'Today';
  if (date === fmt(-1)) return 'Yesterday';
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function JoinBadge({ entry }: { entry: JoinEntry }) {
  if (entry.status === 'attended') return <span className="badge badge-success">On time</span>;
  if (entry.status === 'late') return <span className="badge badge-warning">{entry.lateByMinutes} min late</span>;
  if (entry.status === 'absent') return <span className="badge badge-error">{entry.lateByMinutes} min late · absent</span>;
  return <span className="badge badge-neutral">{entry.status}</span>;
}

export default function ClassesPage() {
  const { user, apiFetch } = useAuthContext();
  const [batchLinks, setBatchLinks] = useState<BatchLinkRow[]>([]);
  const [classes, setClasses] = useState<ClassJoins[]>([]);
  const [hasSlots, setHasSlots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [batchFilter, setBatchFilter] = useState<string>('all');

  function load() {
    return Promise.all([
      apiFetch('/api/admin/batches').then((r) => r.json()).catch(() => ({ batches: [] })),
      apiFetch('/api/attendance/joins?days=14').then((r) => r.json()),
      apiFetch('/api/classes/slots').then((r) => r.json()).catch(() => ({ slots: [] })),
    ])
      .then(([batchData, joinData, slotData]) => {
        const bands: Record<string, unknown>[] = batchData.batches ?? [];
        setBatchLinks(
          bands
            .filter((b) => b.isActive !== false)
            .map((b) => ({ id: b.id as string, code: (b.code as string) ?? '', meetLink: (b.meetLink as string) ?? null }))
            .sort((a, b) => a.code.localeCompare(b.code)),
        );
        if (joinData.error) throw new Error(joinData.error);
        setClasses(joinData.classes ?? []);
        setHasSlots((slotData.slots ?? []).length > 0 || (joinData.classes ?? []).length > 0);
      })
      .catch((err) => setError(err.message ?? 'Failed to load classes.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (user) load();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyLink(code: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch { /* clipboard unavailable */ }
  }

  async function handleSetupSchedule() {
    if (!confirm('Create the default 4-batch schedule (A/B Mon–Wed, C/D Tue–Thu)?')) return;
    setSettingUp(true);
    try {
      for (const batch of DEFAULT_SCHEDULE) {
        for (const day of batch.dayOfWeek) {
          await apiFetch('/api/classes/slots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchBandCode: batch.batchBandCode,
              dayOfWeek: day,
              startTimeIST: batch.start,
              endTimeIST: batch.end,
              slotType: 'regular',
            }),
          });
        }
      }
      await apiFetch('/api/classes/instances/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAhead: 14 }),
      });
      await load();
    } catch {
      setError('Some of the schedule could not be created. Please try again.');
    } finally {
      setSettingUp(false);
    }
  }

  const visible = classes.filter((c) => batchFilter === 'all' || c.batch === batchFilter);
  const batchesWithClasses = [...new Set(classes.map((c) => c.batch))].sort();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <h1 className="font-heading text-2xl font-bold text-charcoal">Classes</h1>

      {error && <div className="card border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>}

      {/* One stable link per batch */}
      {batchLinks.length > 0 && (
        <div className="card p-0 divide-y divide-gray-100">
          <div className="px-4 py-2.5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch Class Links</h2>
          </div>
          {batchLinks.map((b) => (
            <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`badge flex-shrink-0 ${BATCH_COLORS[b.code] ?? 'badge-neutral'}`}>Batch {b.code}</span>
                {b.meetLink ? (
                  <span className="text-sm text-gray-600 truncate">{b.meetLink.replace('https://', '')}</span>
                ) : (
                  <span className="text-sm text-gray-400 italic">No link set</span>
                )}
              </div>
              {b.meetLink && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => copyLink(b.code, b.meetLink!)}
                    className="text-xs text-gray-500 border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50"
                  >
                    {copiedCode === b.code ? '✓ Copied' : 'Copy'}
                  </button>
                  <a
                    href={b.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-teal-700 border border-teal-400 rounded-lg px-2.5 py-1 hover:bg-teal-50"
                  >
                    📹 Join
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* First-time setup */}
      {!loading && !hasSlots && (
        <div className="card border-saffron-300 bg-saffron-50 space-y-3">
          <p className="font-semibold text-charcoal">No weekly schedule yet</p>
          <div className="text-sm space-y-1 text-gray-700">
            <p><strong>Batch A</strong> — Mon, Wed · 5:30–6:30 AM</p>
            <p><strong>Batch B</strong> — Mon, Wed · 4:30–5:30 PM</p>
            <p><strong>Batch C</strong> — Tue, Thu · 5:30–6:30 AM</p>
            <p><strong>Batch D</strong> — Tue, Thu · 4:30–5:30 PM</p>
          </div>
          <button onClick={handleSetupSchedule} disabled={settingUp} className="btn-primary text-sm">
            {settingUp ? 'Setting up…' : 'Create Default Schedule'}
          </button>
        </div>
      )}

      {/* Who joined — from Join link clicks */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-heading text-lg font-semibold text-charcoal">Who joined</h2>
            <p className="text-xs text-gray-500">Recorded when a student clicks their batch&apos;s Join link · last 14 days</p>
          </div>
          {batchesWithClasses.length > 1 && (
            <div className="flex gap-1.5">
              {['all', ...batchesWithClasses].map((b) => (
                <button
                  key={b}
                  onClick={() => setBatchFilter(b)}
                  className={`text-xs px-2.5 py-1 rounded-lg border ${
                    batchFilter === b ? 'bg-charcoal text-white border-charcoal' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {b === 'all' ? 'All' : b}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card animate-pulse space-y-2">
              <div className="h-4 w-48 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          ))}

        {!loading && visible.length === 0 && (
          <div className="card text-center py-10 text-sm text-gray-500">No classes in the last 14 days.</div>
        )}

        {!loading &&
          visible.map((c) => (
            <div key={c.key} className="card space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${BATCH_COLORS[c.batch] ?? 'badge-neutral'}`}>Batch {c.batch}</span>
                  <span className="text-sm font-semibold text-charcoal">{formatDay(c.date)}</span>
                  <span className="text-sm text-gray-500">{istTime(c.start)} – {istTime(c.end)}</span>
                  {c.cancelled && <span className="badge badge-error">Cancelled</span>}
                </div>
                {!c.cancelled && (
                  <span className="text-sm font-semibold text-charcoal">
                    {c.joined.filter((j) => j.status !== 'absent').length}
                    <span className="text-gray-400 font-normal"> / {c.enrolled} joined</span>
                  </span>
                )}
              </div>

              {!c.cancelled && c.joined.length > 0 && (
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {c.joined.map((j) => (
                    <li key={j.studentId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-charcoal truncate">{j.name}</p>
                        <p className="text-xs text-gray-400">
                          {j.viaLink ? `Clicked Join at ${istTime(j.joinedAt ?? '')}` : 'Marked by teacher'}
                        </p>
                      </div>
                      <JoinBadge entry={j} />
                    </li>
                  ))}
                </ul>
              )}

              {!c.cancelled && c.notJoined.length > 0 && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-600">Didn&apos;t join:</span>{' '}
                  {c.notJoined.map((s) => s.name).join(', ')}
                </p>
              )}

              {!c.cancelled && (
                <Link
                  href={`/teacher/classes/${c.instanceId}/attendance`}
                  className="inline-block text-xs text-teal-600 hover:text-teal-800 font-medium"
                >
                  Adjust attendance manually →
                </Link>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
