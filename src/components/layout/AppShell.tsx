/**
 * AppShell — main layout wrapper for authenticated pages.
 * Renders sidebar on desktop, bottom nav on mobile.
 * Wraps children in AuthProvider.
 */

'use client';

import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { NotificationBell } from '../notifications/NotificationBell';
import { useAuthContext } from './AuthProvider';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🎵</div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex">
      {/* Desktop sidebar */}
      <Sidebar className="hidden md:flex" />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar (mobile header + notification bell) */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between md:justify-end">
          <span className="font-heading font-bold text-saffron-800 text-sm md:hidden">
            Sangeeta Gurukulam
          </span>
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>

        {/* Organisation footer */}
        <footer className="hidden md:block border-t border-gray-100 px-6 py-2 text-center">
          <p className="text-[10px] text-gray-400">
            Run by{' '}
            <a
              href="https://www.cvrrdf.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-gray-500"
            >
              CVR Research and Development Foundation
            </a>
          </p>
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
