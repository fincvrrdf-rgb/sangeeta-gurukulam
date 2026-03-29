/**
 * Teacher — Notification history page (reuses same pattern as student).
 */

'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { COLLECTIONS } from '@/domain/constants';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface Notification {
  id: string;
  title: string;
  body: string;
  notificationType: string;
  isRead: boolean;
  createdAt: string;
}

function typeIcon(type: string): string {
  if (type.includes('PAYMENT')) return '💰';
  if (type.includes('CLASS')) return '📹';
  if (type.includes('LESSON_PLAN')) return '📑';
  if (type.includes('REPORT')) return '📊';
  if (type.includes('RECORDING')) return '🎤';
  if (type.includes('ABSENCE')) return '📋';
  return '🔔';
}

export default function TeacherNotificationsPage() {
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Notification, 'id'>) })));
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
