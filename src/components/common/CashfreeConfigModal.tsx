import React, { useState, useEffect } from 'react';
import { CreditCard, Key, ShieldCheck, CheckCircle2, AlertCircle, Loader2, X, ExternalLink, RefreshCw } from 'lucide-react';
import { getSavedCashfreeConfig, saveCashfreeConfig, type CashfreeConfig } from '@/lib/cashfreeSettings';

interface CashfreeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (config: CashfreeConfig) => void;
}

export const CashfreeConfigModal: React.FC<CashfreeConfigModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [config, setConfig] = useState<CashfreeConfig>(getSavedCashfreeConfig());
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfig(getSavedCashfreeConfig());
      setStatusMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!config.appId.trim()) {
      setStatusMsg({ type: 'error', text: 'Cashfree App ID (Client ID) is required.' });
      return;
    }
    if (!config.secretKey.trim()) {
      setStatusMsg({ type: 'error', text: 'Cashfree Secret Key is required.' });
      return;
    }

    const saved = saveCashfreeConfig(config);
    setStatusMsg({ type: 'success', text: 'Cashfree API credentials successfully saved!' });
    if (onSaved) onSaved(saved);
    setTimeout(() => {
      onClose();
    }, 900);
  };

  const handleTestConnection = async () => {
    if (!config.appId.trim() || !config.secretKey.trim()) {
      setStatusMsg({ type: 'error', text: 'Please fill in both App ID and Secret Key before testing.' });
      return;
    }

    setTesting(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/cashfree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-credentials',
          config,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setStatusMsg({
          type: 'error',
          text: data.error || 'Connection failed. Please check your credentials and environment mode.',
        });
      } else {
        setStatusMsg({
          type: 'success',
          text: data.message || `Cashfree connected successfully in ${config.environment.toUpperCase()} mode!`,
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Network error while contacting Cashfree gateway.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Cashfree Gateway Settings
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  config.environment === 'production'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {config.environment}
                </span>
              </h2>
              <p className="text-xs text-slate-400">Configure online payment gateway for instant customer collection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status Message */}
          {statusMsg && (
            <div
              className={`flex items-start gap-2.5 rounded-xl p-3 text-xs font-semibold ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-red-50 text-red-900 border border-red-200'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span className="flex-1">{statusMsg.text}</span>
            </div>
          )}

          {/* Environment Mode Switch */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Environment Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, environment: 'sandbox' })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  config.environment === 'sandbox'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>🧪 Sandbox (Test Mode)</span>
              </button>
              <button
                type="button"
                onClick={() => setConfig({ ...config, environment: 'production' })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  config.environment === 'production'
                    ? 'border-emerald-600 bg-emerald-50/80 text-emerald-800 shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>🚀 Production (Live Mode)</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Use Sandbox to test with dummy UPI/Cards. Switch to Production for real customer transactions.
            </p>
          </div>

          {/* App ID */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-indigo-600" /> Cashfree App ID (Client ID)
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Required</span>
            </label>
            <input
              type="text"
              value={config.appId}
              onChange={(e) => setConfig({ ...config, appId: e.target.value.trim() })}
              placeholder={config.environment === 'production' ? 'e.g. 123456abcdef...' : 'e.g. TEST10123...'}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Secret Key */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" /> Cashfree Secret Key (Client Secret)
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Required</span>
            </label>
            <input
              type="password"
              value={config.secretKey}
              onChange={(e) => setConfig({ ...config, secretKey: e.target.value.trim() })}
              placeholder="Paste Cashfree Secret Key..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Info Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>Where to find your Cashfree credentials?</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              1. Log in to your <a href="https://merchant.cashfree.com/merchants/login" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-semibold inline-flex items-center gap-0.5">Cashfree Merchant Dashboard <ExternalLink className="h-2.5 w-2.5" /></a>.<br/>
              2. Navigate to <strong>Payment Gateway &rarr; Developers &rarr; API Keys</strong>.<br/>
              3. Generate and copy your <strong>App ID</strong> & <strong>Secret Key</strong> for Sandbox or Production.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !config.appId.trim() || !config.secretKey.trim()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-xs disabled:opacity-50"
          >
            {testing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
                <span>Test Connection</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-2 text-xs font-bold text-white shadow-sm hover:from-indigo-700 hover:to-indigo-800 transition"
            >
              Save Credentials
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
