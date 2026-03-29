/**
 * Notifications — /student/notifications
 *
 * Full list of notifications for the current student.
 * Uses Firestore onSnapshot for real-time updates.
 * Groups notifications by date (Today / Yesterday / Earlier).
 * Supports marking individual notifications as read and mark-all-read.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { COLLECTIONS } from '@/domain/constants';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { NotificationType } from '@/domain/enums';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  isRead: boolean;
  readAt: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

type DateGroup = 'today' | 'yesterday' | 'earlier';

function getDateGroup(iso: string): DateGroup {
  const now = new Date();
  const d = new Date(iso);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

  if (d >= todayStart) return 'today';
  if (d >= yesterdayStart) return 'yesterday';
  return 'earlier';
}

const GROUP_LABELS: Record<DateGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

const GROUP_ORDER: DateGroup[] = ['today', 'yesterday', 'earlier'];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Icon per notification type */
function NotifIcon({ type }: { type: NotificationType }) {
  const icons: Partial<Record<NotificationType, string>> = {
    CLASS_UPCOMING: '&#x1F4C5;',
    CLASS_STARTING_SOON: '&#x23F0;',
    CLASS_CANCELLED: '&#x274C;',
    CLASS_RESCHEDULED: '&#x1F504;',
    BHAJAN_UPCOMING: '&#x1F649;',
    BHAJAN_LIVE: '&#x1F534;',
    BHAJAN_CANCELLED: '&#x274C;',
    PAYMENT_PROOF_SUBMITTED: '&#x1F4B3;',
    PAYMENT_PROOF_REVIEWED: '&#x2705;',
    PAYMENT_COMPULSORY_TRIGGERED: '&#x26A0;',
    LONG_ABSENCE_SUBMITTED: '&#x1F4CB;',
    LONG_ABSENCE_APPROVED: '&#x2705;',
    LONG_ABSENCE_REJECTED: '&#x274C;',
    RIYAZ_REMINDER: '&#x1F3B5;',
    PRANAYAMA_REMINDER: '&#x1F9D8;',
    PRACTICE_RECORDING_PENDING: '&#x1F3A4;',
    WEEKLY_REPORT_AVAILABLE: '&#x1F4CA;',
    WEEKLY_REPORT_NEEDS_REVIEW: '&#x1F4CA;',
  };
  const icon = icons[type] ?? '&#x1F514;';
  return (
    <span
      className="text-lg flex-shrink-0"
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  );
}

function SkeletonItem() {
  return (
    <div className="flex gap-3 px-4 py-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 bg-gray-200 rounded" />
        <div className="h-3 w-full bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { user } = useAuthContext();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  // Track which notification IDs are being marked read
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

  const unsubRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(100),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: AppNotification[] = snap.docs.map((d) => {
          const data = d.data();
          // Normalize Firestore Timestamp to ISO string if needed
          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : (data.createdAt as string) ?? new Date().toISOString();
          return {
            id: d.id,
            title: data.title ?? '',
            body: data.body ?? '',
            type: data.type as NotificationType,
            isRead: data.isRead ?? false,
            readAt: data.readAt ?? null,
            referenceType: data.referenceType ?? null,
            referenceId: data.referenceId ?? null,
            createdAt,
          };
        });
        setNotifications(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message ?? 'Could not load notifications.');
        setLoading(false);
      },
    );

    unsubRef.current = unsub;
    return () => unsub();
  }, [user]);

  const markOneRead = useCallback(
    async (id: string) => {
      if (!user) return;
      setMarkingIds((prev) => new Set(prev).add(id));
      try {
        await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id), {
          isRead: true,
          readAt: new Date().toISOString(),
        });
      } catch {
        // Silently ignore; onSnapshot will not update if write fails
      } finally {
        setMarkingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [user],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;

    setMarkingAllRead(true);
    try {
      // Firestore batch supports up to 500 writes at once
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, COLLECTIONS.NOTIFICATIONS, n.id), {
          isRead: true,
          readAt: new Date().toISOString(),
        });
      });
      await batch.commit();
    } catch {
      // Silently ignore
    } finally {
      setMarkingAllRead(false);
    }
  }, [user, notifications]);

  // Group notifications by date
  const grouped = GROUP_ORDER.reduce(
    (acc, group) => {
      acc[group] = notifications.filter(
        (n) => getDateGroup(n.createdAt) === group,
      );
      return acc;
    },
    {} as Record<DateGroup, AppNotification[]>,
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium text-saffron-700">{unreadCount}</span> unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAllRead}
            className="btn-secondary text-sm px-3 py-1.5 flex-shrink-0"
          >
            {markingAllRead ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
                Marking…
              </span>
            ) : (
              '\u2714 Mark all read'
            )}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-800">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card p-0 overflow-hidden divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonItem key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && notifications.length === 0 && (
        <div className="card text-center py-16 space-y-3">
          <p className="text-3xl">&#x1F514;</p>
          <p className="font-semibold text-charcoal">No notifications</p>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            You&rsquo;re all caught up! Notifications about classes, payments, and
            recordings will appear here.
          </p>
        </div>
      )}

      {/* Grouped list */}
      {!loading && notifications.length > 0 && (
        <div className="space-y-6">
          {GROUP_ORDER.map((group) => {
            const items = grouped[group];
            if (!items.length) return null;
            return (
              <section key={group}>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">
                  {GROUP_LABELS[group]}
                </h2>
                <div className="card p-0 overflow-hidden divide-y divide-gray-100">
                  {items.map((notif) => (
                    <div
                      key={notif.id}
                      className={`flex gap-3 px-4 py-3 transition-colors ${
                        notif.isRead
                          ? 'bg-white'
                          : 'bg-saffron-50 hover:bg-saffron-50/80'
                      }`}
                    >
                      {/* Icon */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-saffron-100 flex items-center justify-center mt-0.5">
                        <NotifIcon type={notif.type} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm ${
                              notif.isRead
                                ? 'text-gray-700'
                                : 'font-semibold text-charcoal'
                            }`}
                          >
                            {notif.title}
                          </p>
                          {!notif.isRead && (
                            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-saffron-500 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          {notif.body}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-400">
                            {group === 'earlier'
                              ? formatDate(notif.createdAt)
                              : formatTime(notif.createdAt)}
                          </span>
                          {!notif.isRead && (
                            <button
                              type="button"
                              onClick={() => markOneRead(notif.id)}
                              disabled={markingIds.has(notif.id)}
                              className="text-xs text-saffron-600 hover:underline disabled:opacity-50 flex-shrink-0"
                            >
                              {markingIds.has(notif.id) ? 'Marking…' : 'Mark read'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
