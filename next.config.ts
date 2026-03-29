import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Firebase Admin SDK uses Node.js APIs that should not be bundled for the browser.
  // This ensures server-only modules stay server-side.
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
