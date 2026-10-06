import { getSavedCashfreeConfig, type CashfreeConfig } from './cashfreeSettings';

declare global {
  interface Window {
    Cashfree?: any;
  }
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
    script.onerror = (err) => {
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
 * Creates a Cashfree payment session by calling /api/cashfree
 */
export async function createCashfreeOrderSession(params: CreateOrderParams): Promise<CashfreeOrderResponse> {
  const cfg = params.config || getSavedCashfreeConfig();

  if (!cfg.appId || !cfg.secretKey) {
    throw new Error('Cashfree App ID and Secret Key are not configured. Please open Cashfree Settings to configure them.');
  }

  const response = await fetch('/api/cashfree', {
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

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || 'Failed to create Cashfree payment order.');
  }

  return data;
}

/**
 * Verifies the payment status for an existing order by calling /api/cashfree
 */
export async function verifyCashfreeOrderStatus(
  orderId: string,
  config?: CashfreeConfig
): Promise<VerifyOrderResponse> {
  const cfg = config || getSavedCashfreeConfig();

  const response = await fetch('/api/cashfree', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'verify-order',
      config: cfg,
      orderId,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || 'Failed to verify Cashfree order status.');
  }

  return data;
}

/**
 * Opens Cashfree Checkout Modal via JS SDK
 */
export async function openCashfreeCheckout(options: {
  paymentSessionId: string;
  environment?: 'sandbox' | 'production';
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
        redirectTarget: '_modal',
      })
      .then((res: any) => {
        resolve(res || {});
      })
      .catch((err: any) => {
        resolve({ error: err });
      });
  });
}
