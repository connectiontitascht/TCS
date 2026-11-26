import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { AppUser, Notification } from '../types';

export const useNotifications = (
  user?: { uid: string; email?: string } | null,
  currentUserProfile?: AppUser | null
) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(120)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const isAdmin =
          currentUserProfile?.role === 'admin' ||
          user.email?.toLowerCase() === 'connection.titascht@gmail.com';
        const userRole = currentUserProfile?.role;
        const perms = currentUserProfile?.permissions;

        const notes: Notification[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const createdAtStr =
            typeof data.createdAt === 'string'
              ? data.createdAt
              : data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString();

          const note: Notification = {
            id: docSnap.id,
            userId: data.userId || '',
            targetRole: data.targetRole,
            targetSection: data.targetSection,
            itemId: data.itemId,
            stepStatus: data.stepStatus,
            title: data.title,
            type: data.type || 'new_transaction',
            message: data.message || '',
            actorName: data.actorName,
            actorEmail: data.actorEmail,
            read: Boolean(data.read),
            readBy: Array.isArray(data.readBy) ? data.readBy : [],
            createdAt: createdAtStr,
          };

          // Match direct user notifications
          const matchesDirectUser = note.userId === user.uid;
          const matchesAll = note.targetRole === 'all' || note.userId === 'all';

          let matchesRole = false;
          if (note.targetRole) {
            if (isAdmin) {
              // Admin can monitor all approval step notifications as well as admin-targeted ones
              matchesRole = true;
            } else if (note.targetRole === userRole) {
              matchesRole = true;
            } else if (userRole !== 'operator') {
              if (note.targetRole === 'supervisor' && perms?.canApproveSupervisor) matchesRole = true;
              if (note.targetRole === 'manager' && perms?.canApproveManager) matchesRole = true;
              if (note.targetRole === 'accountant' && perms?.canApproveAccounts) matchesRole = true;
            }
          }

          if (matchesDirectUser || matchesAll || matchesRole) {
            notes.push(note);
          }
        });

        setNotifications(notes);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
      }
    );

    return () => unsubscribe();
  }, [
    user?.uid,
    user?.email,
    currentUserProfile?.role,
    currentUserProfile?.permissions?.canApproveSupervisor,
    currentUserProfile?.permissions?.canApproveManager,
    currentUserProfile?.permissions?.canApproveAccounts,
  ]);

  return notifications;
};
