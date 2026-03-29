/**
 * Admin — Payment rules configuration.
 * Quick access to payment-related settings subset.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface PaymentSettings {
  consecutiveViolationThreshold: number;
  compulsoryPaymentAmountIndiaPaise: number;
  compulsoryPaymentAmountAbroadPaise: number;
  approvedAbsenceCountsAsViolation: boolean;
  violationResetOnProperAttendance: boolean;
  lateThresholdMinutes: number;
}

export default function PaymentRulesPage() {
  const { apiFetch } = useAuthContext();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => setSettings(d.settings ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const r = await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      if (r.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const indiaPaise = settings?.compulsoryPaymentAmountIndiaPaise ?? 250000;
  const abroadPaise = settings?.compulsoryPaymentAmountAbroadPaise ?? 1000000;

  return (
    <div>
      <h1 className="section-title">Payment Rules</h1>
      <p className="text-sm text-gray-500 mb-6">
        Configure compulsory payment thresholds and violation logic.
        Full settings available in{' '}
        <Link href="/admin/settings" className="text-saffron-700 hover:underline">App Settings</Link>.
      </p>

      {loading && <div className="card animate-pulse h-60" />}

      {settings && (
        <div className="space-y-5 max-w-xl">
          {saved && (
            <div className="card border-green-100 bg-green-50 text-green-700 text-sm">
              ✅ Settings saved successfully.
            </div>
          )}

          <div className="card space-y-4">
            <h2 className="font-heading font-semibold text-charcoal">Violation Threshold</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consecutive violations before compulsory payment
              </label>
              <input
                type="number" min={1} max={10}
                value={settings.consecutiveViolationThreshold}
                onChange={e => setSettings(s => s ? { ...s, consecutiveViolationThreshold: Number(e.target.value) } : s)}
                className="input w-24"
              />
              <p className="text-xs text-gray-400 mt-1">Default: 4 consecutive violations</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Late threshold (minutes after class start)
              </label>
              <input
                type="number" min={1} max={30}
                value={settings.lateThresholdMinutes}
                onChange={e => setSettings(s => s ? { ...s, lateThresholdMinutes: Number(e.target.value) } : s)}
                className="input w-24"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="approvedAbsence"
                checked={settings.approvedAbsenceCountsAsViolation}
                onChange={e => setSettings(s => s ? { ...s, approvedAbsenceCountsAsViolation: e.target.checked } : s)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <label htmlFor="approvedAbsence" className="text-sm text-gray-700">
                Count approved standard absences as violations
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="violationReset"
                checked={settings.violationResetOnProperAttendance}
                onChange={e => setSettings(s => s ? { ...s, violationResetOnProperAttendance: e.target.checked } : s)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <label htmlFor="violationReset" className="text-sm text-gray-700">
                Reset violation counter after consecutive proper attendance
              </label>
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="font-heading font-semibold text-charcoal">Compulsory Payment Amounts</h2>

            <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-800 border border-amber-200">
              <strong>Hard Rules (cannot be changed):</strong>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>Teacher-cancelled classes NEVER count as violations</li>
                <li>Approved long absences NEVER count as violations</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount — India students (INR)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">₹</span>
                <input
                  type="number" min={0}
                  value={Math.round(indiaPaise / 100)}
                  onChange={e => setSettings(s => s ? { ...s, compulsoryPaymentAmountIndiaPaise: Number(e.target.value) * 100 } : s)}
                  className="input w-32"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount — Abroad students (INR)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">₹</span>
                <input
                  type="number" min={0}
                  value={Math.round(abroadPaise / 100)}
                  onChange={e => setSettings(s => s ? { ...s, compulsoryPaymentAmountAbroadPaise: Number(e.target.value) * 100 } : s)}
                  className="input w-32"
                />
              </div>
            </div>
          </div>

          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Payment Rules'}
          </button>
        </div>
      )}
    </div>
  );
}
