/**
 * Teacher layout — wraps all /teacher/* pages with AppShell + RoleGuard.
 */

'use client';

import { AuthProvider } from '@/components/layout/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { RoleGuard } from '@/components/layout/RoleGuard';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoleGuard allowedRoles={['teacher', 'super_admin']}>
        <AppShell>{children}</AppShell>
      </RoleGuard>
    </AuthProvider>
  );
}
