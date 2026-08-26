import type { AdminNotification } from '@/types/database';

const NOTIFICATIONS_STORAGE_KEY = 'ics_admin_notifications';

/**
 * Dispatches a storage event for same-window updates so UI reactive states re-render immediately.
 */
function emitNotificationChange() {
  window.dispatchEvent(new Event('ics-notifications-updated'));
}

export function getAdminNotifications(): AdminNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminNotification[]) : [];
  } catch {
    return [];
  }
}

export function addAdminNotification(
  notification: Omit<AdminNotification, 'id' | 'created_at' | 'read'>
): AdminNotification {
  const all = getAdminNotifications();
  const newNotif: AdminNotification = {
    ...notification,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    read: false,
  };
  const updated = [newNotif, ...all];
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  emitNotificationChange();
  return newNotif;
}

export function markNotificationAsRead(id: string): void {
  const all = getAdminNotifications();
  const updated = all.map((n) => (n.id === id ? { ...n, read: true } : n));
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  emitNotificationChange();
}

export function markAllNotificationsAsRead(): void {
  const all = getAdminNotifications();
  const updated = all.map((n) => ({ ...n, read: true }));
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  emitNotificationChange();
}

export function deleteNotification(id: string): void {
  const all = getAdminNotifications();
  const updated = all.filter((n) => n.id !== id);
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  emitNotificationChange();
}

export function clearAllNotifications(): void {
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify([]));
  emitNotificationChange();
}

/**
 * Filter notifications:
 * Active = within last 48 hours (2 days)
 * History = older than 48 hours (2 days)
 */
export function getPartitionedNotifications(notifications: AdminNotification[]): {
  active: AdminNotification[];
  history: AdminNotification[];
  unreadCount: number;
} {
  const now = new Date().getTime();
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000; // 48 Hours

  const active: AdminNotification[] = [];
  const history: AdminNotification[] = [];
  let unreadCount = 0;

  notifications.forEach((item) => {
    const itemTime = new Date(item.created_at).getTime();
    const age = now - itemTime;

    if (age <= TWO_DAYS_MS) {
      active.push(item);
      if (!item.read) unreadCount++;
    } else {
      history.push(item);
    }
  });

  return { active, history, unreadCount };
}
