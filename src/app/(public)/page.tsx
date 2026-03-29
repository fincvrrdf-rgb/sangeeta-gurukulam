/**
 * Public landing page — visible to everyone (no auth required).
 * Shows app info, Join Bhajan CTA, and login/register links.
 */

import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="border-b border-saffron-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex gap-2">
            <Link href="/login" className="btn-secondary text-sm">Sign In</Link>
            <Link href="/register" className="btn-primary text-sm">Register</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="font-heading text-4xl md:text-5xl font-bold text-saffron-900 mb-4">
            Sangeeta Gurukulam
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Learn Carnatic devotional music in a traditional gurukulam setting.
            Join daily bhajan sessions, structured classes, and progress through
            the Ganamrutha Bodhini syllabus with personalized guidance.
          </p>
        </div>

        {/* Bhajan CTA */}
        <div className="max-w-md mx-auto mb-12">
          <Link
            href="/bhajan"
            className="action-card-primary text-center py-8 block"
          >
            <span className="text-3xl mb-2 block">&#x1F3B6;</span>
            <span className="text-xl font-heading font-semibold text-saffron-800">
              Join Daily Bhajan
            </span>
            <span className="text-sm text-saffron-600 mt-1 block">
              Free devotional singing session at 5:30 PM IST
            </span>
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="card text-center">
            <div className="text-2xl mb-2">&#x1F4DA;</div>
            <h3 className="font-heading font-semibold mb-2">Structured Syllabus</h3>
            <p className="text-sm text-gray-600">
              Progress through Swaravali, Jantai, Dhattu, Upper Sthayi,
              and Geethams with mastery-based advancement.
            </p>
          </div>
          <div className="card text-center">
            <div className="text-2xl mb-2">&#x1F3A4;</div>
            <h3 className="font-heading font-semibold mb-2">Practice & Record</h3>
            <p className="text-sm text-gray-600">
              Record your practice within the app, receive teacher feedback,
              and track your improvement week by week.
            </p>
          </div>
          <div className="card text-center">
            <div className="text-2xl mb-2">&#x1F4DD;</div>
            <h3 className="font-heading font-semibold mb-2">Lyrics & Resources</h3>
            <p className="text-sm text-gray-600">
              Access lyrics with transliteration and translation.
              Read along during class or bhajan on any device.
            </p>
          </div>
        </div>

        {/* Register CTA */}
        <div className="text-center">
          <Link href="/register" className="btn-primary text-lg px-8 py-3">
            Join as a Student
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          <p>Sangeeta Gurukulam &mdash; Carnatic Devotional Music Classes</p>
          <div className="flex justify-center gap-4 mt-2">
            <Link href="/privacy" className="hover:text-saffron-700">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-saffron-700">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
