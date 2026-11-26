import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, CheckCircle2, Clock, FileText, Receipt, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { AppUser, Notification } from '../types';
import {
  isNotificationReadForUser,
  markNotificationRead,
  markAllNotificationsRead,
} from '../utils/notifications';

interface NotificationBellProps {
  user: { uid: string; email?: string } | null;
  currentUserProfile: AppUser | null;
  onNavigateSection?: (
    section: 'dashboard' | 'history' | 'home_user' | 'reseller' | 'voucher' | 'daily_closing' | 'system_users'
  ) => void;
}

const formatNotificationTime = (isoStr: string): string => {
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getRoleBadge = (n: Notification) => {
  if (n.stepStatus === 'rejected') {
    return { label: 'Cancelled', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  if (n.stepStatus === 'approved') {
    return { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  switch (n.targetRole) {
    case 'supervisor':
      return { label: 'To Supervisor', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'manager':
      return { label: 'To Manager', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'accountant':
      return { label: 'To Accounts', cls: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'admin':
      return { label: 'Admin', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    default:
      return { label: 'Update', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
};

export const NotificationBell = ({
  user,
  currentUserProfile,
  onNavigateSection,
}: NotificationBellProps) => {
  const notifications = useNotifications(user, currentUserProfile);
  const currentUserId = user?.uid;

  const unreadCount = notifications.filter((n) => !isNotificationReadForUser(n, currentUserId)).length;
  const [open, setOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'unread'>('all');
  const [liveToast, setLiveToast] = useState<Notification | null>(null);

  const initializedRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Reset seen tracker when user changes
  useEffect(() => {
    initializedRef.current = false;
    seenIdsRef.current = new Set();
    setLiveToast(null);
  }, [currentUserId]);

  // Show live toast when a brand-new notification arrives in real-time
  useEffect(() => {
    if (!currentUserId) return;

    if (!initializedRef.current) {
      notifications.forEach((n) => seenIdsRef.current.add(n.id));
      initializedRef.current = true;
      return;
    }

    const newlyArrived = notifications.find(
      (n) =>
        !seenIdsRef.current.has(n.id) &&
        !isNotificationReadForUser(n, currentUserId) &&
        (!n.actorEmail || n.actorEmail.toLowerCase() !== user?.email?.toLowerCase())
    );

    notifications.forEach((n) => seenIdsRef.current.add(n.id));

    if (newlyArrived) {
      setLiveToast(newlyArrived);
      const timer = setTimeout(() => {
        setLiveToast((prev) => (prev?.id === newlyArrived.id ? null : prev));
      }, 6500);
      return () => clearTimeout(timer);
    }
  }, [notifications, currentUserId, user?.email]);

  const handleNotificationClick = async (n: Notification) => {
    await markNotificationRead(n, currentUserId);
    setOpen(false);
    setLiveToast(null);

    if (n.targetSection && onNavigateSection) {
      const access = currentUserProfile?.menuAccess;
      const allowed =
        !access ||
        (n.targetSection === 'home_user' && access.showHomeUser) ||
        (n.targetSection === 'voucher' && access.showVoucher) ||
        (n.targetSection === 'history' && access.showHistory) ||
        (n.targetSection === 'reseller' && access.showReseller) ||
        (n.targetSection === 'daily_closing' && access.showDailyClosing);
      if (allowed) {
        onNavigateSection(n.targetSection);
      }
    }
  };

  const displayedNotifications =
    filterTab === 'unread'
      ? notifications.filter((n) => !isNotificationReadForUser(n, currentUserId))
      : notifications;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-2 hover:bg-slate-100 rounded-full relative transition cursor-pointer"
        title="Notifications"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-indigo-600' : 'text-slate-600'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-sm ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Live real-time toast popup for incoming step notifications */}
      {liveToast && !open && (
        <div className="fixed top-20 right-6 z-50 w-80 sm:w-96 bg-white border border-indigo-200 rounded-2xl shadow-2xl p-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
              {liveToast.stepStatus === 'rejected' ? (
                <AlertTriangle className="w-4.5 h-4.5 text-rose-600" />
              ) : liveToast.stepStatus === 'approved' ? (
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
              ) : (
                <Bell className="w-4.5 h-4.5 text-indigo-600 animate-bounce" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">
                  {liveToast.title || 'New Notification'}
                </span>
                <button
                  type="button"
                  onClick={() => setLiveToast(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs font-semibold text-slate-800 mt-1 leading-snug">
                {liveToast.message}
              </p>
              <button
                type="button"
                onClick={() => handleNotificationClick(liveToast)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <span>Open & Mark Read</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-40 overflow-hidden animate-scale-up">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-800">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-extrabold">
                    {unreadCount} New
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllNotificationsRead(notifications, currentUserId)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Filter tabs */}
            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 bg-white">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('unread')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  filterTab === 'unread'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {/* Notification list */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {displayedNotifications.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-500">
                    {filterTab === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
                  </p>
                </div>
              ) : (
                displayedNotifications.map((n) => {
                  const isRead = isNotificationReadForUser(n, currentUserId);
                  const badge = getRoleBadge(n);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left px-4 py-3 transition flex items-start gap-3 cursor-pointer ${
                        isRead
                          ? 'bg-white hover:bg-slate-50'
                          : 'bg-indigo-50/50 hover:bg-indigo-50/80'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          n.targetSection === 'voucher'
                            ? 'bg-rose-50 text-rose-600'
                            : n.targetSection === 'home_user'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {n.targetSection === 'voucher' ? (
                          <FileText className="w-4 h-4" />
                        ) : n.targetSection === 'home_user' ? (
                          <Receipt className="w-4 h-4" />
                        ) : (
                          <Clock className="w-4 h-4" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                            {formatNotificationTime(n.createdAt)}
                          </span>
                        </div>
                        {n.title && (
                          <p
                            className={`text-xs font-bold leading-tight mb-0.5 ${
                              isRead ? 'text-slate-700' : 'text-slate-900'
                            }`}
                          >
                            {n.title}
                          </p>
                        )}
                        <p
                          className={`text-[11px] leading-snug ${
                            isRead ? 'text-slate-500' : 'text-slate-700 font-medium'
                          }`}
                        >
                          {n.message}
                        </p>
                      </div>

                      {!isRead && (
                        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 mt-2"></span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
