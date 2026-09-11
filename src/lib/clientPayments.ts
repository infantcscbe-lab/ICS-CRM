import { supabase } from './supabase';
import type { Client, ClientPaymentHistory, PaymentMethod, PaymentTransactionType } from '@/types/database';

const LOCAL_STORAGE_PAYMENT_HISTORY_KEY = 'ics_client_payment_history_cache';

export function getLocalPaymentHistory(): ClientPaymentHistory[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PAYMENT_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read local payment history:', err);
    return [];
  }
}

export function saveLocalPaymentHistory(history: ClientPaymentHistory[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_PAYMENT_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to save local payment history:', err);
  }
}

export function generatePaymentReceiptNo(): string {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `REC-${yearMonth}-${randomSuffix}`;
}

/**
 * Fetch payment transaction history for a specific client or across all clients.
 * Combines remote Supabase records with local cache fallback for offline/resilience.
 */
export async function fetchClientPaymentHistory(clientId?: string): Promise<ClientPaymentHistory[]> {
  let remoteRecords: ClientPaymentHistory[] = [];

  try {
    let query = supabase
      .from('client_payment_history')
      .select('*, client:clients(*), job:service_jobs(*)')
      .order('created_at', { ascending: false });

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;
    if (!error && data) {
      remoteRecords = data as unknown as ClientPaymentHistory[];
    }
  } catch (err) {
    console.warn('Could not query client_payment_history table, using local cache fallback:', err);
  }

  // Merge remote records with local cache
  const localRecords = getLocalPaymentHistory();
  const map = new Map<string, ClientPaymentHistory>();

  // Add remote first
  remoteRecords.forEach((r) => map.set(r.id, r));

  // Add any local records not present remotely
  localRecords.forEach((r) => {
    if (!map.has(r.id)) {
      if (!clientId || r.client_id === clientId) {
        map.set(r.id, r);
      }
    }
  });

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Update local cache
  saveLocalPaymentHistory(merged);

  return clientId ? merged.filter((r) => r.client_id === clientId) : merged;
}

export interface RecordPaymentParams {
  client: Client;
  amount: number;
  mode: 'set' | 'add' | 'deduct';
  paymentMethod?: PaymentMethod | string;
  notes?: string;
  recordedBy?: string;
  jobId?: string | null;
  receiptNo?: string;
  createdAt?: string;
}

/**
 * Record a payment, additional charge, or balance reset.
 * Calculates previous_outstanding, amount_paid, and current_outstanding.
 * E.g., Previous ₹2,000 - Payment ₹500 = Outstanding ₹1,500.
 * Updates the clients table and logs an audit record to client_payment_history.
 */
