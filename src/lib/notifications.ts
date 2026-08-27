import type { AdminNotification } from '@/types/database';
import { supabase } from '@/lib/supabase';

/**
 * Notification module — 100% Supabase cloud sync (zero localStorage).
 * All notifications are persisted in the `admin_notifications` table.
 */

// ─── In-memory cache ───
let cachedNotifications: AdminNotification[] = [];
let cacheReady = false;

function emitNotificationChange() {
  window.dispatchEvent(new Event('ics-notifications-updated'));
}

// ─── Read helpers ───

export async function fetchAdminNotifications(): Promise<AdminNotification[]> {
  try {
    const { data, error } = await supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Notifications sync notice:', error.message);
      return cachedNotifications;
    }
    cachedNotifications = (data as unknown as AdminNotification[]) || [];
    cacheReady = true;
    return cachedNotifications;
  } catch {
    return cachedNotifications;
  }
}

/** Synchronous getter for already-fetched data */
export function getAdminNotifications(): AdminNotification[] {
  if (!cacheReady) {
    fetchAdminNotifications().then(emitNotificationChange);
  }
  return cachedNotifications;
}

export async function addAdminNotification(
  notification: Omit<AdminNotification, 'id' | 'created_at' | 'read'>
): Promise<AdminNotification> {
  const newNotif: AdminNotification = {
    ...notification,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    read: false,
  };

  const { data, error } = await supabase
    .from('admin_notifications')
    .insert(newNotif)
    .select()
    .single();

  if (error) {
    console.error('Add notification error:', error.message);
    // Still update cache so UI shows it
  }

  const result = (data as unknown as AdminNotification) || newNotif;
  cachedNotifications = [result, ...cachedNotifications];
  emitNotificationChange();
  return result;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await supabase.from('admin_notifications').update({ read: true }).eq('id', id);
  cachedNotifications = cachedNotifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  emitNotificationChange();
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const unreadIds = cachedNotifications.filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.length > 0) {
    await supabase.from('admin_notifications').update({ read: true }).in('id', unreadIds);
  }
  cachedNotifications = cachedNotifications.map((n) => ({ ...n, read: true }));
  emitNotificationChange();
}

export async function deleteNotification(id: string): Promise<void> {
  await supabase.from('admin_notifications').delete().eq('id', id);
  cachedNotifications = cachedNotifications.filter((n) => n.id !== id);
  emitNotificationChange();
}

export async function clearAllNotifications(): Promise<void> {
  // Delete all from Supabase
  const ids = cachedNotifications.map((n) => n.id);
  if (ids.length > 0) {
    await supabase.from('admin_notifications').delete().in('id', ids);
  }
  cachedNotifications = [];
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
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

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
