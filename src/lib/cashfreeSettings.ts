export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  apiVersion?: string;
}

const STORAGE_KEY = 'ics_cashfree_settings';

export const DEFAULT_CASHFREE_CONFIG: CashfreeConfig = {
  appId: (import.meta as any).env?.VITE_CASHFREE_APP_ID || '',
  secretKey: (import.meta as any).env?.VITE_CASHFREE_SECRET_KEY || '',
  environment: ((import.meta as any).env?.VITE_CASHFREE_ENV as 'sandbox' | 'production') || 'sandbox',
  apiVersion: '2023-08-01',
};

export function getSavedCashfreeConfig(): CashfreeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CASHFREE_CONFIG,
        ...parsed,
        environment: parsed.environment === 'production' ? 'production' : 'sandbox',
      };
    }
  } catch (err) {
    console.warn('Failed to read Cashfree config from localStorage:', err);
  }
  return { ...DEFAULT_CASHFREE_CONFIG };
}

export function saveCashfreeConfig(config: Partial<CashfreeConfig>): CashfreeConfig {
  const current = getSavedCashfreeConfig();
  const updated: CashfreeConfig = {
    ...current,
    ...config,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save Cashfree config to localStorage:', err);
  }
  return updated;
}

export function hasCashfreeConfig(): boolean {
  const cfg = getSavedCashfreeConfig();
  return Boolean(cfg.appId?.trim() && cfg.secretKey?.trim());
}
