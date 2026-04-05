/**
 * Admin Syllabus Management — /admin/syllabus
 *
 * Displays Ganamrutha Bodhini book with the full lesson/unit tree.
 * Leaf lessons (1–4) expand to show their single teaching unit.
 * Container lessons (Geethams, Swarajathis, Varnams) expand to show all units.
 * Shows "Seed Syllabus" button when empty.
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

interface UnitFormState {
  unitName: string;
  ragam: string;
  taalam: string;
  estimatedClassCount: number;
}

const EMPTY_FORM: UnitFormState = {
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

const LESSON_ICONS: Record<number, string> = {
  1: '🎵', 2: '🎵', 3: '🎵', 4: '🎵',
  5: '🎼', 6: '🎼', 7: '🎼',
};

export default function SyllabusPage() {
  const { user, apiFetch } = useAuthContext();
  const [data, setData] = useState<SyllabusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  // Which container lessons are expanded
  const [expandedLessonIds, setExpandedLessonIds] = useState<Set<string>>(new Set());

  // Inline form state for adding/editing units inside a container lesson
  const [addingToLessonId, setAddingToLessonId] = useState<string | null>(null);
  const [editingUnit, setEditingUnit] = useState<TeachingUnit | null>(null);
  const [form, setForm] = useState<UnitFormState>(EMPTY_FORM);
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

  async function handleSeedSyllabus() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res = await apiFetch('/api/admin/syllabus/seed', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Seed failed');
      setSeedMsg(`Syllabus seeded: ${json.lessonsCreated} lessons and ${json.unitsCreated} teaching units created.`);
      load();
    } catch (e: unknown) {
      setSeedMsg('Error: ' + (e instanceof Error ? e.message : 'Could not seed syllabus.'));
    } finally {
      setSeeding(false);
    }
  }

  function toggleExpand(lessonId: string) {
    setExpandedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  }

  function startAdd(lessonId: string) {
    setAddingToLessonId(lessonId);
    setEditingUnit(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  function startEdit(unit: TeachingUnit, lessonId: string) {
    setAddingToLessonId(lessonId);
    setEditingUnit(unit);
    setForm({
      unitName: unit.unitName,
      ragam: unit.ragam ?? '',
      taalam: unit.taalam ?? '',
      estimatedClassCount: unit.estimatedClassCount,
    });
    setSaveError(null);
  }

  function cancelForm() {
    setAddingToLessonId(null);
    setEditingUnit(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!addingToLessonId || !data?.books[0]) return;
    setSaving(true);
    setSaveError(null);

    const lessonUnits = (data?.units ?? []).filter((u) => u.lessonId === addingToLessonId);

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
            lessonId: addingToLessonId,
            bookId: data.books[0].id,
            unitType: 'geetham',
            unitName: form.unitName,
            ragam: form.ragam || null,
            taalam: form.taalam || null,
            estimatedClassCount: form.estimatedClassCount,
            unitNumber: lessonUnits.length + 1,
            order: lessonUnits.length + 1,
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

  const sortedLessons = (data?.lessons ?? []).sort((a, b) => a.lessonNumber - b.lessonNumber);
  const isEmpty = !loading && (!data?.lessons.length);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Syllabus</h1>
          <p className="text-sm text-gray-500 mt-1">Ganamrutha Bodhini — lessons and teaching units</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {isEmpty && (
            <button onClick={handleSeedSyllabus} disabled={seeding} className="btn-primary">
              {seeding ? 'Seeding…' : '⚡ Seed Full Syllabus'}
            </button>
          )}
          {!isEmpty && (
            <button onClick={handleSeedSyllabus} disabled={seeding} className="btn-secondary text-xs">
              {seeding ? 'Seeding…' : '↻ Resync Syllabus'}
            </button>
          )}
        </div>
      </div>

      {/* Copyright notice */}
      <div className="rounded-xl border border-saffron-200 bg-saffron-50 px-4 py-3 text-xs text-saffron-800 space-y-1">
        <p className="font-semibold">
          Lesson structure sourced from{' '}
          <a
            href="https://www.amazon.in/dp/B0DFHZG1J6"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline text-saffron-700 font-bold"
          >
            Ganamrutha Bodhini by A.S. Panchapakesa Iyer
          </a>{' '}
          (Ganamrutha Prachuram, Chennai)
        </p>
        <p className="text-saffron-700">
          This app stores only teacher-authored planning metadata (lesson names, ragam, taalam).
          No book pages, notation, or lyrics text are reproduced.
          Students are encouraged to purchase a copy for reference.
        </p>
      </div>

      {seedMsg && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${seedMsg.startsWith('Error') ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-800'}`}>
          {seedMsg}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <button onClick={load} className="ml-3 underline text-red-700 hover:no-underline">Retry</button>
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

          {/* Lessons */}
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5"><SkeletonRow /></div>
              ))
            : sortedLessons.map((lesson) => {
                const lessonUnits = (data?.units ?? [])
                  .filter((u) => u.lessonId === lesson.id)
                  .sort((a, b) => a.unitNumber - b.unitNumber);
                const isExpanded = expandedLessonIds.has(lesson.id);
                const icon = LESSON_ICONS[lesson.lessonNumber] ?? '🎵';

                return (
                  <div key={lesson.id}>
                    <button
                      onClick={() => toggleExpand(lesson.id)}
                      className="w-full px-5 py-3 border-b border-gray-100 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="text-lg flex-shrink-0">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal">
                          Lesson {lesson.lessonNumber} — {lesson.lessonName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {lesson.isContainer
                            ? `${lessonUnits.length} unit${lessonUnits.length !== 1 ? 's' : ''}`
                            : lessonUnits[0]
                            ? `${lessonUnits[0].ragam ?? '—'} · ${lessonUnits[0].taalam ?? '—'}`
                            : 'No unit data'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`badge ${lesson.isActive ? 'badge-success' : 'badge-neutral'}`}>
                          {lesson.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <>
                        {lessonUnits.length === 0 ? (
                          <div className="px-10 py-3 text-sm text-gray-400 italic border-b border-gray-100">
                            No units yet.
                          </div>
                        ) : (
                          lessonUnits.map((unit) => (
                            <div
                              key={unit.id}
                              className="px-10 py-2.5 border-b border-gray-50 flex items-center gap-3 hover:bg-gray-50 group"
                            >
                              <span className="text-base flex-shrink-0">🎶</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-charcoal truncate">{unit.unitName}</p>
                                <p className="text-xs text-gray-500">
                                  {[unit.ragam, unit.taalam].filter(Boolean).join(' · ') || 'No ragam/taalam set'}
                                  {' · '}~{unit.estimatedClassCount} class{unit.estimatedClassCount !== 1 ? 'es' : ''}
                                </p>
                              </div>
                              <span className={`badge flex-shrink-0 ${unit.isActive ? 'badge-success' : 'badge-neutral'}`}>
                                {unit.isActive ? 'Active' : 'Inactive'}
                              </span>
                              {lesson.isContainer && (
                                <button
                                  onClick={() => startEdit(unit, lesson.id)}
                                  className="text-xs text-saffron-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          ))
                        )}

                        {/* Add unit form / button (container lessons only) */}
                        {lesson.isContainer && (
                          <>
                            {addingToLessonId === lesson.id ? (
                              <div className="px-5 py-4 border-b border-gray-100 bg-saffron-50">
                                <h3 className="section-title text-sm mb-3">
                                  {editingUnit ? 'Edit Unit' : `Add to Lesson ${lesson.lessonNumber}`}
                                </h3>
                                <form onSubmit={submitForm} className="space-y-3">
                                  <input
                                    className="input text-sm"
                                    value={form.unitName}
                                    onChange={(e) => setForm({ ...form, unitName: e.target.value })}
                                    placeholder="Unit name (e.g. Geetham 14 — Ninnu Vina)"
                                    required
                                  />
                                  <div className="grid grid-cols-2 gap-3">
                                    <input
                                      className="input text-sm"
                                      value={form.ragam}
                                      onChange={(e) => setForm({ ...form, ragam: e.target.value })}
                                      placeholder="Ragam"
                                    />
                                    <input
                                      className="input text-sm"
                                      value={form.taalam}
                                      onChange={(e) => setForm({ ...form, taalam: e.target.value })}
                                      placeholder="Taalam"
                                    />
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <label className="text-xs text-gray-600">Est. classes:</label>
                                    <input
                                      type="number" min={1} max={30}
                                      className="input text-sm w-20"
                                      value={form.estimatedClassCount}
                                      onChange={(e) => setForm({ ...form, estimatedClassCount: Number(e.target.value) })}
                                    />
                                  </div>
                                  {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                                  <div className="flex gap-2">
                                    <button type="submit" className="btn-primary text-sm" disabled={saving}>
                                      {saving ? 'Saving…' : editingUnit ? 'Save' : 'Add'}
                                    </button>
                                    <button type="button" className="btn-secondary text-sm" onClick={cancelForm} disabled={saving}>
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              </div>
                            ) : (
                              <div className="px-10 py-2 border-b border-gray-100">
                                <button
                                  onClick={() => startAdd(lesson.id)}
                                  className="text-xs text-saffron-600 hover:underline"
                                >
                                  + Add unit
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

          {/* Empty state */}
          {!loading && !error && isEmpty && (
            <div className="px-5 py-12 text-center">
              <p className="text-gray-400 text-sm mb-4">No syllabus data found.</p>
              <button onClick={handleSeedSyllabus} disabled={seeding} className="btn-primary">
                {seeding ? 'Seeding…' : '⚡ Seed Full Syllabus from Ganamrutha Bodhini'}
              </button>
            </div>
          )}
        </div>
      </section>

      {!loading && !isEmpty && (
        <p className="text-xs text-gray-400 text-center">
          Click any row to expand · Lesson metadata only — no copyrighted content stored
        </p>
      )}
    </div>
  );
}
