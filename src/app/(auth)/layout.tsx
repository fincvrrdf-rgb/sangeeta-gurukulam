import { AuthProvider } from '@/components/layout/AuthProvider';

// Auth pages use Firebase client SDK — must be dynamic (no static pre-rendering).
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
