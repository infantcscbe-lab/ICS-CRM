import { getSavedCashfreeConfig, type CashfreeConfig } from './cashfreeSettings';

declare global {
  interface Window {
    Cashfree?: any;
  }
}

/**
 * Returns the base URL for backend API endpoints (/api/cashfree, /api/send-email).
 * Always routes to live Vercel backend server 'https://crm.icsstore.in' when
 * running in mobile app or local environments to ensure server-side Cashfree API calls.
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return 'https://crm.icsstore.in';
  const isLocalOrCapacitor = Boolean(
    (window as any).Capacitor ||
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );

  if (isLocalOrCapacitor) {
    return 'https://crm.icsstore.in';
  }
  return '';
}

/**
 * Dynamically loads the official Cashfree JS SDK v3 script if not already present.
 */
export async function loadCashfreeSdk(): Promise<any> {
  if (typeof window === 'undefined') return null;

  if (window.Cashfree) {
    return window.Cashfree;
  }

  return new Promise((resolve, reject) => {
    // Check if already injected
    const existing = document.getElementById('cashfree-sdk-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Cashfree));
      existing.addEventListener('error', (e) => reject(e));
      if (window.Cashfree) return resolve(window.Cashfree);
      return;
    }

    const script = document.createElement('script');
    script.id = 'cashfree-sdk-script';
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => {
      resolve(window.Cashfree);
    };
    script.onerror = () => {
      reject(new Error('Failed to load Cashfree checkout SDK. Please check your internet connection.'));
    };
    document.head.appendChild(script);
  });
}

export interface CreateOrderParams {
  orderId: string;
  orderAmount: number;
  orderCurrency?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  orderNote?: string;
  config?: CashfreeConfig;
}

export interface CashfreeOrderResponse {
  payment_session_id: string;
  order_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
  cf_order_id?: string;
}

export interface VerifyOrderResponse {
  order_id: string;
  order_status: 'PAID' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | string;
  order_amount: number;
  order_currency: string;
  payments?: Array<{
    cf_payment_id: string | number;
    payment_status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'USER_DROPPED' | string;
    payment_amount: number;
    payment_time: string;
    payment_message?: string;
    payment_method?: any;
    bank_reference?: string;
  }>;
}

/**
 * Creates a Cashfree payment session by calling /api/cashfree on https://crm.icsstore.in
 */
export async function createCashfreeOrderSession(params: CreateOrderParams): Promise<CashfreeOrderResponse> {
  const cfg = params.config || getSavedCashfreeConfig();

  if (!cfg.appId || !cfg.secretKey) {
    throw new Error('Cashfree App ID and Secret Key are not configured. Please open Cashfree Settings to configure them.');
  }

  const endpoint = getApiBaseUrl() + '/api/cashfree';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create-order',
      config: cfg,
      order: {
        orderId: params.orderId,
        orderAmount: params.orderAmount,
        orderCurrency: params.orderCurrency || 'INR',
        customerName: params.customerName || 'Customer',
        customerPhone: params.customerPhone || '9999999999',
        customerEmail: params.customerEmail || 'accounts@icsstore.in',
        orderNote: params.orderNote || 'Service Job Payment',
      },
    }),
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('Server returned invalid response. Please verify network connection to https://crm.icsstore.in.');
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || data.message || 'Failed to create Cashfree payment order.');
  }

  return data;
}

/**
 * Verifies payment status for an existing order by calling /api/cashfree on https://crm.icsstore.in
 */
export async function verifyCashfreeOrderStatus(
  orderId: string,
  config?: CashfreeConfig
): Promise<VerifyOrderResponse> {
  const cfg = config || getSavedCashfreeConfig();
  const endpoint = getApiBaseUrl() + '/api/cashfree';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'verify-order',
      config: cfg,
      orderId,
    }),
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Verification returned non-JSON response.');
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || data.message || 'Failed to verify Cashfree order.');
  }

  return data;
}

/**
 * Tests connection credentials by calling /api/cashfree on https://crm.icsstore.in
 */
export async function testCashfreeCredentials(config?: CashfreeConfig): Promise<{ success: boolean; message?: string }> {
  const cfg = config || getSavedCashfreeConfig();

  if (!cfg.appId || !cfg.secretKey) {
    throw new Error('Please fill in both App ID and Secret Key before testing.');
  }

  const endpoint = getApiBaseUrl() + '/api/cashfree';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'test-credentials',
      config: cfg,
    }),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {}

  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to authenticate with Cashfree server.');
  }

  return {
    success: true,
    message: data.message || `Successfully connected to Cashfree Payment Gateway (${cfg.environment.toUpperCase()} mode)!`,
  };
}

/**
 * Dismisses/removes any stuck Cashfree iframe or modal overlay from the DOM
 */
export function dismissCashfreeCheckout() {
  if (typeof document === 'undefined') return;
  const elements = document.querySelectorAll(
    'iframe[src*="cashfree"], iframe[id*="cashfree"], div[id*="cashfree"], div[class*="cashfree"], div[class*="cf-modal"], #cf-checkout-container, [id^="cf-"], [class^="cf-"]'
  );
  elements.forEach((el) => {
    try {
      el.remove();
    } catch {}
  });
}

/**
 * Opens Cashfree Checkout Modal via JS SDK
 */
export async function openCashfreeCheckout(options: {
  paymentSessionId: string;
  environment?: 'sandbox' | 'production';
  redirectTarget?: '_modal' | '_blank' | '_self';
}): Promise<{
  paymentDetails?: any;
  error?: any;
}> {
  const CashfreeSDK = await loadCashfreeSdk();
  if (!CashfreeSDK) {
    throw new Error('Cashfree SDK is not available.');
  }

  const env = options.environment || getSavedCashfreeConfig().environment;
  const cashfree = CashfreeSDK({
    mode: env === 'production' ? 'production' : 'sandbox',
  });

  return new Promise((resolve) => {
    cashfree
      .checkout({
        paymentSessionId: options.paymentSessionId,
        redirectTarget: options.redirectTarget || '_modal',
      })
      .then((res: any) => {
        resolve(res || {});
      })
      .catch((err: any) => {
        console.warn('Cashfree checkout modal error:', err);
        resolve({ error: err });
      });
  });
}
