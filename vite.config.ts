import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

function localEmailPlugin() {
  return {
    name: 'local-email-api',
    configureServer(server: any) {
      server.middlewares.use('/api/send-email', async (req: any, res: any) => {
        // CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const nodemailerModule = await import('nodemailer');
            const nodemailer = nodemailerModule.default || nodemailerModule;

            const host = data.smtpConfig?.host || process.env.SMTP_HOST || 'smtp.hostinger.com';
            const port = Number(data.smtpConfig?.port || process.env.SMTP_PORT || 465);
            const user = data.smtpConfig?.user || process.env.SMTP_USER || 'accounts@icsstore.in';
            const pass = data.smtpConfig?.pass || process.env.SMTP_PASS;

            if (!pass) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: 'SMTP password not configured. Please enter password in SMTP Settings modal.',
                })
              );
              return;
            }

            const transporter = nodemailer.createTransport({
              host,
              port,
              secure: port === 465,
              auth: { user, pass },
              tls: { rejectUnauthorized: false },
            });

            const mailOptions: any = {
              from: `"Infant Computer Store (ICS)" <${user}>`,
              to: data.to,
              replyTo: user,
              subject: data.subject || 'Infant Computer Store - Service Call Report',
              html: data.html,
              attachments: data.pdfBase64
                ? [
                    {
                      filename: data.fileName || 'ICS-Service-Call-Report.pdf',
                      content: Buffer.from(data.pdfBase64, 'base64'),
                      contentType: 'application/pdf',
                    },
                  ]
                : [],
            };

            const info = await transporter.sendMail(mailOptions);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: true,
                messageId: info.messageId,
                message: `Email successfully sent from ${user} with PDF attached!`,
              })
            );
          } catch (err: any) {
            console.error('[Vite Local Email Plugin Error]:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Failed to dispatch email' }));
          }
        });
      });
    },
  };
}

function localCashfreePlugin() {
  return {
    name: 'local-cashfree-api',
    configureServer(server: any) {
      server.middlewares.use('/api/cashfree', async (req: any, res: any) => {
        // CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const { action, config, order, orderId } = data;

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
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: 'Cashfree API credentials missing. Please configure App ID and Secret Key in Cashfree Settings.',
                })
              );
              return;
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

            if (action === 'create-order') {
              let phone = (order?.customerPhone || '').replace(/\D/g, '');
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
              res.statusCode = cfRes.status;
              res.setHeader('Content-Type', 'application/json');
              if (!cfRes.ok) {
                res.end(
                  JSON.stringify({
                    error: cfData.message || cfData.error || 'Failed to create Cashfree order.',
                    details: cfData,
                  })
                );
                return;
              }

              res.end(
                JSON.stringify({
                  success: true,
                  order_id: cfData.order_id,
                  cf_order_id: cfData.cf_order_id,
                  payment_session_id: cfData.payment_session_id,
                  order_status: cfData.order_status,
                  order_amount: cfData.order_amount,
                  order_currency: cfData.order_currency,
                })
              );
              return;
            }

            if (action === 'verify-order') {
              const sanitizedOrderId = String(orderId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 45);
              const orderRes = await fetch(`${baseUrl}/orders/${sanitizedOrderId}`, {
                method: 'GET',
                headers,
              });
              const orderData = await orderRes.json();

              let payments = [];
              try {
                const payRes = await fetch(`${baseUrl}/orders/${sanitizedOrderId}/payments`, {
                  method: 'GET',
                  headers,
                });
                if (payRes.ok) {
                  payments = await payRes.json();
                }
              } catch {}

              res.statusCode = orderRes.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: orderRes.ok,
                  order_id: orderData.order_id,
                  order_status: orderData.order_status,
                  order_amount: orderData.order_amount,
                  order_currency: orderData.order_currency,
                  payments,
                })
              );
              return;
            }

            if (action === 'test-credentials') {
              const testRes = await fetch(`${baseUrl}/orders?limit=1`, {
                method: 'GET',
                headers,
              });
              res.statusCode = testRes.ok ? 200 : testRes.status;
              res.setHeader('Content-Type', 'application/json');
              if (testRes.status === 401 || testRes.status === 403) {
                res.end(
                  JSON.stringify({
                    error: 'Authentication failed. Please verify your Cashfree App ID, Secret Key, and environment.',
                  })
                );
                return;
              }
              res.end(
                JSON.stringify({
                  success: true,
                  message: `Successfully connected to Cashfree Payment Gateway (${environment.toUpperCase()} mode)!`,
                })
              );
              return;
            }

            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
          } catch (err: any) {
            console.error('[Vite Local Cashfree Plugin Error]:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Failed to communicate with Cashfree' }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localEmailPlugin(), localCashfreePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
