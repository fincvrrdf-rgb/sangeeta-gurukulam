/**
 * NotificationBell — shows unread notification count with dropdown.
 * Uses Firestore onSnapshot for real-time updates.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { COLLECTIONS } from '@/domain/constants';

interface NotificationPreview {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const { user, role } = useAuthContext();
  const [unreadCount, setUnreadCount] = useState(0);
  const [previews, setPreviews] = useState<NotificationPreview[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Subscribe to notifications
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      where('userId', '==', user.uid),
      where('isRead', '==', false),
      orderBy('createdAt', 'desc'),
      limit(10),
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
      setPreviews(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<NotificationPreview, 'id'>),
        })),
      );
    }, () => {
      // Silently handle permission errors (user may not have index yet)
      setUnreadCount(0);
    });

    return unsub;
  }, [user]);

  const dashboardPath = role === 'super_admin' ? '/admin' : role === 'teacher' ? '/teacher' : '/student';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-500 hover:text-saffron-700 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-medium text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs text-saffron-600">{unreadCount} unread</span>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {previews.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">
                No new notifications
              </div>
            ) : (
              previews.map((n) => (
                <div key={n.id} className="px-3 py-2 border-b border-gray-50 hover:bg-gray-50">
                  <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                  <p className="text-xs text-gray-500 truncate">{n.body}</p>
                </div>
              ))
            )}
          </div>

          <Link
            href={`${dashboardPath}/notifications`}
            onClick={() => setOpen(false)}
            className="block p-2 text-center text-xs text-saffron-700 hover:underline border-t border-gray-100"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
