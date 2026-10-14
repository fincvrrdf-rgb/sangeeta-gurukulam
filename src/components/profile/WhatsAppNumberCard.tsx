/**
 * "Your WhatsApp number" — lets a student or teacher add or change their own
 * number at any time after their profile was created. Used for the one-tap
 * WhatsApp links on recording and assessment notifications.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

export function WhatsAppNumberCard({ who }: { who: 'student' | 'teacher' }) {
  const { user, apiFetch } = useAuthContext();
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/me/whatsapp')
      .then((r) => (r.ok ? r.json() : { phone: '' }))
      .then((d) => {
        setSaved(d.phone ?? '');
        setValue(d.phone ?? '');
        setEditing(!d.phone);
      })
      .catch(() => setSaved(''));
  }, [user, apiFetch]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch('/api/me/whatsapp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: value.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not save');
      setSaved(json.phone ?? '');
      setEditing(!json.phone);
      setMsg({ ok: true, text: json.phone ? 'Saved.' : 'Removed.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  }

  if (saved === null) return null;

  const purpose = who === 'student'
    ? 'Your teacher can message you on WhatsApp about your recordings and tests.'
    : 'Students can message you on WhatsApp from their grade notifications.';

  return (
    <div className={`card space-y-2 ${saved ? '' : 'border-green-300 bg-green-50'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-charcoal">💬 Your WhatsApp number</p>
        {saved && !editing && (
          <button onClick={() => { setEditing(true); setMsg(null); }} className="text-xs text-teal-700 font-semibold">
            Change
          </button>
        )}
      </div>
      {saved && !editing ? (
        <p className="text-sm text-gray-700">{saved}</p>
      ) : (
        <>
          <p className="text-xs text-gray-500">{purpose}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="tel"
              inputMode="tel"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="+91 98765 43210"
              className="input text-sm py-1.5 px-2 w-52"
              maxLength={30}
            />
            <button onClick={save} disabled={busy} className="btn-primary text-xs px-3 py-1.5">
              {busy ? 'Saving…' : 'Save'}
            </button>
            {saved && (
              <button onClick={() => { setEditing(false); setValue(saved); setMsg(null); }} className="text-xs text-gray-500">
                Cancel
              </button>
            )}
          </div>
        </>
      )}
      {msg && <p className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
}
