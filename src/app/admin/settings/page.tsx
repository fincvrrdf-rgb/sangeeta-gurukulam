/**
 * Admin App Settings — /admin/settings
 *
 * Full settings form covering all configurable app parameters.
 * GET /api/admin/settings · PATCH /api/admin/settings
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { AppSettings } from '@/domain/types';
import { DEFAULT_APP_SETTINGS } from '@/domain/constants';

type SettingsForm = Omit<AppSettings, 'updatedAt' | 'updatedBy'>;

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-charcoal">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-saffron-500 focus:ring-offset-2 flex-shrink-0 ${
          checked ? 'bg-saffron-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-charcoal">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={step ?? 1}
          className="input w-24 text-right"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && (
          <span className="text-xs text-gray-500 whitespace-nowrap">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <p className="text-sm font-medium text-charcoal">{label}</p>
      <input
        type="time"
        className="input w-32"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card space-y-0 p-0 overflow-hidden">
      <div className="px-5 py-3 bg-saffron-50 border-b border-saffron-200">
        <p className="text-sm font-heading font-semibold text-saffron-900">{title}</p>
      </div>
      <div className="px-5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, apiFetch } = useAuthContext();

  const [form, setForm] = useState<SettingsForm>({
    ...DEFAULT_APP_SETTINGS,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    apiFetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.settings) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { updatedAt: _updatedAt, updatedBy: _updatedBy, ...rest } = d.settings;
          setForm((prev) => ({ ...prev, ...rest }));
        } else {
          setError('Failed to load settings.');
        }
      })
      .catch(() => setError('Network error loading settings.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError(json.error ?? 'Save failed. Please try again.');
        return;
      }
      setSaveSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function paise(p: number) {
    return Math.round(p / 100);
  }
  function toPaise(rupees: number) {
    return Math.round(rupees * 100);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div className="h-7 w-48 bg-gray-200 animate-pulse rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card animate-pulse space-y-3">
            <div className="h-4 w-36 bg-gray-200 rounded" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-8 bg-gray-100 rounded" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="underline text-red-700 hover:no-underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          App Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure thresholds, payment rules, class windows, and notifications.
        </p>
      </div>

      {saveSuccess && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          Settings saved successfully.
        </div>
      )}

      {saveError && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">

        {/* Attendance & Violations */}
        <SectionCard title="Attendance & Violations">
          <NumberField
            label="Violation Threshold"
            description="Consecutive violations before triggering compulsory payment"
            value={form.consecutiveViolationThreshold}
            onChange={(v) => setForm({ ...form, consecutiveViolationThreshold: v })}
            min={1}
            max={20}
            suffix="consecutive"
          />
          <NumberField
            label="Late Threshold"
            description="Minutes late before attendance is marked as Late"
            value={form.lateThresholdMinutes}
            onChange={(v) => setForm({ ...form, lateThresholdMinutes: v })}
            min={1}
            max={60}
            suffix="minutes"
          />
          <NumberField
            label="Absence Notice"
            description="Minimum hours before class to submit absence notice"
            value={form.absenceNoticeHoursBeforeClass}
            onChange={(v) => setForm({ ...form, absenceNoticeHoursBeforeClass: v })}
            min={0}
            max={48}
            suffix="hours"
          />
          <Toggle
            label="Violation Reset on Proper Attendance"
            description="Reset consecutive violation counter when student attends properly"
            checked={form.violationResetOnProperAttendance}
            onChange={(v) => setForm({ ...form, violationResetOnProperAttendance: v })}
          />
          <Toggle
            label="Approved Absence Counts as Violation"
            description="Count teacher-approved absences in violation counter"
            checked={form.approvedAbsenceCountsAsViolation}
            onChange={(v) => setForm({ ...form, approvedAbsenceCountsAsViolation: v })}
          />
          <Toggle
            label="Long Absence Requires Approval"
            description="Admin must approve long-absence requests before they take effect"
            checked={form.longAbsenceRequiresApproval}
            onChange={(v) => setForm({ ...form, longAbsenceRequiresApproval: v })}
          />
        </SectionCard>

        {/* Payment */}
        <SectionCard title="Payment Rules">
          <NumberField
            label="Compulsory Payment — India"
            description="Amount (INR) triggered after violation threshold (India students)"
            value={paise(form.compulsoryPaymentAmountIndiaPaise)}
            onChange={(v) =>
              setForm({ ...form, compulsoryPaymentAmountIndiaPaise: toPaise(v) })
            }
            min={0}
            step={100}
            suffix="₹ INR"
          />
          <NumberField
            label="Compulsory Payment — Abroad"
            description="Amount (INR) triggered after violation threshold (abroad students)"
            value={paise(form.compulsoryPaymentAmountAbroadPaise)}
            onChange={(v) =>
              setForm({ ...form, compulsoryPaymentAmountAbroadPaise: toPaise(v) })
            }
            min={0}
            step={100}
            suffix="₹ INR"
          />
        </SectionCard>

        {/* Progression */}
        <SectionCard title="Progression Gates">
          <Toggle
            label="Progression Requires Test Pass"
            description="Student must pass a teacher test before advancing to next unit"
            checked={form.progressionRequiresTestPass}
            onChange={(v) => setForm({ ...form, progressionRequiresTestPass: v })}
          />
          <Toggle
            label="Progression Requires Recording Accepted"
            description="Student must submit and have a practice recording accepted"
            checked={form.progressionRequiresRecordingAccepted}
            onChange={(v) =>
              setForm({ ...form, progressionRequiresRecordingAccepted: v })
            }
          />
          <Toggle
            label="AI Weekly Report Requires Teacher Approval"
            description="AI-generated weekly reports need teacher review before publishing"
            checked={form.aiWeeklyReportRequiresTeacherApproval}
            onChange={(v) =>
              setForm({ ...form, aiWeeklyReportRequiresTeacherApproval: v })
            }
          />
          <NumberField
            label="Pitch Check Tolerance"
            description="Allowed pitch deviation for AI pitch analysis (cents)"
            value={form.pitchCheckToleranceCents}
            onChange={(v) => setForm({ ...form, pitchCheckToleranceCents: v })}
            min={0}
            max={200}
            suffix="cents"
          />
        </SectionCard>

        {/* Class Windows */}
        <SectionCard title="Class Windows">
          <TimeField
            label="Morning Window — Start"
            value={form.classWindowMorningStart}
            onChange={(v) => setForm({ ...form, classWindowMorningStart: v })}
          />
          <TimeField
            label="Morning Window — End"
            value={form.classWindowMorningEnd}
            onChange={(v) => setForm({ ...form, classWindowMorningEnd: v })}
          />
          <TimeField
            label="Evening Window — Start"
            value={form.classWindowEveningStart}
            onChange={(v) => setForm({ ...form, classWindowEveningStart: v })}
          />
          <TimeField
            label="Evening Window — End"
            value={form.classWindowEveningEnd}
            onChange={(v) => setForm({ ...form, classWindowEveningEnd: v })}
          />
        </SectionCard>

        {/* Bhajan */}
        <SectionCard title="Bhajan Session">
          <TimeField
            label="Default Bhajan Time"
            value={form.bhajan.defaultTime}
            onChange={(v) =>
              setForm({ ...form, bhajan: { ...form.bhajan, defaultTime: v } })
            }
          />
          <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
            <p className="text-sm font-medium text-charcoal">Timezone</p>
            <input
              className="input w-44 text-right"
              value={form.bhajan.timezone}
              onChange={(e) =>
                setForm({ ...form, bhajan: { ...form.bhajan, timezone: e.target.value } })
              }
              placeholder="Asia/Kolkata"
            />
          </div>
        </SectionCard>

        {/* Notifications */}
        <SectionCard title="Notifications">
          <Toggle
            label="Email Notifications Enabled"
            checked={form.notifications.emailEnabled}
            onChange={(v) =>
              setForm({
                ...form,
                notifications: { ...form.notifications, emailEnabled: v },
              })
            }
          />
          <Toggle
            label="In-App Notifications Enabled"
            checked={form.notifications.inAppEnabled}
            onChange={(v) =>
              setForm({
                ...form,
                notifications: { ...form.notifications, inAppEnabled: v },
              })
            }
          />
          <TimeField
            label="Riyaz Reminder Time"
            value={form.notifications.riyazReminderTime}
            onChange={(v) =>
              setForm({
                ...form,
                notifications: { ...form.notifications, riyazReminderTime: v },
              })
            }
          />
          <TimeField
            label="Pranayama Reminder Time"
            value={form.notifications.pranayamaReminderTime}
            onChange={(v) =>
              setForm({
                ...form,
                notifications: { ...form.notifications, pranayamaReminderTime: v },
              })
            }
          />
          <NumberField
            label="Class Reminder"
            description="Send reminder this many minutes before class"
            value={form.notifications.classReminderMinutesBefore}
            onChange={(v) =>
              setForm({
                ...form,
                notifications: {
                  ...form.notifications,
                  classReminderMinutesBefore: v,
                },
              })
            }
            min={0}
            max={1440}
            suffix="min before"
          />
          <NumberField
            label="Class Starting Soon"
            description="Send 'starting soon' alert this many minutes before class"
            value={form.notifications.classStartingSoonMinutesBefore}
            onChange={(v) =>
              setForm({
                ...form,
                notifications: {
                  ...form.notifications,
                  classStartingSoonMinutesBefore: v,
                },
              })
            }
            min={0}
            max={120}
            suffix="min before"
          />
        </SectionCard>

        {/* Retention */}
        <SectionCard title="Data Retention">
          <NumberField
            label="Recording Retention"
            description="How long to keep practice recordings in Firebase Storage"
            value={form.recordingRetentionDays}
            onChange={(v) => setForm({ ...form, recordingRetentionDays: v })}
            min={30}
            max={3650}
            suffix="days"
          />
          <NumberField
            label="Payment Proof Retention"
            description="How long to keep payment proof images"
            value={form.paymentProofRetentionDays}
            onChange={(v) => setForm({ ...form, paymentProofRetentionDays: v })}
            min={30}
            max={3650}
            suffix="days"
          />
        </SectionCard>

        {/* Save */}
        <div className="flex items-center gap-4 pt-2">
          <button type="submit" disabled={saving} className="btn-primary px-6">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={saving}
            className="btn-secondary"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
