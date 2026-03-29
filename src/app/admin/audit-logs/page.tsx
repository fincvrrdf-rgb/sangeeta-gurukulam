/**
 * Admin Audit Logs — /admin/audit-logs
 *
 * Paginated table of audit log entries: action, userId, entityId, IP, timestamp.
 * Filterable by action type and date range.
 * Fetches from GET /api/admin/audit-logs (ordered by timestamp desc, default 50).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { AuditLog } from '@/domain/types';

// ── Action colour map ───────────────────────────────────────────────────────

const ACTION_BADGE: Record<string, string> = {
  // Settings
  APP_SETTINGS_UPDATED: 'badge-info',
  // Batches
  BATCH_BAND_UPDATED: 'badge-info',
  // Syllabus
  SYLLABUS_UNIT_CREATED: 'badge-success',
  SYLLABUS_UNIT_UPDATED: 'badge-info',
  // Events
  DEVOTIONAL_EVENT_CREATED: 'badge-success',
  // Auth
  USER_ROLE_SET: 'badge-warning',
  // Payments
  PAYMENT_WAIVED: 'badge-warning',
  PAYMENT_PROOF_REVIEWED: 'badge-info',
  // Attendance
  ATTENDANCE_MARKED: 'badge-success',
  // Absence
  LONG_ABSENCE_APPROVED: 'badge-success',
  LONG_ABSENCE_REJECTED: 'badge-error',
  // Reports
  WEEKLY_REPORT_PUBLISHED: 'badge-success',
  // Default
  default: 'badge-neutral',
};

function actionBadge(action: string) {
  return ACTION_BADGE[action] ?? ACTION_BADGE.default;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function truncate(s: string | null | undefined, n = 24): string {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-200 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

// Common action types for the filter dropdown
const ACTION_OPTIONS = [
  '',
  'APP_SETTINGS_UPDATED',
  'BATCH_BAND_UPDATED',
  'SYLLABUS_UNIT_CREATED',
  'SYLLABUS_UNIT_UPDATED',
  'DEVOTIONAL_EVENT_CREATED',
  'USER_ROLE_SET',
  'PAYMENT_WAIVED',
  'PAYMENT_PROOF_REVIEWED',
  'ATTENDANCE_MARKED',
  'LONG_ABSENCE_APPROVED',
  'LONG_ABSENCE_REJECTED',
  'WEEKLY_REPORT_PUBLISHED',
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function AuditLogsPage() {
  const { user, apiFetch } = useAuthContext();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [pageSize, setPageSize] = useState(50);

  // Expanded row (for details)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: String(pageSize) });
    if (filterAction) params.set('action', filterAction);
    if (filterDateFrom) params.set('dateFrom', filterDateFrom);
    if (filterDateTo) params.set('dateTo', filterDateTo);

    apiFetch(`/api/admin/audit-logs?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setLogs(d.logs ?? []);
        } else {
          setError('Failed to load audit logs.');
        }
      })
      .catch(() => setError('Network error loading audit logs.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch, filterAction, filterDateFrom, filterDateTo, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Audit Logs
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Recent system activity — changes, role assignments, and admin actions.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="underline text-red-700 hover:no-underline flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Action Type
          </label>
          <select
            className="input"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <option value="">All Actions</option>
            {ACTION_OPTIONS.filter(Boolean).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            From Date
          </label>
          <input
            type="date"
            className="input w-36"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            To Date
          </label>
          <input
            type="date"
            className="input w-36"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Show
          </label>
          <select
            className="input w-24"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} rows
              </option>
            ))}
          </select>
        </div>
        <button onClick={load} className="btn-secondary self-end">
          Apply
        </button>
        {(filterAction || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => {
              setFilterAction('');
              setFilterDateFrom('');
              setFilterDateTo('');
            }}
            className="btn-secondary self-end text-gray-500"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                Timestamp
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                Actor ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                Entity
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                Entity ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                IP
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : logs.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-gray-400 text-sm"
                >
                  No audit logs found for the selected filters.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <>
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(log.id)}
                    >
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`badge ${actionBadge(log.action)} text-xs`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                        {truncate(log.actorId, 12)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {log.entityType ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {truncate(log.entityId, 12)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                        {log.ipAddress ?? '—'}
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${log.id}-detail`} className="bg-saffron-50">
                        <td
                          colSpan={6}
                          className="px-6 py-4 text-xs text-gray-700 space-y-2"
                        >
                          <div className="flex flex-wrap gap-6">
                            <div>
                              <span className="font-semibold text-gray-500">
                                Full Actor ID:
                              </span>{' '}
                              <span className="font-mono">{log.actorId}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-gray-500">
                                Actor Role:
                              </span>{' '}
                              {log.actorRole}
                            </div>
                            <div>
                              <span className="font-semibold text-gray-500">
                                Full Entity ID:
                              </span>{' '}
                              <span className="font-mono">{log.entityId}</span>
                            </div>
                          </div>
                          {log.notes && (
                            <div>
                              <span className="font-semibold text-gray-500">
                                Notes:
                              </span>{' '}
                              {log.notes}
                            </div>
                          )}
                          {log.newStateJson && (
                            <div>
                              <p className="font-semibold text-gray-500 mb-1">
                                New State:
                              </p>
                              <pre className="bg-white border border-gray-200 rounded p-2 text-xs overflow-x-auto max-h-40">
                                {(() => {
                                  try {
                                    return JSON.stringify(
                                      JSON.parse(log.newStateJson),
                                      null,
                                      2
                                    );
                                  } catch {
                                    return log.newStateJson;
                                  }
                                })()}
                              </pre>
                            </div>
                          )}
                          {log.previousStateJson && (
                            <div>
                              <p className="font-semibold text-gray-500 mb-1">
                                Previous State:
                              </p>
                              <pre className="bg-white border border-gray-200 rounded p-2 text-xs overflow-x-auto max-h-40">
                                {(() => {
                                  try {
                                    return JSON.stringify(
                                      JSON.parse(log.previousStateJson),
                                      null,
                                      2
                                    );
                                  } catch {
                                    return log.previousStateJson;
                                  }
                                })()}
                              </pre>
                            </div>
                          )}
                          {log.userAgent && (
                            <div className="text-gray-400 truncate">
                              <span className="font-semibold text-gray-500">
                                User Agent:
                              </span>{' '}
                              {log.userAgent}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!loading && logs.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            Showing {logs.length} entr{logs.length !== 1 ? 'ies' : 'y'}
            {logs.length === pageSize ? ` (limit reached — increase &ldquo;Show&rdquo; for more)` : ''}
          </span>
          <span>Click a row to expand details</span>
        </div>
      )}
    </div>
  );
}
