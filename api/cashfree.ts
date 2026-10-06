export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is supported.' });
  }

  try {
    const { action, config, order, orderId } = req.body || {};

    const appId =
      config?.appId ||
      process.env.CASHFREE_APP_ID ||
      process.env.VITE_CASHFREE_APP_ID;
    const secretKey =
      config?.secretKey ||
      process.env.CASHFREE_SECRET_KEY ||
      process.env.VITE_CASHFREE_SECRET_KEY;
    const environment =
      config?.environment ||
      process.env.CASHFREE_ENV ||
      process.env.VITE_CASHFREE_ENV ||
      'sandbox';
    const apiVersion = config?.apiVersion || '2023-08-01';

    if (!appId || !secretKey) {
      return res.status(400).json({
        error: 'Cashfree API credentials missing. Please configure App ID and Secret Key in Cashfree Settings.',
      });
    }

    const baseUrl =
      environment === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

    const headers: Record<string, string> = {
      'x-client-id': appId.trim(),
      'x-client-secret': secretKey.trim(),
      'x-api-version': apiVersion,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // 1. Create Order Session
    if (action === 'create-order') {
      if (!order || !order.orderAmount || !order.orderId) {
        return res.status(400).json({ error: 'Order ID and Amount are required.' });
      }

      // Sanitize phone number (must be 10 digits in India)
      let phone = (order.customerPhone || '').replace(/\D/g, '');
      if (phone.length > 10) phone = phone.slice(-10);
      if (phone.length < 10) phone = '9999999999';

      const payload = {
        order_id: String(order.orderId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 45),
        order_amount: Math.max(1, Math.round(Number(order.orderAmount) * 100) / 100),
        order_currency: order.orderCurrency || 'INR',
        customer_details: {
          customer_id: `cust_${String(phone).slice(-6)}_${Date.now() % 10000}`,
          customer_name: (order.customerName || 'Customer').trim().slice(0, 50),
          customer_email: (order.customerEmail || 'accounts@icsstore.in').trim(),
          customer_phone: phone,
        },
        order_note: (order.orderNote || 'Service Job Payment').slice(0, 200),
      };

      const cfRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const cfData = await cfRes.json();
      if (!cfRes.ok) {
        return res.status(cfRes.status).json({
          error: cfData.message || cfData.error || 'Failed to create Cashfree order.',
          details: cfData,
        });
      }

      return res.status(200).json({
        success: true,
        order_id: cfData.order_id,
        cf_order_id: cfData.cf_order_id,
        payment_session_id: cfData.payment_session_id,
        order_status: cfData.order_status,
        order_amount: cfData.order_amount,
        order_currency: cfData.order_currency,
      });
    }

    // 2. Verify Order & Check Payments
    if (action === 'verify-order') {
      if (!orderId) {
        return res.status(400).json({ error: 'orderId is required to verify status.' });
      }

      const sanitizedOrderId = String(orderId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 45);

      // Fetch order details
      const orderRes = await fetch(`${baseUrl}/orders/${sanitizedOrderId}`, {
        method: 'GET',
        headers,
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        return res.status(orderRes.status).json({
          error: orderData.message || 'Failed to fetch order status from Cashfree.',
          details: orderData,
        });
      }

      // Fetch payments for this order
      let payments = [];
      try {
        const payRes = await fetch(`${baseUrl}/orders/${sanitizedOrderId}/payments`, {
          method: 'GET',
          headers,
        });
        if (payRes.ok) {
          payments = await payRes.json();
        }
      } catch (err) {
        console.warn('Could not fetch order payments:', err);
      }

      return res.status(200).json({
        success: true,
        order_id: orderData.order_id,
        order_status: orderData.order_status,
        order_amount: orderData.order_amount,
        order_currency: orderData.order_currency,
        payments,
      });
    }

    // 3. Test Credentials
    if (action === 'test-credentials') {
      // Test by creating a small test order or listing orders
      const testRes = await fetch(`${baseUrl}/orders?limit=1`, {
        method: 'GET',
        headers,
      });

      if (testRes.status === 401 || testRes.status === 403) {
        return res.status(401).json({
          error: 'Authentication failed. Please verify your Cashfree App ID, Secret Key, and environment mode.',
        });
      }

      if (!testRes.ok) {
        const errData = await testRes.json().catch(() => ({}));
        return res.status(testRes.status).json({
          error: errData.message || 'Failed to verify Cashfree credentials.',
        });
      }

      return res.status(200).json({
        success: true,
        message: `Successfully connected to Cashfree Payment Gateway (${environment.toUpperCase()} mode)!`,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error: any) {
    console.error('[Cashfree API Handler Error]:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error while processing Cashfree request.',
    });
  }
}
