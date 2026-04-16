/**
 * Sidebar — role-based navigation for authenticated users.
 * Shows different nav items based on user role (student, teacher, super_admin).
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthContext } from './AuthProvider';
import type { UserRole } from '@/domain/enums';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const STUDENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/student', icon: '🏠' },
  { label: 'Join Class', href: '/student/class/join', icon: '📹' },
  { label: 'Book Class', href: '/student/class/book', icon: '📅' },
  { label: 'Attendance', href: '/student/attendance', icon: '✅' },
  { label: 'Mark Absence', href: '/student/absence/mark', icon: '📋' },
  { label: 'Lyrics', href: '/student/lyrics', icon: '📝' },
  { label: 'Practice', href: '/student/practice/record', icon: '🎤' },
  { label: 'Riyaz', href: '/student/riyaz', icon: '🎵' },
  { label: 'Payment', href: '/student/payment/status', icon: '💰' },
  { label: 'Reports', href: '/student/reports', icon: '📊' },
  { label: 'Resources', href: '/student/resources', icon: '📚' },
  { label: 'Calendar', href: '/student/calendar', icon: '🗓️' },
];

const TEACHER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/teacher', icon: '🏠' },
  { label: 'Classes', href: '/teacher/classes', icon: '📹' },
  { label: 'Attendance', href: '/teacher/attendance', icon: '✅' },
  { label: 'Availability', href: '/teacher/availability', icon: '📅' },
  { label: 'Bhajan', href: '/teacher/bhajan', icon: '🎶' },
  { label: 'Lyrics', href: '/teacher/lyrics', icon: '📝' },
  { label: 'Recordings', href: '/teacher/recordings', icon: '🎤' },
  { label: 'Assessments', href: '/teacher/assessments', icon: '📋' },
  { label: 'Payment', href: '/teacher/payment', icon: '💰' },
  { label: 'Planning', href: '/teacher/planning', icon: '📑' },
  { label: 'Reports', href: '/teacher/reports', icon: '📊' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: '🏠' },
  { label: 'Syllabus', href: '/admin/syllabus', icon: '📚' },
  { label: 'Batches', href: '/admin/batches', icon: '👥' },
  { label: 'Teachers', href: '/admin/teachers', icon: '👨‍🏫' },
  { label: 'Students', href: '/admin/students', icon: '🎓' },
  { label: 'Lyrics', href: '/teacher/lyrics', icon: '📝' },
  { label: 'Classes', href: '/teacher/classes', icon: '🗓️' },
  { label: 'Attendance', href: '/teacher/attendance', icon: '✅' },
  { label: 'Bhajan', href: '/teacher/bhajan', icon: '🎤' },
  { label: 'Settings', href: '/admin/settings', icon: '⚙️' },
  { label: 'Calendar', href: '/admin/devotional-calendar', icon: '🗓️' },
  { label: 'Payment Rules', href: '/admin/payment-rules', icon: '💰' },
  { label: 'Audit Logs', href: '/admin/audit-logs', icon: '📋' },
];

function getNavItems(role: UserRole | null): NavItem[] {
  switch (role) {
    case 'super_admin': return ADMIN_NAV;
    case 'teacher': return TEACHER_NAV;
    case 'student': return STUDENT_NAV;
    default: return [];
  }
}

export function Sidebar({ className = '' }: { className?: string }) {
  const { role, user, logout } = useAuthContext();
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <aside className={`flex flex-col bg-white border-r border-gray-200 w-60 min-h-screen ${className}`}>
      {/* Logo */}
      <div className="p-4 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          <span className="font-heading font-bold text-saffron-800 text-sm">
            Sangeeta Gurukulam
          </span>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== `/${role}` && item.href !== '/admin' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-saffron-50 text-saffron-800 font-medium border-r-2 border-saffron-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-200 p-4">
        <div className="text-xs text-gray-500 truncate mb-2">
          {user?.email}
        </div>
        <div className="flex items-center justify-between">
          <span className="badge-neutral text-xs capitalize">
            {role?.replace('_', ' ')}
          </span>
          <button
            onClick={() => logout()}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}

export { getNavItems, type NavItem };
