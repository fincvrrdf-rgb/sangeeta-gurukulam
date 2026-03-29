/**
 * Privacy Policy — public page.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Sangeeta Gurukulam',
};

export default function PrivacyPage() {
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

      <main className="max-w-3xl mx-auto px-4 py-10 prose prose-slate">
        <h1 className="font-heading text-3xl font-bold text-charcoal mb-6">Privacy Policy</h1>

        <p className="text-gray-600 text-sm mb-8">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">1. Information We Collect</h2>
          <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
            <li>Account information: name, email address</li>
            <li>Practice recordings uploaded by students (stored securely in Firebase Storage)</li>
            <li>Payment proof images submitted for fee verification</li>
            <li>Attendance records and class participation data</li>
            <li>Progress and assessment data within the syllabus</li>
          </ul>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">2. How We Use Your Information</h2>
          <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
            <li>To manage your enrollment and class scheduling</li>
            <li>To track attendance and trigger payment notifications per school policy</li>
            <li>To allow your teacher to review practice recordings and provide feedback</li>
            <li>To generate weekly progress reports (AI-assisted, teacher-reviewed)</li>
            <li>To send class reminders and important school notifications</li>
          </ul>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">3. Data Sharing</h2>
          <p className="text-sm text-gray-700">
            We do not sell or share your personal information with third parties.
            Your data is shared only with your assigned teacher and school administrators.
            AI processing (report generation, lyrics assistance) is handled by Groq and Google Gemini APIs —
            only session-specific data is sent; no data is retained by these providers for training purposes.
          </p>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">4. Recording Consent</h2>
          <p className="text-sm text-gray-700">
            Practice recordings are collected only with your explicit consent.
            You may withdraw consent at any time by contacting your teacher.
            Recordings are retained for up to 12 months and then automatically deleted.
          </p>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">5. Data Security</h2>
          <p className="text-sm text-gray-700">
            All data is stored on Google Firebase infrastructure with industry-standard security.
            Access is controlled through role-based authentication.
            Payment proof images are restricted to the student, their teacher, and administrators only.
          </p>
        </section>

        <section className="card mb-6">
          <h2 className="font-heading text-xl font-semibold mb-3">6. Contact</h2>
          <p className="text-sm text-gray-700">
            For privacy questions or data deletion requests, contact your school administrator.
          </p>
        </section>

        <div className="text-center mt-8">
          <Link href="/" className="btn-secondary">← Back to Home</Link>
        </div>
      </main>
    </div>
  );
}
