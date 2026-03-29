/**
 * MobileNav — bottom tab bar + slide-out menu for mobile.
 * Shows on screens smaller than md breakpoint.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthContext } from './AuthProvider';
import { getNavItems } from './Sidebar';

export function MobileNav() {
  const { role, user, logout } = useAuthContext();
  const pathname = usePathname();
  const navItems = getNavItems(role);
  const [menuOpen, setMenuOpen] = useState(false);

  // Show first 4 items in the bottom bar + "More" button
  const bottomItems = navItems.slice(0, 4);

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 md:hidden">
        <div className="flex items-center justify-around py-2">
          {bottomItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== `/${role}` && item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors ${
                  isActive ? 'text-saffron-700 font-medium' : 'text-gray-500'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="truncate max-w-[60px]">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-xs text-gray-500"
          >
            <span className="text-lg">&#x2630;</span>
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Slide-out menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />

          {/* Menu panel */}
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <span className="font-heading font-bold text-saffron-800">Menu</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                &#x2715;
              </button>
            </div>

            <nav className="py-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== `/${role}` && item.href !== '/admin' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${
                      isActive
                        ? 'bg-saffron-50 text-saffron-800 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* User info */}
            <div className="border-t border-gray-200 p-4">
              <div className="text-xs text-gray-500 truncate mb-2">{user?.email}</div>
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="text-sm text-red-600 hover:underline"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
