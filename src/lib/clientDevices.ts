import type { Client, ClientDevice, DeviceContractType } from '@/types/database';

export interface DeviceContractInfo {
  effectiveStatus: DeviceContractType;
  isExpiringSoon: boolean; // <= 7 days remaining
  isExpired: boolean; // end_date < today
  daysRemaining: number | null;
  statusLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dateRangeLabel: string;
}

/**
 * Parse structured devices from client record, with fallback to comma-separated device_ids
 */
export function parseClientDevices(client?: Partial<Client> | null): ClientDevice[] {
  if (!client) return [];

  // 1. Structured devices array
  if (Array.isArray(client.devices) && client.devices.length > 0) {
    return client.devices;
  }

  // 2. JSON string devices
  if (typeof client.devices === 'string' && client.devices.trim()) {
    try {
      const parsed = JSON.parse(client.devices);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  // 3. Fallback from legacy device_ids
  if (client.device_ids) {
    const list = client.device_ids
      .split(/[,\n;]/)
      .map((d) => d.trim())
      .filter(Boolean);

    return list.map((tag) => ({
      device_id: tag,
      contract_type: 'non_contract',
      start_date: null,
      end_date: null,
      notes: null,
    }));
  }

  return [];
}

/**
 * Format ISO date string YYYY-MM-DD into readable Indian date DD.MM.YYYY
 */
export function formatContractDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const [year, month, day] = dateStr.split('T')[0].split('-');
    if (year && month && day) {
      return `${day}.${month}.${year}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Evaluates contract status, automatic transition to non-contract when expired,
 * and detects expiry within 1 week (<= 7 days).
 */
export function getDeviceContractInfo(device: ClientDevice): DeviceContractInfo {
  const todayStr = new Date().toISOString().split('T')[0];
  const type = device.contract_type || 'non_contract';

  const startFormatted = formatContractDate(device.start_date);
  const endFormatted = formatContractDate(device.end_date);
  const dateRangeLabel = device.start_date && device.end_date
    ? `${startFormatted} to ${endFormatted}`
    : device.end_date
    ? `Valid till ${endFormatted}`
    : 'No contract dates set';

  // 1. Explicit Non-Contract
  if (type === 'non_contract') {
    return {
      effectiveStatus: 'non_contract',
      isExpiringSoon: false,
      isExpired: false,
      daysRemaining: null,
      statusLabel: 'Non-Contract',
      badgeBg: 'bg-slate-100',
      badgeText: 'text-slate-700',
      badgeBorder: 'border-slate-300',
      dateRangeLabel: 'Out of Contract',
    };
  }

  // 2. If no end_date specified
  if (!device.end_date) {
    const label = type === 'amc' ? 'AMC (No Expiry)' : 'Warranty (No Expiry)';
    return {
      effectiveStatus: type,
      isExpiringSoon: false,
      isExpired: false,
      daysRemaining: null,
      statusLabel: label,
      badgeBg: type === 'amc' ? 'bg-blue-50' : 'bg-emerald-50',
      badgeText: type === 'amc' ? 'text-blue-700' : 'text-emerald-700',
      badgeBorder: type === 'amc' ? 'border-blue-300' : 'border-emerald-300',
      dateRangeLabel,
    };
  }

  // 3. Compute difference in days
  const endDateObj = new Date(device.end_date);
  const todayObj = new Date(todayStr);
  const diffTime = endDateObj.getTime() - todayObj.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // A) EXPIRED: Automatically becomes Non-Contract
  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays);
    return {
      effectiveStatus: 'non_contract', // Automatically Non-Contract!
      isExpiringSoon: false,
      isExpired: true,
      daysRemaining: diffDays,
      statusLabel: `Expired (${daysAgo}d ago) • Non-Contract`,
      badgeBg: 'bg-red-50',
      badgeText: 'text-red-700',
      badgeBorder: 'border-red-300',
      dateRangeLabel,
    };
  }

  // B) EXPIRING SOON: Within 1 week (0 to 7 days remaining)
  if (diffDays <= 7) {
    const typeLabel = type === 'amc' ? 'AMC' : 'Warranty';
    const urgency = diffDays === 0 ? 'Expires Today!' : `Expires in ${diffDays} day${diffDays > 1 ? 's' : ''}!`;
    return {
      effectiveStatus: type,
      isExpiringSoon: true,
      isExpired: false,
      daysRemaining: diffDays,
      statusLabel: `⚠️ ${typeLabel} (${urgency})`,
      badgeBg: 'bg-amber-50',
      badgeText: 'text-amber-800',
      badgeBorder: 'border-amber-400',
      dateRangeLabel,
    };
  }

  // C) ACTIVE Contract: More than 7 days remaining
  const activeLabel = type === 'amc' ? `AMC (${diffDays}d left)` : `Warranty (${diffDays}d left)`;
  return {
    effectiveStatus: type,
    isExpiringSoon: false,
    isExpired: false,
    daysRemaining: diffDays,
    statusLabel: activeLabel,
    badgeBg: type === 'amc' ? 'bg-blue-50' : 'bg-emerald-50',
    badgeText: type === 'amc' ? 'text-blue-700' : 'text-emerald-700',
    badgeBorder: type === 'amc' ? 'border-blue-300' : 'border-emerald-300',
    dateRangeLabel,
  };
}

export interface ClientDeviceAlert {
  client: Client;
  device: ClientDevice;
  info: DeviceContractInfo;
}

/**
 * Get all devices for a client that are either expiring within 1 week or expired
 */
export function getClientExpiryAlerts(client: Client): ClientDeviceAlert[] {
  const devices = parseClientDevices(client);
  const alerts: ClientDeviceAlert[] = [];

  devices.forEach((dev) => {
    const info = getDeviceContractInfo(dev);
    // Alert if expiring within 7 days or expired within last 60 days
    if (info.isExpiringSoon || (info.isExpired && (info.daysRemaining ?? -100) >= -60)) {
      alerts.push({
        client,
        device: dev,
        info,
      });
    }
  });

  return alerts;
}

/**
 * Scan all clients and return all devices expiring within 1 week or recently expired
 */
export function getAllClientsExpiryAlerts(clients: Client[]): ClientDeviceAlert[] {
  const allAlerts: ClientDeviceAlert[] = [];
  clients.forEach((c) => {
    allAlerts.push(...getClientExpiryAlerts(c));
  });

  // Sort by urgency: expiring soonest first
  allAlerts.sort((a, b) => {
    const aDays = a.info.daysRemaining ?? 999;
    const bDays = b.info.daysRemaining ?? 999;
    return aDays - bDays;
  });

  return allAlerts;
}
