/**
 * Student — Class calendar view.
 * Shows upcoming classes and devotional events.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface ClassInstance {
  id: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  status: string;
  meetLink?: string;
}

interface DevotionalEvent {
  id: string;
  name: string;
  date: string;
  eventType: string;
  description?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDates(offset = 0) {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const { apiFetch } = useAuthContext();
  const [weekOffset, setWeekOffset] = useState(0);
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [events, setEvents] = useState<DevotionalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const weekDates = getWeekDates(weekOffset);
  const from = weekDates[0].toISOString().slice(0, 10);
  const to = weekDates[6].toISOString().slice(0, 10);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/classes/instances?from=${from}&to=${to}`).then(r => r.json()),
      apiFetch(`/api/admin/devotional-calendar?month=${from.slice(0, 7)}`).then(r => r.json()),
    ])
      .then(([classData, eventData]) => {
        setInstances(classData.instances ?? []);
        setEvents(eventData.events ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch, from, to]);

  const today = new Date().toISOString().slice(0, 10);

  function getClassesForDate(dateStr: string) {
    return instances.filter(i => i.scheduledDate === dateStr);
  }

  function getEventsForDate(dateStr: string) {
    return events.filter(e => e.date === dateStr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-title mb-0">My Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Week date range */}
      <p className="text-sm text-gray-500 mb-4">
        {weekDates[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} –{' '}
        {weekDates[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="card animate-pulse h-16" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {weekDates.map((date) => {
            const dateStr = date.toISOString().slice(0, 10);
            const isToday = dateStr === today;
            const dayClasses = getClassesForDate(dateStr);
            const dayEvents = getEventsForDate(dateStr);
            const hasItems = dayClasses.length > 0 || dayEvents.length > 0;

            return (
              <div
                key={dateStr}
                className={`card ${isToday ? 'border-saffron-300 bg-saffron-50' : ''} ${!hasItems ? 'opacity-60' : ''}`}
              >
                <div className="flex gap-4">
                  {/* Date column */}
                  <div className="flex-shrink-0 w-14 text-center">
                    <p className="text-xs text-gray-500">{DAYS[date.getDay()]}</p>
                    <p className={`text-xl font-bold ${isToday ? 'text-saffron-700' : 'text-charcoal'}`}>
                      {date.getDate()}
                    </p>
                    {isToday && <p className="text-xs text-saffron-600 font-medium">Today</p>}
                  </div>

                  {/* Events column */}
                  <div className="flex-1 space-y-1.5">
                    {dayClasses.map(cls => (
                      <div key={cls.id} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          cls.status === 'teacher_cancelled' ? 'bg-red-400' : 'bg-teal-500'
                        }`} />
                        <span className="text-sm">
                          {cls.scheduledStartTime} – {cls.scheduledEndTime}
                          {cls.status === 'teacher_cancelled' && (
                            <span className="text-red-500 text-xs ml-1">(Cancelled)</span>
                          )}
                        </span>
                        {cls.meetLink && cls.status !== 'teacher_cancelled' && (
                          <a
                            href={cls.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-saffron-700 hover:underline ml-auto"
                          >
                            Join →
                          </a>
                        )}
                      </div>
                    ))}

                    {dayEvents.map(ev => (
                      <div key={ev.id} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-saffron-400 flex-shrink-0" />
                        <span className="text-sm text-saffron-700">🪔 {ev.name}</span>
                      </div>
                    ))}

                    {!hasItems && (
                      <p className="text-xs text-gray-400">No classes or events</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 flex gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
          Class
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-saffron-400" />
          Devotional Event
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          Cancelled
        </div>
      </div>
    </div>
  );
}
