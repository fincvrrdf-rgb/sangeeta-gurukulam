/**
 * Teacher — Notification history page (reuses same pattern as student).
 */

'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { COLLECTIONS } from '@/domain/constants';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface Notification {
  id: string;
  title: string;
  body: string;
  notificationType: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  isRead: boolean;
  createdAt: string;
}

function typeIcon(type: string): string {
  if (type.includes('PAYMENT')) return '💰';
  if (type.includes('CLASS')) return '📹';
  if (type.includes('LESSON_PLAN')) return '📑';
  if (type.includes('REPORT')) return '📊';
  if (type.includes('RECORDING')) return '🎤';
  if (type.includes('ASSESSMENT')) return '📝';
  if (type.includes('ABSENCE')) return '📋';
  return '🔔';
}

export default function TeacherNotificationsPage() {
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Filter on recipientId only: the Firestore rules authorise reads on that
    // field, and a filter plus orderBy would need a composite index. Sorted here.
    const q = query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      where('recipientId', '==', user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(
        snap.docs
          .map(d => ({ id: d.id, ...(d.data() as Omit<Notification, 'id'>) }))
          .sort((a, b) => String((b as { createdAt?: string }).createdAt ?? '').localeCompare(String((a as { createdAt?: string }).createdAt ?? '')))
          .slice(0, 50),
      );
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  async function markRead(id: string) {
    await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id), { isRead: true }).catch(() => {});
  }

  async function markAllRead() {
    await Promise.all(notifications.filter(n => !n.isRead).map(n => markRead(n.id)));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-title mb-0">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-sm text-saffron-700 hover:underline">
            Mark all read ({unreadCount})
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card animate-pulse h-16" />)}</div>
      )}

      {!loading && notifications.length === 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-gray-600 font-medium">No notifications</p>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map(n => (
          <div
            key={n.id}
            className={`card flex gap-3 cursor-pointer ${!n.isRead ? 'border-saffron-200 bg-saffron-50' : ''}`}
            onClick={() => !n.isRead && markRead(n.id)}
          >
            <span className="text-xl">{typeIcon(n.notificationType)}</span>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm ${!n.isRead ? 'font-semibold text-charcoal' : 'text-gray-700'}`}>{n.title}</p>
                {!n.isRead && <span className="w-2 h-2 bg-saffron-500 rounded-full mt-1.5 flex-shrink-0" />}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
              {n.actionUrl && (
                <a
                  href={n.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-green-700 border border-green-400 rounded-lg px-2.5 py-1 hover:bg-green-50"
                >
                  <span aria-hidden>💬</span>
                  {n.actionLabel || 'Message on WhatsApp'}
                </a>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
