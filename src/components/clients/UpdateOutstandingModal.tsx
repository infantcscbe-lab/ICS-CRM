import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client, Profile } from '@/types/database';
import {
  X,
  IndianRupee,
  PlusCircle,
  MinusCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Phone,
  FileText,
} from 'lucide-react';

interface UpdateOutstandingModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedClient: Client) => void;
  currentUser?: Profile | null;
}

type UpdateMode = 'set' | 'add' | 'deduct';

export function UpdateOutstandingModal({
  client,
  isOpen,
  onClose,
  onSuccess,
  currentUser,
}: UpdateOutstandingModalProps) {
  const [mode, setMode] = useState<UpdateMode>('set');
  const [amountInput, setAmountInput] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentOutstanding = Number(client?.outstanding_amount || 0);

  useEffect(() => {
    if (client && isOpen) {
      setMode('set');
      setAmountInput(currentOutstanding > 0 ? String(currentOutstanding) : '');
      setNotes(client.outstanding_notes || '');
      setError(null);
    }
  }, [client, isOpen]);

  if (!isOpen || !client) return null;

  const parsedInput = parseFloat(amountInput) || 0;

  // Calculate prospective new balance
  let calculatedNewBalance = currentOutstanding;
  if (mode === 'set') {
    calculatedNewBalance = Math.max(0, parsedInput);
  } else if (mode === 'add') {
    calculatedNewBalance = Math.max(0, currentOutstanding + parsedInput);
  } else if (mode === 'deduct') {
    calculatedNewBalance = Math.max(0, currentOutstanding - parsedInput);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setError(null);

    const val = parseFloat(amountInput);
    if (isNaN(val) || val < 0) {
      setError('Please enter a valid non-negative amount.');
      return;
    }

    setLoading(true);
    try {
      const updaterName = currentUser?.full_name || 'Admin';
      const now = new Date().toISOString();
      const finalAmount = Math.round(calculatedNewBalance * 100) / 100;
      const finalNotes = notes.trim();

      const updatePayload = {
        outstanding_amount: finalAmount,
        outstanding_notes: finalNotes,
        outstanding_updated_at: now,
        outstanding_updated_by: updaterName,
        updated_at: now,
      };

      const { error: dbErr } = await supabase
        .from('clients')
        .update(updatePayload)
        .eq('id', client.id);

      if (dbErr) {
        throw new Error(dbErr.message);
      }

      const updatedClient: Client = {
        ...client,
        outstanding_amount: finalAmount,
        outstanding_notes: finalNotes,
        outstanding_updated_at: now,
        outstanding_updated_by: updaterName,
      };

      onSuccess(updatedClient);
      onClose();
    } catch (err) {
      console.error('Failed to update outstanding:', err);
      setError(err instanceof Error ? err.message : 'Failed to update outstanding balance.');
    } finally {
      setLoading(false);
    }
  }

  function handleQuickClear() {
    setMode('set');
    setAmountInput('0');
    setNotes((prev) => (prev ? `${prev} (Cleared on ${new Date().toLocaleDateString()})` : 'Settled / Cleared'));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Update Client Outstanding</h2>
              <p className="text-xs text-slate-300">Set balance or record adjustments & payments</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Client Summary Strip */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
              <Building2 className="h-4 w-4 text-slate-500" />
              <span>{client.client_name}</span>
            </div>
            {client.company_name && (
              <p className="text-xs text-slate-500 ml-5">{client.company_name}</p>
            )}
            {client.phone && (
              <p className="text-xs text-slate-500 ml-5 flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" /> {client.phone}
              </p>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Dues</span>
            <p className={`text-base font-black ${currentOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              ₹{currentOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Mode Selector Tabs */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Action Type
            </label>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('set');
                  setAmountInput(String(currentOutstanding));
                }}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
                  mode === 'set'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Set Direct</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('add');
                  setAmountInput('');
                }}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
                  mode === 'add'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Add Due (+)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('deduct');
                  setAmountInput('');
                }}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
                  mode === 'deduct'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MinusCircle className="h-3.5 w-3.5" />
                <span>Payment (-)</span>
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="outstanding-amount-input" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {mode === 'set'
                  ? 'Total Outstanding Balance (₹)'
                  : mode === 'add'
                  ? 'Additional Charge / Due (₹)'
                  : 'Payment Received / Deduction (₹)'}
              </label>
              {currentOutstanding > 0 && (
                <button
                  type="button"
                  onClick={handleQuickClear}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> Quick Clear (₹0)
                </button>
              )}
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">₹</span>
              <input
                id="outstanding-amount-input"
                type="number"
                step="0.01"
                min="0"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-4 text-base font-bold text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Live Calculated Result Callout */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 font-medium">Resulting Outstanding:</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {mode === 'set' && `Set directly to ₹${calculatedNewBalance.toFixed(2)}`}
                {mode === 'add' && `₹${currentOutstanding} + ₹${parsedInput} = ₹${calculatedNewBalance.toFixed(2)}`}
                {mode === 'deduct' && `₹${currentOutstanding} - ₹${parsedInput} = ₹${calculatedNewBalance.toFixed(2)}`}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`inline-block text-base font-black px-2 py-0.5 rounded-lg ${
                  calculatedNewBalance === 0
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                ₹{calculatedNewBalance.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Notes / Reason */}
          <div>
            <label htmlFor="outstanding-notes-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <span>Notes / Reason for Outstanding / Payment terms</span>
            </label>
            <textarea
              id="outstanding-notes-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Previous service invoice #102 unpaid; AMC renewal due; or Cash ₹1,000 received on site"
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Save Outstanding</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
