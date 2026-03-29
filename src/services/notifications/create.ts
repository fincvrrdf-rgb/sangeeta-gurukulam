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

  // Create in-app notification
  const notificationId = await createDoc(COLLECTIONS.NOTIFICATIONS, {
    recipientId: input.recipientId,
    recipientRole: user.role,
    type: input.type,
    title: input.title,
    body: input.body,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
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
