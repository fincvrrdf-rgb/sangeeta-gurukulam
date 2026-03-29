/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Firebase Admin SDK uses Node.js APIs that should not be bundled for the browser.
  serverExternalPackages: ['firebase-admin'],

  images: {
    // Allow local images from public/ (logo, etc.)
    unoptimized: false,
  },
};

export default nextConfig;
