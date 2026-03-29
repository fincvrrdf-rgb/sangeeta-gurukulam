/**
 * Admin Syllabus Management — /admin/syllabus
 *
 * Displays Ganamrutha Bodhini book with the full lesson/unit tree.
 * Lessons 1–4 are leaf nodes; Lesson 5 (Geethams) is expandable.
 * Supports inline add/edit for geethams via POST /api/admin/syllabus.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { SyllabusBook, SyllabusLesson, TeachingUnit } from '@/domain/types';

interface SyllabusData {
  books: SyllabusBook[];
  lessons: SyllabusLesson[];
  units: TeachingUnit[];
}

interface GeethamFormState {
  unitName: string;
  ragam: string;
  taalam: string;
  estimatedClassCount: number;
}

const EMPTY_FORM: GeethamFormState = {
  unitName: '',
  ragam: '',
  taalam: '',
  estimatedClassCount: 4,
};

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100">
      <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
      <div className="h-4 flex-1 bg-gray-200 animate-pulse rounded" />
      <div className="h-4 w-24 bg-gray-100 animate-pulse rounded" />
    </div>
  );
}

export default function SyllabusPage() {
  const { user, apiFetch } = useAuthContext();
  const [data, setData] = useState<SyllabusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Geetham tree expand
  const [geethamExpanded, setGeethamExpanded] = useState(true);

  // Inline form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<TeachingUnit | null>(null);
  const [form, setForm] = useState<GeethamFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    apiFetch('/api/admin/syllabus')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d);
        else setError('Failed to load syllabus data.');
      })
      .catch(() => setError('Network error loading syllabus.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const geethamsLesson = data?.lessons.find((l) => l.isContainer);
  const geethams = geethamsLesson
    ? (data?.units ?? [])
        .filter((u) => u.lessonId === geethamsLesson.id)
        .sort((a, b) => a.unitNumber - b.unitNumber)
    : [];
  const leafLessons = (data?.lessons ?? [])
    .filter((l) => !l.isContainer)
    .sort((a, b) => a.lessonNumber - b.lessonNumber);

  function startAdd() {
    setEditingUnit(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setShowAddForm(true);
  }

  function startEdit(unit: TeachingUnit) {
    setEditingUnit(unit);
    setForm({
      unitName: unit.unitName,
      ragam: unit.ragam ?? '',
      taalam: unit.taalam ?? '',
      estimatedClassCount: unit.estimatedClassCount,
    });
    setSaveError(null);
    setShowAddForm(true);
  }

  function cancelForm() {
    setShowAddForm(false);
    setEditingUnit(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!geethamsLesson || !data?.books[0]) return;
    setSaving(true);
    setSaveError(null);

    const payload = editingUnit
      ? {
          type: 'unit',
          data: {
            id: editingUnit.id,
            unitName: form.unitName,
            ragam: form.ragam || null,
            taalam: form.taalam || null,
            estimatedClassCount: form.estimatedClassCount,
          },
        }
      : {
          type: 'unit',
          data: {
            lessonId: geethamsLesson.id,
            bookId: data.books[0].id,
            unitType: 'geetham',
            unitName: form.unitName,
            ragam: form.ragam || null,
            taalam: form.taalam || null,
            estimatedClassCount: form.estimatedClassCount,
            unitNumber: geethams.length + 1,
            order: geethams.length + 1,
            isActive: true,
          },
        };

    try {
      const res = await apiFetch('/api/admin/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError(json.error ?? 'Save failed.');
        return;
      }
      cancelForm();
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">
            Syllabus Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ganamrutha Bodhini — lessons and teaching units
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Lessons sourced from{' '}
            <a
              href="https://www.amazon.in/dp/B0DFHZG1J6"
              target="_blank"
              rel="noopener noreferrer"
              className="text-saffron-600 hover:underline"
            >
              Ganamrutha Bodhini by A.S. Panchapakesa Iyer
            </a>
          </p>
        </div>
        <button onClick={startAdd} className="btn-primary flex-shrink-0">
          + Add Lesson
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <button onClick={load} className="ml-3 underline text-red-700 hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Inline Add/Edit Form */}
      {showAddForm && (
        <div className="card border-saffron-300 bg-saffron-50">
          <h3 className="section-title mb-4">
            {editingUnit ? 'Edit Lesson' : 'New Lesson'}
          </h3>
          <form onSubmit={submitForm} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Lesson Name <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                value={form.unitName}
                onChange={(e) => setForm({ ...form, unitName: e.target.value })}
                placeholder="e.g. Geetham 14 — Ninnu Vina"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ragam
                </label>
                <input
                  className="input"
                  value={form.ragam}
                  onChange={(e) => setForm({ ...form, ragam: e.target.value })}
                  placeholder="e.g. Kalyani"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Taalam
                </label>
                <input
                  className="input"
                  value={form.taalam}
                  onChange={(e) => setForm({ ...form, taalam: e.target.value })}
                  placeholder="e.g. Adi Thalam"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Estimated Class Count
              </label>
              <input
                type="number"
                min={1}
                max={30}
                className="input w-32"
                value={form.estimatedClassCount}
                onChange={(e) =>
                  setForm({ ...form, estimatedClassCount: Number(e.target.value) })
                }
              />
            </div>
            {saveError && (
              <p className="text-sm text-red-600">{saveError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving…' : editingUnit ? 'Save Changes' : 'Add Lesson'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={cancelForm}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Syllabus Tree */}
      <section>
        <div className="card space-y-0 p-0 overflow-hidden">
          {/* Book header */}
          {loading ? (
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="h-5 w-48 bg-gray-200 animate-pulse rounded" />
            </div>
          ) : data?.books[0] ? (
            <div className="px-5 py-4 bg-saffron-50 border-b border-saffron-200">
              <p className="font-heading font-semibold text-saffron-900 text-sm">
                📖 {data.books[0].title}
              </p>
              <p className="text-xs text-saffron-700 mt-0.5">
                by {data.books[0].authorName} &mdash;{' '}
                <a
                  href="https://www.amazon.in/dp/B0DFHZG1J6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  Buy on Amazon
                </a>
              </p>
            </div>
          ) : null}

          {/* Leaf lessons (1–4) */}
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5">
                  <SkeletonRow />
                </div>
              ))
            : leafLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="px-5 py-3 border-b border-gray-100 flex items-center gap-3"
                >
                  <span className="text-lg">🎵</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      Lesson {lesson.lessonNumber} — {lesson.lessonName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Batch {lesson.batchBandCode} &middot; Single teaching unit
                    </p>
                  </div>
                  <span
                    className={`badge ${
                      lesson.isActive ? 'badge-success' : 'badge-neutral'
                    }`}
                  >
                    {lesson.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}

          {/* Lesson 5 — Geethams (expandable) */}
          {!loading && geethamsLesson && (
            <>
              <button
                onClick={() => setGeethamExpanded((prev) => !prev)}
                className="w-full px-5 py-3 border-b border-gray-100 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="text-lg">🎼</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-charcoal">
                    Lesson 5 — Geethams
                  </p>
                  <p className="text-xs text-gray-500">
                    Batch {geethamsLesson.batchBandCode} &middot;{' '}
                    {geethams.length} geetham{geethams.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-gray-400 text-xs font-medium">
                  {geethamExpanded ? '▲ collapse' : '▼ expand'}
                </span>
              </button>

              {geethamExpanded && (
                <>
                  {geethams.length === 0 ? (
                    <div className="px-10 py-4 text-sm text-gray-400 italic">
                      No lessons added yet. Use &ldquo;Add Lesson&rdquo; above.
                    </div>
                  ) : (
                    geethams.map((unit) => (
                      <div
                        key={unit.id}
                        className="px-10 py-2.5 border-b border-gray-50 flex items-center gap-3 hover:bg-gray-50 group"
                      >
                        <span className="text-base flex-shrink-0">🎶</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-charcoal truncate">
                            {unit.unitName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {[unit.ragam, unit.taalam]
                              .filter(Boolean)
                              .join(' · ') || 'No ragam/taalam set'}
                            {' · '}
                            ~{unit.estimatedClassCount} class
                            {unit.estimatedClassCount !== 1 ? 'es' : ''}
                          </p>
                        </div>
                        <span
                          className={`badge flex-shrink-0 ${
                            unit.isActive ? 'badge-success' : 'badge-neutral'
                          }`}
                        >
                          {unit.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button
                          onClick={() => startEdit(unit)}
                          className="text-xs text-saffron-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    ))
                  )}
                  <div className="px-10 py-2.5">
                    <button
                      onClick={startAdd}
                      className="text-xs text-saffron-600 hover:underline"
                    >
                      + Add another lesson
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Empty state */}
          {!loading && !error && !data?.lessons.length && (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              No syllabus data found. Run the seed script to populate.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
