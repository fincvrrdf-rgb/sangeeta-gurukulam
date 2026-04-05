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
      <body className="min-h-screen flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-gray-100 py-2 text-center">
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
      </body>
    </html>
  );
}
