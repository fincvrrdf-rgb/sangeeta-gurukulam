/**
 * Terms of Use — public page.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Terms of Use — Sangeeta Gurukulam',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/" className="flex items-center gap-2 w-fit">
            <span className="text-2xl">🎵</span>
            <span className="font-heading font-bold text-saffron-800">Sangeeta Gurukulam</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="font-heading text-3xl font-bold text-charcoal mb-6">Terms of Use</h1>

        <p className="text-gray-600 text-sm mb-8">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">1. Use of the Platform</h2>
          <p className="text-sm text-gray-700">
            Sangeeta Gurukulam is a private platform for enrolled music students and teachers.
            Access is granted by invitation only. You agree to use this platform solely for your
            music education and related activities.
          </p>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">2. Attendance & Payment Policy</h2>
          <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
            <li>Students are expected to attend classes regularly.</li>
            <li>4 consecutive unexcused absences trigger a compulsory payment fee per school policy.</li>
            <li>Teacher-cancelled classes and approved long absences are never counted as violations.</li>
            <li>Payment proof must be submitted within the specified timeframe for verification.</li>
          </ul>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">3. Recordings</h2>
          <p className="text-sm text-gray-700">
            By submitting a practice recording, you grant Sangeeta Gurukulam permission to store and
            share it with your teacher for educational feedback. Recordings will not be shared publicly
            or used for any purpose other than your music education.
          </p>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">4. AI-Generated Content</h2>
          <p className="text-sm text-gray-700">
            Some features use AI to assist with report generation, lyrics transliteration, and other tasks.
            All AI-generated content is clearly labeled as a draft and requires teacher review before
            being shared with students. AI outputs are never automatically approved or published.
          </p>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">5. Syllabus Content</h2>
          <p className="text-sm text-gray-700">
            This platform references the Ganamrutha Bodhini textbook by A.S. Panchapakesa Iyer
            (Ganamrutha Prachuram, Chennai). The app stores teacher-authored metadata and notes only.
            No pages or content from the copyrighted textbook are reproduced within this platform.
          </p>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">6. Conduct</h2>
          <p className="text-sm text-gray-700">
            Users agree to maintain respectful conduct in all interactions on this platform.
            The platform is dedicated to the sacred tradition of Carnatic music education.
          </p>
        </section>

        <div className="text-center mt-8">
          <Link href="/" className="btn-secondary">← Back to Home</Link>
        </div>
      </main>
    </div>
  );
}