export async function recordClientPayment({
  client,
  amount,
  mode,
  paymentMethod = 'Cash',
  notes = '',
  recordedBy = 'Admin',
  jobId = null,
  receiptNo,
  createdAt = new Date().toISOString(),
}: RecordPaymentParams): Promise<{ updatedClient: Client; record: ClientPaymentHistory }> {
  const currentOutstanding = Number(client.outstanding_amount || 0);
  const parsedAmount = Math.max(0, Math.round(Number(amount) * 100) / 100);

  let newBalance = currentOutstanding;
  let transactionType: PaymentTransactionType = 'payment';
  let transactionAmount = parsedAmount;

  if (mode === 'deduct') {
    // Payment received (-)
    transactionType = 'payment';
    newBalance = Math.max(0, currentOutstanding - parsedAmount);
    transactionAmount = parsedAmount;
  } else if (mode === 'add') {
    // Additional charge (+)
    transactionType = 'charge';
    newBalance = Math.max(0, currentOutstanding + parsedAmount);
    transactionAmount = parsedAmount;
  } else if (mode === 'set') {
    // Direct set
    newBalance = Math.max(0, parsedAmount);
    if (parsedAmount === 0 && currentOutstanding > 0) {
      transactionType = 'settlement';
      transactionAmount = currentOutstanding;
    } else {
      transactionType = 'adjustment';
      transactionAmount = Math.abs(currentOutstanding - parsedAmount);
    }
  }

  const finalNewBalance = Math.round(newBalance * 100) / 100;
  const finalReceiptNo = receiptNo || generatePaymentReceiptNo();
  const trimmedNotes = notes.trim();

  // Create payment history record object
  const paymentRecord: ClientPaymentHistory = {
    id: crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    client_id: client.id,
    job_id: jobId,
    type: transactionType,
    previous_outstanding: currentOutstanding,
    amount_paid: transactionAmount,
    current_outstanding: finalNewBalance,
    payment_mode: paymentMethod,
    receipt_no: finalReceiptNo,
    notes: trimmedNotes,
    recorded_by: recordedBy,
    created_at: createdAt,
    client: client,
  };

  // 1. Update clients table
  const clientUpdates = {
    outstanding_amount: finalNewBalance,
    outstanding_notes: trimmedNotes || client.outstanding_notes || '',
    outstanding_updated_at: createdAt,
    outstanding_updated_by: recordedBy,
    updated_at: createdAt,
  };

  try {
    const { error: clientErr } = await supabase
      .from('clients')
      .update(clientUpdates)
      .eq('id', client.id);

    if (clientErr) {
      console.warn('Error updating client outstanding in Supabase:', clientErr.message);
    }
  } catch (err) {
    console.error('Failed to update client table:', err);
  }

  // 2. Insert into client_payment_history table
  try {
    const { error: histErr } = await supabase.from('client_payment_history').insert({
      id: paymentRecord.id,
      client_id: paymentRecord.client_id,
      job_id: paymentRecord.job_id,
      type: paymentRecord.type,
      previous_outstanding: paymentRecord.previous_outstanding,
      amount_paid: paymentRecord.amount_paid,
      current_outstanding: paymentRecord.current_outstanding,
      payment_mode: paymentRecord.payment_mode,
      receipt_no: paymentRecord.receipt_no,
      notes: paymentRecord.notes,
      recorded_by: paymentRecord.recorded_by,
      created_at: paymentRecord.created_at,
    });

    if (histErr) {
      console.warn('Supabase insert client_payment_history failed, saving to local cache:', histErr.message);
    }
  } catch (err) {
    console.warn('Could not insert to remote payment history, caching locally:', err);
  }

  // 3. Update local cache
  const local = getLocalPaymentHistory();
  saveLocalPaymentHistory([paymentRecord, ...local.filter((r) => r.id !== paymentRecord.id)]);

  // 4. Dispatch browser event so any listening UI (Admin, Client, Engineer) updates immediately
  window.dispatchEvent(
    new CustomEvent('client_payment_recorded', {
      detail: { client_id: client.id, record: paymentRecord, updatedBalance: finalNewBalance },
    })
  );

  const updatedClient: Client = {
    ...client,
    ...clientUpdates,
  };

  return { updatedClient, record: paymentRecord };
}

/**
 * Generate CSV statement of payment transactions.
 */
