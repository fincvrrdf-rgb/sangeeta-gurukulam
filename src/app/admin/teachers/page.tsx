/**
 * Admin Teacher Management — /admin/teachers
 *
 * Lists all teachers with their profiles, batch band assignments, and status.
 * Super admin can activate/deactivate and assign to batch bands.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { TeacherProfile, BatchBand } from '@/domain/types';

interface TeacherRow {
  profile: TeacherProfile;
  email?: string;
  assignedBandNames: string[];
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-saffron-100 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-saffron-700">{initials}</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-4 animate-pulse border-b border-gray-100">
      <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-40 bg-gray-200 rounded" />
        <div className="h-3 w-28 bg-gray-100 rounded" />
      </div>
      <div className="h-5 w-16 bg-gray-100 rounded-full" />
    </div>
  );
}

export default function TeachersPage() {
  const { user, apiFetch } = useAuthContext();

  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [bands, setBands] = useState<BatchBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editBandIds, setEditBandIds] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Add teacher form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch('/api/admin/teachers').then((r) => r.json()),
      apiFetch('/api/admin/batches').then((r) => r.json()),
    ])
      .then(([teacherData, batchData]) => {
        const batchList: BatchBand[] = batchData.batches ?? [];
        setBands(batchList);

        const profiles: TeacherProfile[] = teacherData.teachers ?? [];
        const mapped: TeacherRow[] = profiles.map((p) => ({
          profile: p,
          email: teacherData.emailMap?.[p.userId],
          assignedBandNames: (p.assignedBatchBandIds ?? [])
            .map((id) => batchList.find((b) => b.id === id)?.code ?? id)
            .map((code) => `Batch ${code}`),
        }));
        setRows(mapped);
      })
      .catch(() => setError('Failed to load teachers. Please try again.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(profile: TeacherProfile) {
    if (expandedId === profile.userId) {
      setExpandedId(null);
      setSaveError(null);
      return;
    }
    setExpandedId(profile.userId);
    setEditBandIds(profile.assignedBatchBandIds ?? []);
    setEditActive(profile.isActive);
    setSaveError(null);
    setSaveSuccess(null);
  }

  function toggleBand(bandId: string) {
    setEditBandIds((prev) =>
      prev.includes(bandId) ? prev.filter((id) => id !== bandId) : [...prev, bandId]
    );
  }

  async function handleSave(profile: TeacherProfile) {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await apiFetch('/api/admin/teachers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.userId,
          assignedBatchBandIds: editBandIds,
          isActive: editActive,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError(json.error ?? 'Save failed. Please try again.');
        return;
      }
      setSaveSuccess('Teacher profile updated.');
      setExpandedId(null);
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
          Teacher Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage teacher profiles, batch assignments, and account status.
        </p>
      </div>

      {/* Add Teacher button + form */}
      <div>
        {!showAddForm ? (
          <button onClick={() => setShowAddForm(true)} className="btn-primary">
            + Add Teacher
          </button>
        ) : (
          <div className="card space-y-4">
            <h3 className="section-title text-sm">Add New Teacher</h3>
            <p className="text-xs text-gray-500">
              Enter the teacher&apos;s email. If they already have an account, their role will be upgraded. Otherwise, a new account is created.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Teacher's full name" className="input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="teacher@email.com" className="input" />
              </div>
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (!newEmail || !newName) { setAddError('Name and email are required.'); return; }
                  setAdding(true); setAddError(null);
                  try {
                    const res = await apiFetch('/api/admin/teachers', {
                      method: 'POST',
                      body: JSON.stringify({ email: newEmail, displayName: newName }),
                    });
                    const json = await res.json();
                    if (!res.ok) { setAddError(json.error || 'Failed to add teacher.'); return; }
                    setSaveSuccess(`${newName} added as teacher.`);
                    setShowAddForm(false); setNewEmail(''); setNewName('');
                    load();
                  } catch { setAddError('Network error.'); }
                  finally { setAdding(false); }
                }}
                disabled={adding}
                className="btn-primary"
              >
                {adding ? 'Adding…' : 'Add Teacher'}
              </button>
              <button onClick={() => { setShowAddForm(false); setAddError(null); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {saveSuccess && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          {saveSuccess}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="underline text-red-700 hover:no-underline flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Teacher list */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
        ) : rows.length === 0 && !error ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            No teacher profiles found.
          </div>
        ) : (
          rows.map(({ profile, email, assignedBandNames }) => {
            const isExpanded = expandedId === profile.userId;
            return (
              <div key={profile.userId}>
                {/* Summary row */}
                <button
                  onClick={() => openEdit(profile)}
                  className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
                >
                  <Avatar name={profile.fullName} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-charcoal truncate">
                      {profile.fullName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {email ?? 'No email on record'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {assignedBandNames.length > 0
                        ? assignedBandNames.join(', ')
                        : 'No batch assignments'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`badge ${
                        profile.isActive ? 'badge-success' : 'badge-neutral'
                      }`}
                    >
                      {profile.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {/* Inline edit */}
                {isExpanded && (
                  <div className="px-5 py-5 bg-saffron-50 border-b border-saffron-200 space-y-4">
                    <h3 className="section-title text-sm">
                      Edit — {profile.fullName}
                    </h3>

                    {/* Batch band checkboxes */}
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-2">
                        Assigned Batch Bands
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {bands.map((band) => {
                          const checked = editBandIds.includes(band.id);
                          return (
                            <button
                              key={band.id}
                              type="button"
                              onClick={() => toggleBand(band.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                checked
                                  ? 'bg-saffron-600 text-white border-saffron-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-saffron-400'
                              }`}
                            >
                              Batch {band.code}
                            </button>
                          );
                        })}
                        {bands.length === 0 && (
                          <p className="text-xs text-gray-400 italic">
                            No batch bands loaded.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={editActive}
                        onClick={() => setEditActive((v) => !v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-saffron-500 focus:ring-offset-2 ${
                          editActive ? 'bg-saffron-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            editActive ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span className="text-sm text-charcoal">
                        Account {editActive ? 'active' : 'inactive'}
                      </span>
                    </div>

                    {saveError && (
                      <p className="text-sm text-red-600">{saveError}</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSave(profile)}
                        disabled={saving}
                        className="btn-primary"
                      >
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => {
                          setExpandedId(null);
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
          })
        )}
      </div>
    </div>
  );
}
