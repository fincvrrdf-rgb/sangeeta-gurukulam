/**
 * RoleGuard — client-side role check wrapper.
 * Redirects to login or appropriate dashboard if user doesn't have required role.
 * This is a secondary guard (middleware handles the primary check).
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from './AuthProvider';
import type { UserRole } from '@/domain/enums';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, role, loading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (role && !allowedRoles.includes(role)) {
      // Redirect to their own dashboard
      if (role === 'super_admin') router.replace('/admin');
      else if (role === 'teacher') router.replace('/teacher');
      else router.replace('/student');
    }
  }, [user, role, loading, allowedRoles, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-4xl animate-pulse">🎵</div>
      </div>
    );
  }

  if (!user || (role && !allowedRoles.includes(role))) {
    return null;
  }

  return <>{children}</>;
}
