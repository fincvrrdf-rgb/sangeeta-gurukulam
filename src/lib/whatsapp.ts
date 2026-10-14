/**
 * lib/whatsapp.ts
 *
 * Builds wa.me deep links so a teacher can message a student (or a student
 * their teacher) in one tap, straight from a notification.
 *
 * wa.me only accepts digits — no '+', spaces, dashes or brackets — and the
 * number must carry its country code.
 */

/** Country code used when a stored number has no international prefix. */
const DEFAULT_COUNTRY_CODE = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE || '91';

/**
 * Normalises a stored phone number into the digits-only form wa.me expects.
 * Returns null when the number is missing or cannot be made valid.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Numbers stored with a leading 00 international prefix (e.g. 0091…)
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Domestic trunk prefix, e.g. 0 98765 43210 → 98765 43210
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  // A bare national number still needs its country code
  if (digits.length <= 10) digits = `${DEFAULT_COUNTRY_CODE}${digits}`;

  // E.164 allows 8–15 digits once the country code is included
  if (digits.length < 8 || digits.length > 15) return null;

  return digits;
}

/**
 * Builds a WhatsApp deep link, optionally pre-filling a message.
 * Returns null when the phone number is unusable, so callers can simply
 * omit the action instead of rendering a broken link.
 */
export function whatsAppLink(
  phone: string | null | undefined,
  message?: string,
): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;

  const base = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** "Priya Sharma" → "Priya", for friendlier button labels. */
export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return 'them';
  return fullName.trim().split(/\s+/)[0] || 'them';
}
