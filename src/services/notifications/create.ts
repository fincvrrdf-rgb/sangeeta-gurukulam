/**
 * services/notifications/create.ts
 *
 * Creates in-app notifications and optionally sends email.
 * Every system event that needs user attention calls this service.
 */

import { createDoc, getDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { NotificationType, NotificationChannel, UserRole } from '@/domain/enums';
import type { User, AppSettings } from '@/domain/types';

interface NotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
  /** Optional one-tap action, e.g. a wa.me link to message the other person */
  actionUrl?: string | null;
  /** Button text for actionUrl, e.g. 'Message Priya on WhatsApp' */
  actionLabel?: string | null;
}

/**
 * Create an in-app notification. If email is enabled in settings and
 * the user has consented, also queues an email.
 */
export async function createNotification(input: NotificationInput): Promise<string> {
  const user = await getDoc<User>(COLLECTIONS.USERS, input.recipientId);
  if (!user) {
    console.warn(`[NOTIFICATION] Recipient not found: ${input.recipientId}`);
    return '';
  }

  // Create in-app notification.
  // recipientId/type are canonical (the Firestore rules authorise reads on
  // recipientId). userId/notificationType are written as mirrors because the
  // student page, teacher page and notification bell all query those names —
  // writing both keeps every reader working.
  const notificationId = await createDoc(COLLECTIONS.NOTIFICATIONS, {
    recipientId: input.recipientId,
    userId: input.recipientId,
    recipientRole: user.role,
    type: input.type,
    notificationType: input.type,
    title: input.title,
    body: input.body,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    actionUrl: input.actionUrl ?? null,
    actionLabel: input.actionLabel ?? null,
    isRead: false,
    readAt: null,
    channel: 'in_app' as NotificationChannel,
    emailSentAt: null,
  });

  // Send email if enabled
  const settings = await getDoc<AppSettings>(COLLECTIONS.APP_SETTINGS, 'global');
  if (settings?.notifications.emailEnabled && user.consentNotifications && user.email) {
    try {
      const { sendNotificationEmail } = await import('@/services/notifications/email');
      await sendNotificationEmail({
        to: user.email,
        recipientName: user.displayName,
        type: input.type,
        title: input.title,
        body: input.body,
      });
    } catch (error) {
      // Email failure must not block notification creation
      console.error('[NOTIFICATION_EMAIL_FAILED]', input.type, input.recipientId, error);
    }
  }

  return notificationId;
}

/**
 * Create notifications for multiple recipients (e.g., class cancellation).
 */
export async function createBulkNotifications(
  recipientIds: string[],
  type: NotificationType,
  title: string,
  body: string,
  referenceType?: string,
  referenceId?: string
): Promise<void> {
  const promises = recipientIds.map((recipientId) =>
    createNotification({
      recipientId,
      type,
      title,
      body,
      referenceType,
      referenceId,
    })
  );
  await Promise.allSettled(promises);
}
