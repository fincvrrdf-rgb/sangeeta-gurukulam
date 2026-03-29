/**
 * Admin Batch Management — /admin/batches
 *
 * Lists the four batch bands (A–D) with their details.
 * Inline expand to edit teacher assignment and capacity.
 * GET /api/admin/batches · PATCH /api/admin/batches
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { BatchBand } from '@/domain/types';

interface TeacherOption {
  id: string;
  fullName: string;
}

interface EditForm {
  assignedTeacherId: string;
  maxCapacityPerSlot: number;
  name: string;
  description: string;
  isActive: boolean;
}

function emptyForm(band: BatchBand): EditForm {
  return {
    assignedTeacherId: band.assignedTeacherId ?? '',
    maxCapacityPerSlot: band.maxCapacityPerSlot ?? 8,
    name: band.name,
    description: band.description,
    isActive: band.isActive,
  };
}

function BandCodePill({ code }: { code: string }) {
  const colours: Record<string, string> = {
    A: 'bg-blue-100 text-blue-800',
    B: 'bg-purple-100 text-purple-800',
    C: 'bg-saffron-100 text-saffron-800',
    D: 'bg-teal-100 text-teal-800',
  };
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0 ${
        colours[code] ?? 'bg-gray-100 text-gray-800'
      }`}
    >
      {code}
    </span>
  );
}

function SkeletonBand() {
  return (
    <div className="card animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-48 bg-gray-200 rounded" />
          <div className="h-3 w-32 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function BatchesPage() {
  const { user, apiFetch } = useAuthContext();

  const [bands, setBands] = useState<BatchBand[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // editing
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch('/api/admin/batches').then((r) => r.json()),
      apiFetch('/api/admin/syllabus').then((r) => r.json()),
    ])
      .then(([batchData, _syllabusData]) => {
        if (batchData.success) {
          const sorted = [...(batchData.batches ?? [])].sort((a: BatchBand, b: BatchBand) =>
            a.code.localeCompare(b.code)
          );
          setBands(sorted);
        } else {
          setError('Failed to load batch data.');
        }
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false));

    // Load teacher profiles for the dropdown
    apiFetch('/api/admin/teachers')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.teachers)) {
          setTeachers(
            d.teachers.map((t: { userId: string; fullName: string }) => ({
              id: t.userId,
              fullName: t.fullName,
            }))
          );
        }
      })
      .catch(() => {
        // teachers dropdown is best-effort
      });
  }, [user, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(band: BatchBand) {
    if (expandedId === band.id) {
      setExpandedId(null);
      setForm(null);
      setSaveError(null);
      return;
    }
    setExpandedId(band.id);
    setForm(emptyForm(band));
    setSaveError(null);
    setSaveSuccess(null);
  }

  async function handleSave(band: BatchBand) {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await apiFetch('/api/admin/batches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: band.id, ...form }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError(json.error ?? 'Save failed. Please try again.');
        return;
      }
      setSaveSuccess('Batch band updated successfully.');
      setExpandedId(null);
      setForm(null);
      load();
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Batch Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Batch bands A–D — teacher assignments and capacity settings
        </p>
      </div>

      {/* Global success */}
      {saveSuccess && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          {saveSuccess}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="underline text-red-700 hover:no-underline flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Band list */}
      <div className="space-y-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonBand key={i} />)
          : bands.length === 0 && !error
          ? (
            <div className="card text-center py-12 text-gray-400 text-sm">
              No batch bands found. Check your Firestore setup.
            </div>
          )
          : bands.map((band) => {
              const isExpanded = expandedId === band.id;
              const assignedTeacher = teachers.find((t) => t.id === band.assignedTeacherId);

              return (
                <div key={band.id} className="card p-0 overflow-hidden">
                  {/* Band summary row */}
                  <button
                    onClick={() => openEdit(band)}
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <BandCodePill code={band.code} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-charcoal truncate">
                        {band.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {band.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-gray-400">
                          Teacher:{' '}
                          <span className="text-charcoal font-medium">
                            {assignedTeacher?.fullName ?? (band.assignedTeacherId ? 'ID: ' + band.assignedTeacherId.slice(0, 8) + '…' : 'Unassigned')}
                          </span>
                        </span>
                        <span className="text-xs text-gray-400">
                          Capacity:{' '}
                          <span className="text-charcoal font-medium">
                            {band.maxCapacityPerSlot ?? '—'} per slot
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`badge ${
                          band.isActive ? 'badge-success' : 'badge-neutral'
                        }`}
                      >
                        {band.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </button>

                  {/* Inline edit form */}
                  {isExpanded && form && (
                    <div className="border-t border-gray-100 bg-saffron-50 px-5 py-5 space-y-4">
                      <h3 className="section-title text-sm">Edit Batch {band.code}</h3>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Display Name
                        </label>
                        <input
                          className="input"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <textarea
                          className="input"
                          rows={2}
                          value={form.description}
                          onChange={(e) =>
                            setForm({ ...form, description: e.target.value })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Assigned Teacher
                          </label>
                          {teachers.length > 0 ? (
                            <select
                              className="input"
                              value={form.assignedTeacherId}
                              onChange={(e) =>
                                setForm({ ...form, assignedTeacherId: e.target.value })
                              }
                            >
                              <option value="">— Unassigned —</option>
                              {teachers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.fullName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="input"
                              placeholder="Teacher UID"
                              value={form.assignedTeacherId}
                              onChange={(e) =>
                                setForm({ ...form, assignedTeacherId: e.target.value })
                              }
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Max Capacity / Slot
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            className="input"
                            value={form.maxCapacityPerSlot}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                maxCapacityPerSlot: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={form.isActive}
                          onClick={() => setForm({ ...form, isActive: !form.isActive })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-saffron-500 focus:ring-offset-2 ${
                            form.isActive ? 'bg-saffron-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              form.isActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="text-sm text-charcoal">
                          Batch {form.isActive ? 'active' : 'inactive'}
                        </span>
                      </div>

                      {saveError && (
                        <p className="text-sm text-red-600">{saveError}</p>
                      )}

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleSave(band)}
                          disabled={saving}
                          className="btn-primary"
                        >
                          {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button
                          onClick={() => {
                            setExpandedId(null);
                            setForm(null);
                            setSaveError(null);
                          }}
                          disabled={saving}
                          className="btn-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {/* Legend */}
      {!loading && bands.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Click a batch band row to expand its edit form.
        </p>
      )}
    </div>
  );
}