export function exportPaymentHistoryCsv(records: ClientPaymentHistory[], titlePrefix = 'Payment_History'): void {
  const headers = [
    'Receipt No',
    'Date & Time',
    'Client Name',
    'Transaction Type',
    'Previous Outstanding (INR)',
    'Amount (INR)',
    'Remaining Outstanding (INR)',
    'Breakdown Calculation',
    'Payment Mode',
    'Recorded By',
    'Notes / Remarks',
  ];

  const rows = records.map((r) => {
    const cName = r.client?.client_name || r.client?.company_name || 'Client';
    const dateFormatted = new Date(r.created_at).toLocaleString('en-IN');
    const typeLabel =
      r.type === 'payment'
        ? 'Payment Received (-)'
        : r.type === 'charge'
        ? 'Additional Due (+)'
        : r.type === 'settlement'
        ? 'Settlement / Cleared'
        : 'Balance Adjustment';

    const calculationStr =
      r.type === 'payment'
        ? `₹${r.previous_outstanding} - ₹${r.amount_paid} = ₹${r.current_outstanding}`
        : r.type === 'charge'
        ? `₹${r.previous_outstanding} + ₹${r.amount_paid} = ₹${r.current_outstanding}`
        : `₹${r.current_outstanding}`;

    return [
      r.receipt_no || r.id.slice(0, 8),
      dateFormatted,
      cName,
      typeLabel,
      r.previous_outstanding.toFixed(2),
      r.amount_paid.toFixed(2),
      r.current_outstanding.toFixed(2),
      calculationStr,
      r.payment_mode || 'Cash',
      r.recorded_by || 'Admin',
      r.notes || '',
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${titlePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Open a printable statement window with official ICS branding.
 */
export function printPaymentHistoryReport(records: ClientPaymentHistory[], client?: Client | null): void {
  const clientName = client?.company_name || client?.client_name || 'All Clients';
  const totalPaid = records
    .filter((r) => r.type === 'payment' || r.type === 'settlement')
    .reduce((sum, r) => sum + Number(r.amount_paid || 0), 0);
  const currentOutstanding = client ? Number(client.outstanding_amount || 0) : 0;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>ICS Payment History & Outstanding Statement - ${clientName}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 24px; color: #1e293b; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 20px; }
          .logo-title { font-size: 22px; font-weight: 800; color: #0369a1; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .kpi-container { display: flex; gap: 16px; margin-bottom: 24px; }
          .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
          .kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; }
          .kpi-val { font-size: 18px; font-weight: 800; margin-top: 4px; color: #0f172a; }
          .kpi-val.green { color: #15803d; }
          .kpi-val.red { color: #b91c1c; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
          th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .formula-badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-family: monospace; }
          .amount-paid { font-weight: 700; color: #16a34a; }
          .amount-due { font-weight: 700; color: #dc2626; }
          .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
          @media print {
            body { margin: 10mm; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-title">ICS SERVICE MANAGER</div>
            <div class="subtitle">Client Outstanding Receivables & Payment Ledger</div>
            <div style="margin-top: 8px; font-size: 13px;">
              <strong>Client:</strong> ${clientName} ${client?.phone ? `• Tel: ${client.phone}` : ''} ${client?.city ? `• ${client.city}` : ''}
            </div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #64748b;">
            <div><strong>Statement Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div><strong>Records:</strong> ${records.length} Transactions</div>
          </div>
        </div>

        <div class="kpi-container">
          <div class="kpi-card">
            <div class="kpi-label">Current Outstanding Balance</div>
            <div class="kpi-val ${currentOutstanding > 0 ? 'red' : 'green'}">
              ₹${currentOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Payments Received</div>
            <div class="kpi-val green">
              ₹${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Recorded Transactions</div>
            <div class="kpi-val">${records.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Receipt / ID</th>
              <th>Date & Time</th>
              <th>Action / Type</th>
              <th>Previous Due</th>
              <th>Amount Paid (-)</th>
              <th>Outstanding Left</th>
              <th>Calculation Breakdown</th>
              <th>Mode</th>
              <th>Recorded By</th>
              <th>Notes / Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${
              records.length === 0
                ? '<tr><td colspan="10" style="text-align:center; padding: 24px; color: #94a3b8;">No payment records recorded yet.</td></tr>'
                : records
                    .map((r) => {
                      const typeLabel =
                        r.type === 'payment'
                          ? '<span style="color:#15803d; font-weight:700;">Payment (-)</span>'
                          : r.type === 'charge'
                          ? '<span style="color:#b91c1c; font-weight:700;">Additional Due (+)</span>'
                          : r.type === 'settlement'
                          ? '<span style="color:#0284c7; font-weight:700;">Settlement</span>'
                          : '<span style="color:#475569;">Adjustment</span>';

                      const breakdown =
                        r.type === 'payment'
                          ? `₹${r.previous_outstanding.toLocaleString('en-IN')} - ₹${r.amount_paid.toLocaleString('en-IN')} = ₹${r.current_outstanding.toLocaleString('en-IN')}`
                          : r.type === 'charge'
                          ? `₹${r.previous_outstanding.toLocaleString('en-IN')} + ₹${r.amount_paid.toLocaleString('en-IN')} = ₹${r.current_outstanding.toLocaleString('en-IN')}`
                          : `₹${r.current_outstanding.toLocaleString('en-IN')}`;

                      return `
                        <tr>
                          <td><strong>${r.receipt_no || r.id.slice(0, 8)}</strong></td>
                          <td>${new Date(r.created_at).toLocaleDateString('en-IN')} ${new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td>${typeLabel}</td>
                          <td>₹${r.previous_outstanding.toLocaleString('en-IN')}</td>
                          <td class="amount-paid">₹${r.amount_paid.toLocaleString('en-IN')}</td>
                          <td class="amount-due">₹${r.current_outstanding.toLocaleString('en-IN')}</td>
                          <td><span class="formula-badge">${breakdown}</span></td>
                          <td>${r.payment_mode || 'Cash'}</td>
                          <td>${r.recorded_by || 'Admin'}</td>
                          <td style="color:#475569;">${r.notes || '—'}</td>
                        </tr>
                      `;
                    })
                    .join('')
            }
          </tbody>
        </table>

        <div class="footer">
          <div>ICS Service Manager • Official Accounts & Receivables Record</div>
          <div>Page Generated On ${new Date().toLocaleString('en-IN')}</div>
        </div>
      </body>
    </html>
  `;

  const printWin = window.open('', '_blank');
  if (printWin) {
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => printWin.print(), 350);
  }
}
