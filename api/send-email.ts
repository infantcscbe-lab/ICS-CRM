import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

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
    const { to, subject, html, text, pdfBase64, fileName, smtpConfig } = req.body || {};

    if (!to) {
      return res.status(400).json({ error: 'Recipient email address ("to") is required.' });
    }

    const host = smtpConfig?.host || process.env.SMTP_HOST || 'smtp.hostinger.com';
    const port = Number(smtpConfig?.port || process.env.SMTP_PORT || 465);
    const user = smtpConfig?.user || process.env.SMTP_USER || 'accounts@icsstore.in';
    const pass = smtpConfig?.pass || process.env.SMTP_PASS;

    if (!pass) {
      return res.status(400).json({
        error: 'SMTP password not provided. Please configure your email password in SMTP Settings or set SMTP_PASS environment variable.',
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for 587
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const mailOptions: any = {
      from: `"Infant Computer Store (ICS)" <${user}>`,
      to,
      replyTo: user,
      subject: subject || 'Infant Computer Store - Service Call Report',
      html: html || '<p>Please find attached your official Service Call Report.</p>',
      text: text || 'Please find attached your official Service Call Report from Infant Computer Store.',
      attachments: [],
    };

    if (pdfBase64) {
      mailOptions.attachments.push({
        filename: fileName || 'ICS-Service-Call-Report.pdf',
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf',
      });
    }

    const info = await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      message: `Email successfully sent from ${user} with PDF attachment!`,
    });
  } catch (error: any) {
    console.error('SMTP send error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to dispatch email via SMTP',
    });
  }
}
