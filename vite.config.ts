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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localEmailPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
