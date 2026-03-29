/**
 * Root layout for the entire application.
 * Provides: global styles, fonts, metadata, and the AuthProvider context.
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sangeeta Gurukulam',
  description: 'Carnatic devotional music class management',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
