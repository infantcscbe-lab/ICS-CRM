import React, { useState, useEffect } from 'react';
import type { Client, Profile, ClientPaymentHistory } from '@/types/database';
import { recordClientPayment, fetchClientPaymentHistory } from '@/lib/clientPayments';
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
  History,
  CreditCard,
  Receipt,
  ArrowRight,
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
  const [mode, setMode] = useState<UpdateMode>('deduct');
  const [amountInput, setAmountInput] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('Cash');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client past payment history tab/state
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<ClientPaymentHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const currentOutstanding = Number(client?.outstanding_amount || 0);

  useEffect(() => {
    if (client && isOpen) {
      // Default to deduct (payment received) if client has outstanding, else direct set
      setMode(currentOutstanding > 0 ? 'deduct' : 'set');
      setAmountInput('');
      setPaymentMode('Cash');
      setReferenceNo('');
      setNotes('');
      setError(null);
      setShowHistory(false);
      loadHistory(client.id);
    }
  }, [client, isOpen, currentOutstanding]);

  async function loadHistory(clientId: string) {
    setLoadingHistory(true);
    try {
      const records = await fetchClientPaymentHistory(clientId);
      setHistoryRecords(records);
    } catch (err) {
      console.error('Failed to load client payment history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

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

    if (mode !== 'set' && val === 0) {
      setError('Please enter an amount greater than zero.');
      return;
    }

    setLoading(true);
    try {
      const updaterName = currentUser?.full_name || 'Admin';

      let combinedNotes = notes.trim();
      if (referenceNo.trim()) {
        combinedNotes = `[Ref: ${referenceNo.trim()}] ${combinedNotes}`.trim();
      }

      const { updatedClient } = await recordClientPayment({
        client,
        amount: val,
        mode,
        paymentMethod: mode === 'deduct' ? paymentMode : 'Direct Adjustment',
        notes: combinedNotes,
        recordedBy: updaterName,
        receiptNo: referenceNo.trim() || undefined,
      });

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-4 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30 shadow-inner">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Client Outstanding & Payments</h2>
              <p className="text-xs text-slate-300">Record received payment, charges, or adjust dues</p>
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
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Balance</span>
            <p className={`text-base font-black ${currentOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              ₹{currentOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Toggle between Update Form and Payment History */}
        <div className="flex border-b border-slate-200 bg-slate-100 px-5 pt-2 gap-2 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setShowHistory(false)}
            className={`pb-2 px-3 border-b-2 transition ${
              !showHistory
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Update Balance / Payment
          </button>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className={`flex items-center gap-1 pb-2 px-3 border-b-2 transition ${
              showHistory
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Payment History ({historyRecords.length})</span>
          </button>
        </div>

        {showHistory ? (
          /* Payment History View */
          <div className="p-5 overflow-y-auto flex-1 space-y-3">
            {loadingHistory ? (
              <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span>Loading transaction ledger...</span>
              </div>
            ) : historyRecords.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <Receipt className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-600">No payment history recorded yet.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Transactions recorded through this modal will appear here with previous & new balance calculations.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {historyRecords.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs space-y-1.5 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                            r.type === 'payment'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.type === 'charge'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {r.type === 'payment' ? 'Payment (-)' : r.type === 'charge' ? 'Due Added (+)' : 'Settled'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 font-semibold">
                          {r.receipt_no || r.id.slice(0, 8)}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {new Date(r.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    {/* Math breakdown row */}
                    <div className="rounded-lg bg-white p-2 border border-slate-200 flex items-center justify-between font-mono">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-slate-500">₹{r.previous_outstanding.toLocaleString('en-IN')}</span>
                        <span className="text-slate-400">{r.type === 'charge' ? '+' : '-'}</span>
                        <span className="font-bold text-emerald-700">₹{r.amount_paid.toLocaleString('en-IN')}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="font-bold text-slate-900">₹{r.current_outstanding.toLocaleString('en-IN')}</span>
                      </div>
                      <span className="text-[10px] font-sans font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        {r.payment_mode || 'Cash'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{r.notes || 'No remarks'}</span>
                      <span className="text-slate-400">By: {r.recorded_by || 'Admin'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
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
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="outstanding-amount-input" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {mode === 'deduct'
                    ? 'Payment Received Amount (₹)'
                    : mode === 'add'
                    ? 'Additional Charge / Due (₹)'
                    : 'Total Outstanding Balance (₹)'}
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
                  placeholder="e.g. 500.00"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-4 text-base font-bold text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Mathematical Calculation Live Box: e.g. 2000 - 500 = 1500 */}
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/70 via-white to-blue-50/40 p-3.5 space-y-2 text-xs shadow-xs">
              <div className="flex items-center justify-between text-slate-600 font-medium">
                <span>Calculation Breakdown:</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Live Preview</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 pt-2 font-mono">
                <div className="flex items-center gap-2">
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-sans text-slate-400 block">Previous</span>
                    <span className="font-bold text-slate-700 text-sm">
                      ₹{currentOutstanding.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <span className="text-base font-bold text-slate-400">
                    {mode === 'deduct' ? '−' : mode === 'add' ? '+' : '→'}
                  </span>

                  <div className="text-center">
                    <span className="text-[10px] uppercase font-sans text-slate-400 block">
                      {mode === 'deduct' ? 'Paid' : mode === 'add' ? 'Added' : 'Set'}
                    </span>
                    <span className="font-bold text-emerald-600 text-sm">
                      ₹{parsedInput.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <span className="text-base font-bold text-slate-400">=</span>

                  <div className="text-center">
                    <span className="text-[10px] uppercase font-sans text-slate-400 block">New Balance</span>
                    <span
                      className={`font-black text-sm px-2 py-0.5 rounded-lg ${
                        calculatedNewBalance === 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      ₹{calculatedNewBalance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                    {mode === 'deduct'
                      ? `₹${currentOutstanding} − ₹${parsedInput} = ₹${calculatedNewBalance}`
                      : mode === 'add'
                      ? `₹${currentOutstanding} + ₹${parsedInput} = ₹${calculatedNewBalance}`
                      : `Set to ₹${calculatedNewBalance}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Mode (for Deduct / Payment) */}
            {mode === 'deduct' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="payment-mode-select" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center gap-1">
                    <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                    <span>Payment Mode</span>
                  </label>
                  <select
                    id="payment-mode-select"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="Bank Transfer">Bank Transfer / NEFT / IMPS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online">Online Portal</option>
                    <option value="Adjustment">Direct Adjustment</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="reference-no-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5 text-slate-400" />
                    <span>Reference / Receipt #</span>
                  </label>
                  <input
                    id="reference-no-input"
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="e.g. UPI-984729 or Chq #0012"
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Notes / Reason */}
            <div>
              <label htmlFor="outstanding-notes-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                <span>Notes / Remarks</span>
              </label>
              <textarea
                id="outstanding-notes-input"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Partial cash payment received; AMC renewal installment; Invoice #277"
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
                    <span>Saving Transaction...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Confirm & Save</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
