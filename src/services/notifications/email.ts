/**
 * services/notifications/email.ts
 *
 * Email sending via Resend. SERVER-ONLY.
 * Falls back gracefully if RESEND_API_KEY is not configured.
 *
 * Environment variable required: RESEND_API_KEY
 */

import type { NotificationType } from '@/domain/enums';

interface EmailInput {
  to: string;
  recipientName: string;
  type: NotificationType;
  title: string;
  body: string;
}

/**
 * Send a notification email via the Resend API.
 *
 * Note: This uses the Resend REST API directly to avoid adding
 * the Resend SDK as a dependency. If Resend is not configured,
 * the function logs a warning and returns without sending.
 */
export async function sendNotificationEmail(input: EmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.startsWith('REPLACE_')) {
    console.warn('[EMAIL] Resend API key not configured. Email not sent:', input.type);
    return;
  }

  const html = buildEmailHtml(input);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: 'Sangeeta Gurukulam <noreply@sangeetagurukulam.com>',
      to: input.to,
      subject: `[Sangeeta Gurukulam] ${input.title}`,
      html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API error ${response.status}: ${errorBody}`);
  }
}

/**
 * Build a simple, clean HTML email body.
 * Styled inline for maximum email client compatibility.
 */
function buildEmailHtml(input: EmailInput): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', Arial, sans-serif; background-color: #faf8f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px; border: 1px solid #e5e2de;">
    <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #92400e; font-size: 24px; margin-top: 0;">
      Sangeeta Gurukulam
    </h1>
    <p style="color: #1c1917; font-size: 14px;">
      Namaste ${input.recipientName},
    </p>
    <div style="background: #fffbeb; border-left: 4px solid #d97706; padding: 16px; margin: 16px 0; border-radius: 4px;">
      <strong style="color: #92400e;">${input.title}</strong>
      <p style="color: #1c1917; margin: 8px 0 0 0;">${input.body}</p>
    </div>
    <p style="color: #78716c; font-size: 12px; margin-top: 24px;">
      This is an automated notification from Sangeeta Gurukulam.
      Please do not reply to this email.
    </p>
  </div>
</body>
</html>`.trim();
}
