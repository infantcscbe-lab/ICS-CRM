export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName?: string;
}

const STORAGE_KEY = 'ics_smtp_settings';

export const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  host: 'smtp.hostinger.com',
  port: 465,
  user: 'accounts@icsstore.in',
  pass: '',
  fromName: 'Infant Computer Store (ICS)',
};

export function getSavedSmtpConfig(): SmtpConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SMTP_CONFIG,
        ...parsed,
        // Guarantee user is accounts@icsstore.in if not explicitly set
        user: parsed.user || 'accounts@icsstore.in',
      };
    }
  } catch (err) {
    console.warn('Failed to load saved SMTP config from localStorage:', err);
  }
  return { ...DEFAULT_SMTP_CONFIG };
}

export function saveSmtpConfig(config: Partial<SmtpConfig>): SmtpConfig {
  const current = getSavedSmtpConfig();
  const updated: SmtpConfig = {
    ...current,
    ...config,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save SMTP config to localStorage:', err);
  }
  return updated;
}

export function hasSmtpPassword(): boolean {
  const config = getSavedSmtpConfig();
  return Boolean(config.pass && config.pass.trim().length > 0);
}
