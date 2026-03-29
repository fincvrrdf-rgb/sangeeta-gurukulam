/**
 * Admin layout — wraps all /admin/* pages with AppShell + RoleGuard.
 */

'use client';

import { AuthProvider } from '@/components/layout/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { RoleGuard } from '@/components/layout/RoleGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoleGuard allowedRoles={['super_admin']}>
        <AppShell>{children}</AppShell>
      </RoleGuard>
    </AuthProvider>
  );
}
