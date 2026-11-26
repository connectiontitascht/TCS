import {
  collection,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Notification, NotificationType, UserRole } from '../types';

export interface CreateWorkflowNotificationInput {
  userId?: string;
  targetRole?: UserRole | 'all';
  targetSection?: 'home_user' | 'voucher' | 'history' | 'reseller' | 'daily_closing';
  itemId?: string;
  stepStatus?: string;
  title?: string;
  type: NotificationType;
  message: string;
  actorName?: string;
  actorEmail?: string;
}

export async function sendWorkflowNotification(payload: CreateWorkflowNotificationInput): Promise<void> {
  try {
    const notificationRef = doc(collection(db, 'notifications'));
    const targetUserId = payload.userId || (payload.targetRole ? `role:${payload.targetRole}` : 'all');

    await setDoc(notificationRef, {
      id: notificationRef.id,
      userId: targetUserId,
      ...(payload.targetRole ? { targetRole: payload.targetRole } : {}),
      ...(payload.targetSection ? { targetSection: payload.targetSection } : {}),
      ...(payload.itemId ? { itemId: payload.itemId } : {}),
      ...(payload.stepStatus ? { stepStatus: payload.stepStatus } : {}),
      ...(payload.title ? { title: payload.title } : {}),
      type: payload.type,
      message: payload.message,
      ...(payload.actorName ? { actorName: payload.actorName } : {}),
      ...(payload.actorEmail ? { actorEmail: payload.actorEmail } : {}),
      read: false,
      readBy: [],
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to send workflow notification:', err);
  }
}

export function isNotificationReadForUser(notification: Notification, currentUserId?: string): boolean {
  if (!currentUserId) return Boolean(notification.read);
  if (Array.isArray(notification.readBy) && notification.readBy.includes(currentUserId)) {
    return true;
  }
  if (notification.userId === currentUserId && notification.read) {
    return true;
  }
  return false;
}

export async function markNotificationRead(notification: Notification, currentUserId?: string): Promise<void> {
  if (!currentUserId) return;
  if (isNotificationReadForUser(notification, currentUserId)) return;

  try {
    const docRef = doc(db, 'notifications', notification.id);
    const updatePayload: Record<string, any> = {
      readBy: arrayUnion(currentUserId),
    };
    if (notification.userId === currentUserId) {
      updatePayload.read = true;
    }
    await updateDoc(docRef, updatePayload);
  } catch (err) {
    console.error('Failed to mark notification as read:', err);
  }
}

export async function markAllNotificationsRead(notifications: Notification[], currentUserId?: string): Promise<void> {
  if (!currentUserId) return;
  const unread = notifications.filter((n) => !isNotificationReadForUser(n, currentUserId));
  if (unread.length === 0) return;

  await Promise.allSettled(unread.map((n) => markNotificationRead(n, currentUserId)));
}
