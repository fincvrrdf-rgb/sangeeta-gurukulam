/**
 * Admin Batch Management — /admin/batches
 *
 * Lists batch bands (A–D) with inline editing.
 * Each batch also shows its class slots (schedule) which can be added,
 * edited, and deleted without touching the rest of the app's class instances.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { BatchBand } from '@/domain/types';

interface TeacherOption { id: string; fullName: string; }

interface EditForm {
  assignedTeacherId: string;
  maxCapacityPerSlot: number;
  name: string;
  description: string;
  isActive: boolean;
  meetLink: string;
}

interface ClassSlot {
  id: string;
  dayOfWeek: number;
  startTimeLocal: string;
  endTimeLocal: string;
  slotType: 'regular' | 'makeup' | 'testing';
  isActive: boolean;
  teacherId: string;
}

interface SlotDraft {
  dayOfWeek: number;
  startTimeIST: string;
  endTimeIST: string;
  slotType: 'regular' | 'makeup' | 'testing';
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function emptyForm(band: BatchBand): EditForm {
  return {
    assignedTeacherId: band.assignedTeacherId ?? '',
    maxCapacityPerSlot: band.maxCapacityPerSlot ?? 8,
    name: band.name,
    description: band.description,
    isActive: band.isActive,
    meetLink: band.meetLink ?? '',
  };
}

function emptySlotDraft(): SlotDraft {
  return { dayOfWeek: 1, startTimeIST: '07:30', endTimeIST: '08:30', slotType: 'regular' };
}

function fmtTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function BandCodePill({ code }: { code: string }) {
  const colours: Record<string, string> = {
    A: 'bg-blue-100 text-blue-800',
    B: 'bg-purple-100 text-purple-800',
    C: 'bg-saffron-100 text-saffron-800',
    D: 'bg-teal-100 text-teal-800',
  };
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0 ${colours[code] ?? 'bg-gray-100 text-gray-800'}`}>
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
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Batch editing
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Slot management
  const [slots, setSlots] = useState<Record<string, ClassSlot[]>>({}); // bandId → slots
  const [addingSlot, setAddingSlot] = useState<string | null>(null);   // bandId being added to
  const [slotDraft, setSlotDraft] = useState<SlotDraft>(emptySlotDraft());
  const [savingSlot, setSavingSlot] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editSlotDraft, setEditSlotDraft] = useState<SlotDraft>(emptySlotDraft());
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch('/api/admin/batches').then((r) => r.json()),
      apiFetch('/api/admin/teachers').then((r) => r.json()),
    ])
      .then(([batchData, teacherData]) => {
        if (batchData.success) {
          const sorted = [...(batchData.batches ?? [])].sort((a: BatchBand, b: BatchBand) =>
            a.code.localeCompare(b.code)
          );
          setBands(sorted);
        } else {
          setError('Failed to load batch data.');
        }
        if (Array.isArray(teacherData.teachers)) {
          setTeachers(teacherData.teachers.map((t: { userId: string; fullName: string }) => ({
            id: t.userId, fullName: t.fullName,
          })));
        }
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function loadSlotsFor(bandId: string) {
    try {
      const res = await apiFetch(`/api/classes/slots?batchBandId=${bandId}`);
      const data = await res.json();
      const active = (data.slots ?? []).filter((s: ClassSlot) => s.isActive !== false);
      active.sort((a: ClassSlot, b: ClassSlot) =>
        a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.startTimeLocal.localeCompare(b.startTimeLocal)
      );
      setSlots((prev) => ({ ...prev, [bandId]: active }));
    } catch { /* non-fatal */ }
  }

  function openEdit(band: BatchBand) {
    if (expandedId === band.id) {
      setExpandedId(null); setForm(null); setSaveError(null); return;
    }
    setExpandedId(band.id);
    setForm(emptyForm(band));
    setSaveError(null);
    setSaveSuccess(null);
    loadSlotsFor(band.id);
  }

  async function handleSave(band: BatchBand) {
    if (!form) return;
    setSaving(true); setSaveError(null); setSaveSuccess(null);
    try {
      const res = await apiFetch('/api/admin/batches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: band.id, ...form }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setSaveError(json.error ?? 'Save failed.'); return; }
      setSaveSuccess('Batch updated successfully.');
      setExpandedId(null); setForm(null);
      load();
    } catch { setSaveError('Network error. Please try again.'); }
    finally { setSaving(false); }
  }

  async function handleSeedBatches() {
    setSeeding(true); setSeedMsg(null);
    try {
      const res = await apiFetch('/api/admin/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Seed failed');
      setSeedMsg(json.message ?? `${json.created} batch(es) created.`);
      load();
      setTimeout(() => setSeedMsg(null), 4000);
    } catch (e: unknown) {
      setSeedMsg('⚠️ ' + (e instanceof Error ? e.message : 'Could not seed batches.'));
    } finally { setSeeding(false); }
  }

  async function handleAddSlot(bandId: string) {
    setSavingSlot(true);
    try {
      const res = await apiFetch('/api/classes/slots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchBandId: bandId, ...slotDraft }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Failed'); }
      setAddingSlot(null);
      setSlotDraft(emptySlotDraft());
      loadSlotsFor(bandId);
    } catch (e) { alert(e instanceof Error ? e.message : 'Could not add slot.'); }
    finally { setSavingSlot(false); }
  }

  async function handleUpdateSlot(slotId: string, bandId: string) {
    setSavingSlot(true);
    try {
      const res = await apiFetch(`/api/classes/slots/${slotId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSlotDraft),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Failed'); }
      setEditingSlotId(null);
      loadSlotsFor(bandId);
    } catch (e) { alert(e instanceof Error ? e.message : 'Could not update slot.'); }
    finally { setSavingSlot(false); }
  }

  async function handleDeleteSlot(slotId: string, bandId: string) {
    setDeletingSlotId(slotId);
    try {
      const res = await apiFetch(`/api/classes/slots/${slotId}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Failed'); }
      loadSlotsFor(bandId);
    } catch (e) { alert(e instanceof Error ? e.message : 'Could not delete slot.'); }
    finally { setDeletingSlotId(null); }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Batch Management</h1>
          <p className="text-sm text-gray-500 mt-1">Edit batch details, schedules, and class slots</p>
        </div>
        {bands.length === 0 && !loading && (
          <button onClick={handleSeedBatches} disabled={seeding} className="btn-primary flex-shrink-0">
            {seeding ? 'Creating…' : '⚡ Create Standard Batches (A–D)'}
          </button>
        )}
      </div>

      {seedMsg && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{seedMsg}</div>}
      {saveSuccess && <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{saveSuccess}</div>}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="underline text-red-700">Retry</button>
        </div>
      )}

      {/* Band list */}
      <div className="space-y-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonBand key={i} />)
          : bands.length === 0 && !error
          ? <div className="card text-center py-12 text-gray-400 text-sm">No batch bands found.</div>
          : bands.map((band) => {
              const isExpanded = expandedId === band.id;
              const assignedTeacher = teachers.find((t) => t.id === band.assignedTeacherId);
              const bandSlots = slots[band.id] ?? [];

              return (
                <div key={band.id} className="card p-0 overflow-hidden">
                  {/* Summary row */}
                  <button onClick={() => openEdit(band)}
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors">
                    <BandCodePill code={band.code} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-charcoal truncate">{band.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{band.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-gray-400">
                          Teacher: <span className="text-charcoal font-medium">{assignedTeacher?.fullName ?? (band.assignedTeacherId ? 'Set' : 'Unassigned')}</span>
                        </span>
                        <span className="text-xs text-gray-400">
                          Capacity: <span className="text-charcoal font-medium">{band.maxCapacityPerSlot ?? '—'} per slot</span>
                        </span>
                        {band.meetLink && (
                          <span className="text-xs text-teal-600 truncate max-w-[220px]">
                            📹 {band.meetLink.replace('https://', '')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`badge ${band.isActive ? 'badge-success' : 'badge-neutral'}`}>
                        {band.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Edit form */}
                  {isExpanded && form && (
                    <div className="border-t border-gray-100 bg-saffron-50 px-5 py-5 space-y-5">
                      <h3 className="section-title text-sm">Batch {band.code} Details</h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
                          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Teacher</label>
                          {teachers.length > 0 ? (
                            <select className="input" value={form.assignedTeacherId}
                              onChange={(e) => setForm({ ...form, assignedTeacherId: e.target.value })}>
                              <option value="">— Unassigned —</option>
                              {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                            </select>
                          ) : (
                            <input className="input" placeholder="Teacher UID" value={form.assignedTeacherId}
                              onChange={(e) => setForm({ ...form, assignedTeacherId: e.target.value })} />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Max Capacity / Slot</label>
                          <input type="number" min={1} max={50} className="input" value={form.maxCapacityPerSlot}
                            onChange={(e) => setForm({ ...form, maxCapacityPerSlot: Number(e.target.value) })} />
                        </div>
                        <div className="flex items-center gap-3 pt-5">
                          <button type="button" role="switch" aria-checked={form.isActive}
                            onClick={() => setForm({ ...form, isActive: !form.isActive })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isActive ? 'bg-saffron-600' : 'bg-gray-300'}`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                          <span className="text-sm text-charcoal">Batch {form.isActive ? 'active' : 'inactive'}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                        <textarea className="input" rows={2} value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })} />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Batch Meet Link (one stable link for every class of this batch)
                        </label>
                        <input className="input" type="url" placeholder="https://meet.google.com/xxx-yyyy-zzz"
                          value={form.meetLink}
                          onChange={(e) => setForm({ ...form, meetLink: e.target.value })} />
                        <p className="text-[11px] text-gray-500 mt-1">
                          Students always join through this link — it never changes with the date.
                        </p>
                      </div>

                      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

                      <div className="flex gap-3">
                        <button onClick={() => handleSave(band)} disabled={saving} className="btn-primary">
                          {saving ? 'Saving…' : 'Save Batch'}
                        </button>
                        <button onClick={() => { setExpandedId(null); setForm(null); setSaveError(null); }}
                          disabled={saving} className="btn-secondary">Cancel</button>
                      </div>

                      {/* ── Class Schedule / Slots ── */}
                      <div className="border-t border-saffron-200 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-charcoal">Class Schedule</h4>
                          <button
                            onClick={() => { setAddingSlot(addingSlot === band.id ? null : band.id); setSlotDraft(emptySlotDraft()); }}
                            className="text-xs text-saffron-700 border border-saffron-400 rounded px-2.5 py-1 hover:bg-saffron-100"
                          >
                            + Add Slot
                          </button>
                        </div>

                        {bandSlots.length === 0 && addingSlot !== band.id && (
                          <p className="text-xs text-gray-400 italic">No recurring slots yet. Add one to define when this batch meets.</p>
                        )}

                        {/* Existing slots */}
                        {bandSlots.map((slot) => (
                          <div key={slot.id}>
                            {editingSlotId === slot.id ? (
                              <SlotForm
                                draft={editSlotDraft}
                                setDraft={setEditSlotDraft}
                                onSave={() => handleUpdateSlot(slot.id, band.id)}
                                onCancel={() => setEditingSlotId(null)}
                                saving={savingSlot}
                                label="Update"
                              />
                            ) : (
                              <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2.5">
                                <div className="flex-1">
                                  <span className="text-xs font-semibold text-charcoal">{DAYS[slot.dayOfWeek]}</span>
                                  <span className="text-xs text-gray-500 ml-2">{fmtTime(slot.startTimeLocal)} – {fmtTime(slot.endTimeLocal)}</span>
                                  {slot.slotType !== 'regular' && (
                                    <span className="ml-2 text-[10px] uppercase font-medium text-saffron-700 bg-saffron-50 rounded px-1.5 py-0.5">
                                      {slot.slotType}
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    setEditingSlotId(slot.id);
                                    setEditSlotDraft({ dayOfWeek: slot.dayOfWeek, startTimeIST: slot.startTimeLocal, endTimeIST: slot.endTimeLocal, slotType: slot.slotType });
                                  }}
                                  className="text-xs text-blue-600 hover:underline"
                                >Edit</button>
                                <button
                                  onClick={() => handleDeleteSlot(slot.id, band.id)}
                                  disabled={deletingSlotId === slot.id}
                                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                                >{deletingSlotId === slot.id ? '…' : 'Remove'}</button>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add slot form */}
                        {addingSlot === band.id && (
                          <SlotForm
                            draft={slotDraft}
                            setDraft={setSlotDraft}
                            onSave={() => handleAddSlot(band.id)}
                            onCancel={() => setAddingSlot(null)}
                            saving={savingSlot}
                            label="Add Slot"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {!loading && bands.length > 0 && (
        <p className="text-xs text-gray-400 text-center">Click a batch to expand and edit details or schedule.</p>
      )}
    </div>
  );
}

function SlotForm({ draft, setDraft, onSave, onCancel, saving, label }: {
  draft: SlotDraft;
  setDraft: (d: SlotDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="bg-white border border-saffron-300 rounded-lg px-3 py-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-1">Day</label>
          <select className="input text-xs" value={draft.dayOfWeek}
            onChange={(e) => setDraft({ ...draft, dayOfWeek: Number(e.target.value) })}>
            {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-1">Type</label>
          <select className="input text-xs" value={draft.slotType}
            onChange={(e) => setDraft({ ...draft, slotType: e.target.value as SlotDraft['slotType'] })}>
            <option value="regular">Regular</option>
            <option value="makeup">Makeup</option>
            <option value="testing">Testing</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-1">Start Time (IST)</label>
          <input type="time" className="input text-xs" value={draft.startTimeIST}
            onChange={(e) => setDraft({ ...draft, startTimeIST: e.target.value })} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-1">End Time (IST)</label>
          <input type="time" className="input text-xs" value={draft.endTimeIST}
            onChange={(e) => setDraft({ ...draft, endTimeIST: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
          {saving ? 'Saving…' : label}
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
      </div>
    </div>
  );
}
