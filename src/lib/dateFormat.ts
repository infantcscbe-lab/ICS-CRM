/**
 * Consistent date formatting utilities for the entire app.
 */

/** Format YYYY-MM-DD to human-readable: "Mon, Aug 26, 2026" */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Format YYYY-MM-DD to short: "Aug 26" */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Format ISO timestamp to readable datetime: "Aug 26, 2026 at 10:30 AM" */
export function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) + ' at ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

/** Format ISO timestamp to time only: "10:30 AM" */
export function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

/** Get relative time: "2 hours ago", "Yesterday", etc. */
export function timeAgo(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const now = Date.now();
    const then = new Date(isoStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return 'Yesterday';
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return isoStr;
  }
}
