import React, { useState, useEffect } from 'react';
import { Mail, Key, Server, Lock, CheckCircle2, AlertCircle, Loader2, X, Send } from 'lucide-react';
import { getSavedSmtpConfig, saveSmtpConfig, type SmtpConfig } from '@/lib/smtpSettings';

interface SmtpConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (config: SmtpConfig) => void;
}

export const SmtpConfigModal: React.FC<SmtpConfigModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [config, setConfig] = useState<SmtpConfig>(getSavedSmtpConfig());
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfig(getSavedSmtpConfig());
      setStatusMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!config.pass) {
      setStatusMsg({ type: 'error', text: 'Please enter the email password for accounts@icsstore.in' });
      return;
    }
    const saved = saveSmtpConfig(config);
    setStatusMsg({ type: 'success', text: 'SMTP Settings successfully saved!' });
    if (onSaved) onSaved(saved);
    setTimeout(() => {
      onClose();
    }, 900);
  };

  const handleTestConnection = async () => {
    if (!config.pass) {
      setStatusMsg({ type: 'error', text: 'Please enter the password first before testing.' });
      return;
    }
    const recipient = testEmail.trim() || config.user;
    setTesting(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject: 'ICS Email System - Connection Test',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #0f172a; margin-top: 0;">Infant Computer Store (ICS) - Test Email</h2>
              <p style="color: #334155; font-size: 14px;">This is a verification email to confirm that your custom email sender <strong>${config.user}</strong> is working properly via SMTP.</p>
              <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 12px; color: #475569;">
                <strong>Server:</strong> ${config.host}:${config.port}<br/>
                <strong>Sender:</strong> ${config.user}<br/>
                <strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN')}
              </div>
            </div>
          `,
          text: `ICS Connection Test: Email successfully verified for ${config.user}`,
          smtpConfig: config,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({
          type: 'success',
          text: `Success! Test email delivered to ${recipient}. Credentials are valid.`,
        });
        saveSmtpConfig(config);
      } else {
        setStatusMsg({
          type: 'error',
          text: data.error || 'Failed to authenticate with SMTP server. Please check password.',
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Error communicating with email dispatch server.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-blue-950 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-600/30 p-2 text-blue-400 border border-blue-400/30">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Sender Email & SMTP Settings</h3>
              <p className="text-xs text-slate-300">
                Official ICS Mail: <strong className="text-blue-300">accounts@icsstore.in</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-3.5 text-xs text-blue-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span>✉️ Send Call Report PDFs directly to Customers</span>
            </p>
            <p className="text-slate-600">
              Customer emails and PDF attachments will be sent directly from{' '}
              <strong className="text-slate-900">accounts@icsstore.in</strong> (Hostinger Mail Server).
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Sender Email (From)
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={config.user}
                  onChange={(e) => setConfig({ ...config, user: e.target.value.trim() })}
                  placeholder="accounts@icsstore.in"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Email Password *</span>
                <span className="text-[11px] font-normal text-slate-500">Hostinger Mailbox Password</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  value={config.pass}
                  onChange={(e) => setConfig({ ...config, pass: e.target.value })}
                  placeholder="Enter password for accounts@icsstore.in"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:border-blue-600 outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Password is stored in your secure session to authenticate outgoing emails with Hostinger.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  SMTP Host
                </label>
                <div className="relative">
                  <Server className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={config.host}
                    onChange={(e) => setConfig({ ...config, host: e.target.value.trim() })}
                    placeholder="smtp.hostinger.com"
                    className="w-full pl-8 pr-2 py-2 rounded-lg border border-slate-200 text-xs font-mono text-slate-700 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })}
                  placeholder="465"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono text-slate-700 outline-none"
                />
              </div>
            </div>

            {/* Test Email Section */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Test Connection (Optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="Recipient for test email (e.g. your email)"
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 outline-none"
                />
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span>{testing ? 'Testing...' : 'Test Send'}</span>
                </button>
              </div>
            </div>

            {statusMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                  statusMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{statusMsg.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-md flex items-center gap-1.5"
          >
            <Key className="h-3.5 w-3.5" />
            <span>Save & Apply Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
