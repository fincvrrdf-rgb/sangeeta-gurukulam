/**
 * Student — Join a live class.
 * Shows today's scheduled class instances with Meet links.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface ClassInstance {
  id: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  meetLink?: string;
  status: string;
  batchBandId: string;
}

export default function JoinClassPage() {
  const { apiFetch } = useAuthContext();
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    apiFetch(`/api/classes/instances?from=${todayISO}&to=${todayISO}`)
      .then((r) => r.json())
      .then((data) => setInstances(data.instances ?? []))
      .catch(() => setError('Could not load today\'s classes'))
      .finally(() => setLoading(false));
  }, [apiFetch, todayISO]);

  const now = new Date();

  function getStatus(instance: ClassInstance) {
    const [h, m] = instance.scheduledStartTime.split(':').map(Number);
    const classTime = new Date();
    classTime.setHours(h, m, 0, 0);
    const diff = (classTime.getTime() - now.getTime()) / 60000; // minutes
    if (diff > 15) return 'upcoming';
    if (diff > -60) return 'joinable';
    return 'ended';
  }

  return (
    <div>
      <h1 className="section-title">Join Class</h1>
      <p className="text-sm text-gray-500 mb-6">Today&apos;s scheduled classes</p>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card border-red-100 bg-red-50">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && instances.length === 0 && (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-600 font-medium">No classes scheduled for today</p>
          <p className="text-gray-400 text-sm mt-1">
            Regular classes run Mon–Wed and Fri. Check with your teacher for updates.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {instances.map((instance) => {
          const classStatus = getStatus(instance);
          return (
            <div key={instance.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-charcoal">
                    {instance.scheduledStartTime} – {instance.scheduledEndTime} IST
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">Batch {instance.batchBandId}</p>
                </div>
                <span className={`badge ${
                  classStatus === 'joinable' ? 'badge-success' :
                  classStatus === 'upcoming' ? 'badge-warning' : 'badge-neutral'
                }`}>
                  {classStatus === 'joinable' ? '🔴 Live' :
                   classStatus === 'upcoming' ? '⏰ Upcoming' : 'Ended'}
                </span>
              </div>

              <div className="mt-4">
                {instance.meetLink ? (
                  <a
                    href={instance.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`btn-primary w-full text-center block ${
                      classStatus === 'ended' ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {classStatus === 'joinable' ? 'Join Google Meet' :
                     classStatus === 'upcoming' ? 'Meet Link Ready' : 'Class Ended'}
                  </a>
                ) : (
                  <div className="btn-secondary w-full text-center opacity-60 cursor-not-allowed">
                    Meet link not yet available
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
