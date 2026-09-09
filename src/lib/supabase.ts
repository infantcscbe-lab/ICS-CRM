import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Resilient Fetch wrapper with a 15-second timeout to prevent
 * mobile network requests from hanging indefinitely on spotty 3G/4G connections.
 */
const fetchWithTimeout = (url: RequestInfo | URL, options: RequestInit = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  return fetch(url, {
    ...options,
    signal: options.signal || controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
