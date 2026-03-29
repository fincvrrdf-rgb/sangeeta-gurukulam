/**
 * Student — Book a makeup or special class.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface ClassSlot {
  id: string;
  startTimeLocal: string;
  endTimeLocal: string;
  dayOfWeek: number;
  slotType: string;
  batchBandId: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function BookClassPage() {
  const { apiFetch } = useAuthContext();
  const [slots, setSlots] = useState<ClassSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState('');

  useEffect(() => {
    apiFetch('/api/classes/slots')
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch]);

  async function bookSlot(slotId: string) {
    setBookingError('');
    try {
      const r = await apiFetch('/api/classes/instances', {
        method: 'POST',
        body: JSON.stringify({ slotId }),
      });
      if (!r.ok) {
        const d = await r.json();
        setBookingError(d.error ?? 'Booking failed');
        return;
      }
      const data = await r.json();
      setBookingId(data.id);
    } catch {
      setBookingError('Could not complete booking');
    }
  }

  if (bookingId) {
    return (
      <div>
        <h1 className="section-title">Book a Class</h1>
        <div className="card text-center py-10 border-green-100 bg-green-50">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-green-700 font-medium text-lg">Class Booked!</p>
          <p className="text-green-600 text-sm mt-1">Your class has been scheduled.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="section-title">Book a Class</h1>
      <p className="text-sm text-gray-500 mb-6">
        Available class slots for makeup or special sessions.
        Regular classes are automatically included in your schedule.
      </p>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse h-20" />
          ))}
        </div>
      )}

      {bookingError && (
        <div className="card border-red-100 bg-red-50 mb-4">
          <p className="text-red-600 text-sm">{bookingError}</p>
        </div>
      )}

      {!loading && slots.length === 0 && (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-600">No additional class slots available right now.</p>
          <p className="text-gray-400 text-sm mt-1">Contact your teacher to arrange makeup classes.</p>
        </div>
      )}

      <div className="space-y-3">
        {slots.filter(s => s.slotType === 'makeup').map((slot) => (
          <div key={slot.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-charcoal">
                {DAYS[slot.dayOfWeek]} · {slot.startTimeLocal} – {slot.endTimeLocal}
              </p>
              <p className="text-sm text-gray-500 capitalize">{slot.slotType} class</p>
            </div>
            <button
              onClick={() => bookSlot(slot.id)}
              className="btn-primary text-sm"
            >
              Book
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
