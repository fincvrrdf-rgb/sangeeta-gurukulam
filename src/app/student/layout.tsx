/**
 * Student layout — wraps all /student/* pages with AppShell + RoleGuard.
 */

'use client';

import { AuthProvider } from '@/components/layout/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { RoleGuard } from '@/components/layout/RoleGuard';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoleGuard allowedRoles={['student']}>
        <AppShell>{children}</AppShell>
      </RoleGuard>
    </AuthProvider>
  );
}
