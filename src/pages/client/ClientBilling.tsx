import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { ServiceJob, Profile, Client, ClientPaymentHistory } from '@/types/database';
import { fetchClientPaymentHistory, exportPaymentHistoryCsv, printPaymentHistoryReport } from '@/lib/clientPayments';
import {
  ReceiptText,
  IndianRupee,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  Download,
  Printer,
  Search,
  RefreshCw,
  Eye,
  X,
  Building2,
  Phone,
  ShieldCheck,
  TrendingUp,
  Cpu,
  Wrench,
  FileSpreadsheet,
  AlertCircle,
  Layers,
  History,
  ArrowRight,
} from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';

export function ClientBilling() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<ClientPaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'paid' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Receipt Modal
  const [receiptJob, setReceiptJob] = useState<ServiceJob | null>(null);

  useEffect(() => {
    loadBillingData();

    const channel = supabase
      .channel('client-billing-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => {
        loadBillingData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        loadBillingData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_payment_history' }, () => {
        loadBillingData();
      })
      .subscribe();

    function handlePaymentRecorded() {
      loadBillingData();
    }
    window.addEventListener('client_payment_recorded', handlePaymentRecorded);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('client_payment_recorded', handlePaymentRecorded);
    };
  }, [profile?.client_id, profile?.phone, profile?.email]);

  async function loadBillingData() {
    try {
      // 1. Fetch client record
      let clientId = profile?.client_id;
      if (!clientId && (profile?.email || profile?.phone)) {
        try {
          const { data: matched } = await supabase
            .from('clients')
            .select('*')
            .or(`email.eq.${profile.email || ''},phone.eq.${profile.phone || ''}`)
            .maybeSingle();
          if (matched) {
            clientId = matched.id;
            setClient(matched as Client);
          }
        } catch {
          // ignore
        }
      } else if (clientId) {
        try {
          const { data: cData } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .maybeSingle();
          if (cData) setClient(cData as Client);
        } catch {
          // ignore
        }
      }

      // Fetch client payment transactions history
      if (clientId) {
        try {
          const hist = await fetchClientPaymentHistory(clientId);
          setPaymentHistory(hist);
        } catch (e) {
          console.error('Error fetching client payment history:', e);
        }
      }

      // 2. Fetch service jobs
      try {
        let query = supabase.from('service_jobs').select('*').order('created_at', { ascending: false });
        if (clientId) {
          query = query.eq('client_id', clientId);
        }
        const { data: jobData } = await query;
        if (jobData) {
          setJobs(jobData as ServiceJob[]);
        }
      } catch {
        // ignore
      }

      // 3. Fetch engineers
      try {
        const { data: engData } = await supabase.from('profiles').select('*').eq('role', 'engineer');
        if (engData) setEngineers(engData as Profile[]);
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
    }
  }

  // Normalized job billing calculations
  const billingRecords = useMemo(() => {
    return jobs.map((job) => {
      const isCovered = job.call_type === 'Warranty' || job.call_type === 'ASC';
      const inspection = isCovered ? 0 : (job.inspection_charge ?? 0);
      const service = isCovered ? 0 : (job.service_charge ?? 0);
      const parts = job.part_charge ?? 0;
      const totalAmount = inspection + service + parts;

      const isPaid =
        job.amount_received === 'Yes' ||
        (!job.amount_received &&
          totalAmount > 0 &&
          (job.status === 'completed' || job.status === 'solved'));

      const dateStr = job.completed_at || job.scheduled_date || job.created_at;
      const parsedDate = new Date(dateStr);
      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${month}`;
      const monthLabel = parsedDate.toLocaleString('default', { month: 'long', year: 'numeric' });

      const engineer = engineers.find((e) => e.id === job.engineer_id);

      return {
        job,
        id: job.id,
        jobNumber: job.job_number,
        title: job.issue_title,
        deviceId: job.device_id || job.issue_description?.match(/\[Device ID:\s*([^\]]+)\]/)?.[1] || 'General',
        callType: job.call_type || 'Per Call',
        status: job.status,
        date: dateStr.split('T')[0],
        monthKey,
        monthLabel,
        inspection,
        parts,
        service,
        totalAmount,
        isCovered,
        isPaid,
        amountPaid: isPaid ? totalAmount : 0,
        amountPending: !isPaid ? totalAmount : 0,
        paymentMode: job.payment_mode || 'Cash',
        workPerformed: job.work_performed,
        partsReplaced: job.parts_replaced,
        engineerName: engineer?.full_name || job.assigned_by_name || 'ICS Service Engineer',
        engineerPhone: engineer?.phone,
      };
    });
  }, [jobs, engineers]);

  // Overall calculations across all-time
  const overallMetrics = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalInspection = 0;
    let totalParts = 0;
    let totalService = 0;
    let paidCallsCount = 0;

    const currentYearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    let thisMonthPaid = 0;
    let thisMonthBilled = 0;

    billingRecords.forEach((r) => {
      totalBilled += r.totalAmount;
      totalPaid += r.amountPaid;
      totalPending += r.amountPending;
      totalInspection += r.inspection;
      totalParts += r.parts;
      totalService += r.service;

      if (r.isPaid && r.totalAmount > 0) {
        paidCallsCount++;
      }

      if (r.monthKey === currentYearMonth) {
        thisMonthBilled += r.totalAmount;
        thisMonthPaid += r.amountPaid;
      }
    });

    return {
      totalBilled,
      totalPaid,
      totalPending,
      totalInspection,
      totalParts,
      totalService,
      paidCallsCount,
      thisMonthBilled,
      thisMonthPaid,
    };
  }, [billingRecords]);

  // Monthly group aggregation
  const monthlyBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        totalBilled: number;
        totalPaid: number;
        totalPending: number;
        inspection: number;
        parts: number;
        service: number;
        callCount: number;
        paymentModes: Set<string>;
      }
    >();

    billingRecords.forEach((r) => {
      if (!map.has(r.monthKey)) {
        map.set(r.monthKey, {
          monthKey: r.monthKey,
          monthLabel: r.monthLabel,
          totalBilled: 0,
          totalPaid: 0,
          totalPending: 0,
          inspection: 0,
          parts: 0,
          service: 0,
          callCount: 0,
          paymentModes: new Set<string>(),
        });
      }

      const item = map.get(r.monthKey)!;
      item.totalBilled += r.totalAmount;
      item.totalPaid += r.amountPaid;
      item.totalPending += r.amountPending;
      item.inspection += r.inspection;
      item.parts += r.parts;
      item.service += r.service;
      item.callCount += 1;
      if (r.paymentMode) item.paymentModes.add(r.paymentMode);
    });

    // Sort descending by monthKey (e.g. 2026-09, 2026-08)
    return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [billingRecords]);

  // Available months list for filter dropdown
  const availableMonths = useMemo(() => {
    return monthlyBreakdown.map((m) => ({
      key: m.monthKey,
      label: m.monthLabel,
    }));
  }, [monthlyBreakdown]);

  // Filtered itemized records
  const filteredRecords = useMemo(() => {
    return billingRecords.filter((rec) => {
      if (selectedMonth !== 'all' && rec.monthKey !== selectedMonth) {
        return false;
      }
      if (selectedStatus === 'paid' && !rec.isPaid) {
        return false;
      }
      if (selectedStatus === 'pending' && rec.isPaid) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchJob = rec.jobNumber.toLowerCase().includes(q);
        const matchTitle = rec.title.toLowerCase().includes(q);
        const matchDevice = rec.deviceId.toLowerCase().includes(q);
        const matchMode = rec.paymentMode.toLowerCase().includes(q);
        if (!matchJob && !matchTitle && !matchDevice && !matchMode) {
          return false;
        }
      }
      return true;
    });
  }, [billingRecords, selectedMonth, selectedStatus, searchQuery]);

  // Export CSV function
  function exportCsvStatement() {
    const headers = [
      'Job Number',
      'Date',
      'Device ID',
      'Issue / Service Description',
      'Call Type',
      'Status',
      'Inspection Charge (INR)',
      'Spare Parts Charge (INR)',
      'Service Charge (INR)',
      'Total Amount (INR)',
      'Amount Paid (INR)',
      'Payment Mode',
      'Payment Status',
      'Engineer',
    ];

    const rows = filteredRecords.map((r) => [
      r.jobNumber,
      r.date,
      r.deviceId,
      r.title,
      r.callType,
      r.status,
      r.inspection,
      r.parts,
      r.service,
      r.totalAmount,
      r.amountPaid,
      r.paymentMode,
      r.isPaid ? 'PAID' : 'PENDING',
      r.engineerName,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const clientName = client?.company_name || profile?.company_name || 'ICS_Client';
    link.download = `${clientName.replace(/\s+/g, '_')}_Billing_Report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Print function
  function printStatement() {
    window.print();
  }

  const clientOutstanding = Number(client?.outstanding_amount || 0);
  const totalPendingDue = clientOutstanding > 0 ? clientOutstanding : overallMetrics.totalPending;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* ── Page Header ── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-0.5 text-xs font-bold text-blue-400 border border-blue-500/20 mb-2">
            <ReceiptText className="h-3.5 w-3.5" /> Financial & Charges Ledger
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Charges & Payments Report
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time tracking of overall and monthly amounts paid for machine calibration, repair, and service calls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadBillingData}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition shadow-sm"
            title="Refresh billing data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={exportCsvStatement}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-950/40 hover:border-emerald-500/40 transition shadow-sm"
            title="Export Excel / CSV Statement"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={printStatement}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition shadow-sm"
            title="Print statement"
          >
            <Printer className="h-3.5 w-3.5 text-slate-400" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* ── Client Outstanding Balance Alert Banner ── */}
      {(() => {
        const latestPayment = paymentHistory.find((p) => p.type === 'payment' || p.type === 'settlement');
        if (clientOutstanding <= 0 && !latestPayment) return null;

        return (
          <div className="mb-8 overflow-hidden rounded-3xl border border-red-500/50 bg-gradient-to-r from-red-950/80 via-slate-900 to-amber-950/50 p-5 sm:p-6 shadow-2xl backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 border border-red-500/40 shadow-inner">
                    <IndianRupee className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                        Account Outstanding Balance: ₹{clientOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </h2>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase border ${
                        clientOutstanding > 0
                          ? 'bg-red-500/20 text-red-400 border-red-500/40'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}>
                        {clientOutstanding > 0 ? 'Payment Due' : 'All Dues Cleared'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {client?.outstanding_notes ? (
                        <span><strong className="text-white">Admin Note:</strong> {client.outstanding_notes}</span>
                      ) : clientOutstanding > 0 ? (
                        'You have an unsettled outstanding balance on your service account. Please clear dues with our visiting service engineer or contact our office.'
                      ) : (
                        'All outstanding balances on your account have been fully settled.'
                      )}
                    </p>
                    {client?.outstanding_updated_at && (
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-amber-400" /> Last updated: {new Date(client.outstanding_updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {client.outstanding_updated_by && ` • Updated by ${client.outstanding_updated_by}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="tel:+919876543210"
                    className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/20 px-4 py-2 text-xs font-bold text-red-200 hover:bg-red-500/30 transition shadow-sm"
                  >
                    📞 Contact Accounts
                  </a>
                </div>
              </div>

              {/* Explicit Mathematical Calculation Breakdown: e.g. 2000 - 500 = 1500 */}
              {latestPayment && (
                <div className="rounded-2xl bg-black/40 border border-red-500/30 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex flex-wrap items-center gap-2 text-slate-300">
                    <span className="font-sans font-bold text-[11px] uppercase tracking-wider text-amber-400">
                      Recent Payment Breakdown:
                    </span>
                    <span className="text-slate-400">₹{latestPayment.previous_outstanding.toLocaleString('en-IN')} (Prev)</span>
                    <span className="text-red-400 font-bold">−</span>
                    <span className="font-bold text-emerald-400">₹{latestPayment.amount_paid.toLocaleString('en-IN')} (Paid)</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                    <span className="font-black text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      ₹{clientOutstanding.toLocaleString('en-IN')} Balance
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-500/20 border border-blue-500/30 px-2.5 py-0.5 text-[11px] font-bold text-blue-300">
                      Formula: ₹{latestPayment.previous_outstanding} − ₹{latestPayment.amount_paid} = ₹{clientOutstanding}
                    </span>
                    <span className="text-[10px] font-sans text-slate-400">
                      via {latestPayment.payment_mode || 'Cash'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Client Payment Receipts & Outstanding Deductions Ledger ── */}
      {paymentHistory.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 shadow-xl backdrop-blur-md">
          <div className="border-b border-slate-800/80 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                <History className="h-5 w-5 text-emerald-400" /> Payment Receipts & Outstanding Deductions
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Official transaction record showing previous balances, payments received, and updated outstanding dues.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => printPaymentHistoryReport(paymentHistory, client)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition shadow-sm"
                title="Print payment history statement"
              >
                <Printer className="h-3.5 w-3.5 text-slate-400" />
                <span>Print Ledger</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportPaymentHistoryCsv(
                    paymentHistory,
                    `${(client?.company_name || 'Client').replace(/\s+/g, '_')}_Payment_History`
                  )
                }
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition shadow-sm"
                title="Export payment transactions as CSV"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-5">Receipt #</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4 text-center">Action / Type</th>
                  <th className="py-3 px-4 text-right">Previous Due</th>
                  <th className="py-3 px-4 text-right">Amount Paid (-)</th>
                  <th className="py-3 px-4 text-right">Remaining Balance</th>
                  <th className="py-3 px-4 text-center">Calculation Breakdown</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Collected By</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {paymentHistory.map((h) => {
                  const isPayment = h.type === 'payment';
                  const isCharge = h.type === 'charge';
                  const isSettled = h.type === 'settlement';

                  return (
                    <tr key={h.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-5 font-mono font-bold text-white">
                        {h.receipt_no || h.id.slice(0, 8)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-200">
                          {new Date(h.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(h.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                            isPayment
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : isCharge
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : isSettled
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {isPayment ? 'Payment (-)' : isCharge ? 'Due Added (+)' : 'Settlement'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                        ₹{h.previous_outstanding.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                        {isPayment ? '− ' : isCharge ? '+ ' : ''}₹{h.amount_paid.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded ${
                            h.current_outstanding === 0
                              ? 'text-emerald-400 bg-emerald-950/40'
                              : 'text-red-400'
                          }`}
                        >
                          ₹{h.current_outstanding.toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-300">
                          {isPayment
                            ? `₹${h.previous_outstanding} − ₹${h.amount_paid} = ₹${h.current_outstanding}`
                            : isCharge
                            ? `₹${h.previous_outstanding} + ₹${h.amount_paid} = ₹${h.current_outstanding}`
                            : `Set: ₹${h.current_outstanding}`}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-300">
                        {h.payment_mode || 'Cash'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {h.recorded_by || 'ICS Staff'}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs truncate text-slate-400" title={h.notes || ''}>
                        {h.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between border-t border-slate-800 bg-slate-900/60 px-6 py-3 text-xs text-slate-400 font-semibold">
            <span>Showing {paymentHistory.length} payment transaction receipts</span>
            <span>
              Total Payments Made:{' '}
              <strong className="text-emerald-400 font-black">
                ₹
                {paymentHistory
                  .filter((h) => h.type === 'payment' || h.type === 'settlement')
                  .reduce((sum, h) => sum + Number(h.amount_paid || 0), 0)
                  .toLocaleString('en-IN')}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* ── KPI Summary Cards: Overall & Monthly Metrics ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {/* Card 1: Total Paid Overall */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Total Amount Paid
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-white tracking-tight flex items-center">
              <span className="text-emerald-400 mr-1 text-2xl">₹</span>
              {overallMetrics.totalPaid.toLocaleString('en-IN')}
            </div>
            <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
              <span>Overall All-Time Paid</span>
              <span className="text-emerald-400 font-semibold">• {overallMetrics.paidCallsCount} calls settled</span>
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
            <span>Total Incurred: ₹{overallMetrics.totalBilled.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Card 2: This Month Paid */}
        <div className="relative overflow-hidden rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-900 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
              Paid This Month
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-white tracking-tight flex items-center">
              <span className="text-blue-400 mr-1 text-2xl">₹</span>
              {overallMetrics.thisMonthPaid.toLocaleString('en-IN')}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Current Month: {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
            <span>Month Billed: ₹{overallMetrics.thisMonthBilled.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Card 3: Pending / Outstanding */}
        <div className={`relative overflow-hidden rounded-3xl border ${
          totalPendingDue > 0
            ? 'border-red-500/40 bg-gradient-to-br from-red-950/40 via-slate-900 to-slate-900'
            : 'border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900'
        } p-5 shadow-xl backdrop-blur-md`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${
              totalPendingDue > 0 ? 'text-red-400' : 'text-amber-400'
            }`}>
              Pending / Outstanding
            </span>
            <div className={`flex h-9 w-9 items-center justify-center rounded-2xl border ${
              totalPendingDue > 0
                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-white tracking-tight flex items-center">
              <span className={`${totalPendingDue > 0 ? 'text-red-400' : 'text-amber-400'} mr-1 text-2xl`}>₹</span>
              {totalPendingDue.toLocaleString('en-IN')}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {totalPendingDue === 0
                ? 'All accounts fully clear'
                : clientOutstanding > 0
                ? 'Pending balance on account'
                : 'Pending settlement verification'}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
            <span className={totalPendingDue > 0 ? 'text-red-300 font-semibold' : 'text-slate-400'}>
              {totalPendingDue > 0
                ? client?.outstanding_notes
                  ? `Note: ${client.outstanding_notes}`
                  : 'Action required: Please clear dues'
                : 'No balance due'}
            </span>
          </div>
        </div>

        {/* Card 4: Service vs Parts vs Inspection breakdown */}
        <div className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-900 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Charges Breakdown
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-slate-400">
                <Wrench className="h-3 w-3 text-purple-400" /> Service / Labor:
              </span>
              <span className="font-bold text-white">₹{overallMetrics.totalService.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-slate-400">
                <Cpu className="h-3 w-3 text-cyan-400" /> Spare Parts:
              </span>
              <span className="font-bold text-white">₹{overallMetrics.totalParts.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-slate-400">
                <ShieldCheck className="h-3 w-3 text-blue-400" /> Inspection:
              </span>
              <span className="font-bold text-white">₹{overallMetrics.totalInspection.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly Spending Breakdown Table & Trend ── */}
      <div className="mb-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 shadow-xl backdrop-blur-md">
        <div className="border-b border-slate-800/80 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" /> Month-by-Month Expenditure Breakdown
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Comparative analysis of monthly service charges, parts cost, and amounts paid.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Filter by Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white focus:border-blue-500 outline-none"
            >
              <option value="all">All Months (Overall)</option>
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {monthlyBreakdown.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No monthly service records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-6">Month & Year</th>
                  <th className="py-3 px-4 text-center">Calls</th>
                  <th className="py-3 px-4 text-right">Inspection</th>
                  <th className="py-3 px-4 text-right">Spare Parts</th>
                  <th className="py-3 px-4 text-right">Service Charge</th>
                  <th className="py-3 px-4 text-right">Total Incurred</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-right">Pending</th>
                  <th className="py-3 px-6 text-center">Payment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {monthlyBreakdown.map((item) => {
                  const isSelected = selectedMonth === item.monthKey;
                  const maxBilled = Math.max(...monthlyBreakdown.map((m) => m.totalBilled), 1);
                  const barWidthPercent = Math.round((item.totalPaid / maxBilled) * 100);

                  return (
                    <tr
                      key={item.monthKey}
                      onClick={() => setSelectedMonth(isSelected ? 'all' : item.monthKey)}
                      className={`cursor-pointer transition hover:bg-slate-800/40 ${
                        isSelected ? 'bg-blue-600/10 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <td className="py-4 px-6 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <span>{item.monthLabel}</span>
                          {isSelected && (
                            <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/30">
                              Selected
                            </span>
                          )}
                        </div>
                        {/* Visual Trend Bar */}
                        <div className="mt-1.5 h-1.5 w-32 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                            style={{ width: `${barWidthPercent}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-4 px-4 text-center font-bold text-slate-200">
                        {item.callCount}
                      </td>

                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        ₹{item.inspection.toLocaleString('en-IN')}
                      </td>

                      <td className="py-4 px-4 text-right font-mono text-cyan-300">
                        ₹{item.parts.toLocaleString('en-IN')}
                      </td>

                      <td className="py-4 px-4 text-right font-mono text-purple-300">
                        ₹{item.service.toLocaleString('en-IN')}
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-bold text-white">
                        ₹{item.totalBilled.toLocaleString('en-IN')}
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-bold text-emerald-400">
                        ₹{item.totalPaid.toLocaleString('en-IN')}
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-bold">
                        {item.totalPending > 0 ? (
                          <span className="text-amber-400">₹{item.totalPending.toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-slate-500">₹0</span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-center">
                        {item.totalPending === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3" /> Fully Settled
                          </span>
                        ) : item.totalPaid > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                            <Clock className="h-3 w-3" /> Partial Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
                            <AlertCircle className="h-3 w-3" /> Due
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Itemized Service Invoices & Receipts Ledger ── */}
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 shadow-xl backdrop-blur-md">
        {/* Table Top Controls */}
        <div className="border-b border-slate-800/80 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" /> Itemized Service Calls & Invoices
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedMonth === 'all'
                ? 'Showing all-time service calls and their individual billed amounts.'
                : `Filtered to: ${availableMonths.find((m) => m.key === selectedMonth)?.label || selectedMonth}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Filter */}
            <div className="flex rounded-xl bg-slate-800 p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => setSelectedStatus('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  selectedStatus === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({billingRecords.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus('paid')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  selectedStatus === 'paid' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Paid ({billingRecords.filter((r) => r.isPaid).length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus('pending')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  selectedStatus === 'pending' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pending ({billingRecords.filter((r) => !r.isPaid).length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search job # or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 sm:w-56 rounded-xl border border-slate-700 bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Invoices List / Table */}
        {loading ? (
          <div className="flex min-h-[250px] items-center justify-center p-8 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
            <span className="text-sm font-semibold">Loading payment transactions...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <ReceiptText className="mx-auto h-12 w-12 text-slate-600 mb-3" />
            <p className="text-sm font-bold text-white">No service invoices match your filter</p>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your month, status, or search query.
            </p>
            {selectedMonth !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedMonth('all')}
                className="mt-3 text-xs font-semibold text-blue-400 hover:underline"
              >
                Clear month filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/40 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-6">Job & Date</th>
                  <th className="py-3 px-4">Service Description</th>
                  <th className="py-3 px-3 text-center">Type</th>
                  <th className="py-3 px-3 text-right">Inspection</th>
                  <th className="py-3 px-3 text-right">Spares</th>
                  <th className="py-3 px-3 text-right">Service</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-3 text-center">Payment Mode</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-6 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="transition hover:bg-slate-800/40">
                    <td className="py-4 px-6">
                      <div className="font-mono font-bold text-blue-400 text-xs">
                        {rec.jobNumber}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {rec.date}
                      </div>
                    </td>

                    <td className="py-4 px-4 max-w-xs">
                      <div className="font-semibold text-white truncate" title={rec.title}>
                        {rec.title}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Cpu className="h-3 w-3 text-purple-400" />
                        <span>Device: {rec.deviceId}</span>
                      </div>
                    </td>

                    <td className="py-4 px-3 text-center">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                          rec.isCovered
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {rec.callType}
                      </span>
                    </td>

                    <td className="py-4 px-3 text-right font-mono text-slate-300">
                      ₹{rec.inspection.toLocaleString('en-IN')}
                    </td>

                    <td className="py-4 px-3 text-right font-mono text-cyan-300">
                      ₹{rec.parts.toLocaleString('en-IN')}
                    </td>

                    <td className="py-4 px-3 text-right font-mono text-purple-300">
                      ₹{rec.service.toLocaleString('en-IN')}
                    </td>

                    <td className="py-4 px-4 text-right font-mono font-bold text-white text-sm">
                      ₹{rec.totalAmount.toLocaleString('en-IN')}
                    </td>

                    <td className="py-4 px-3 text-center">
                      <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300 border border-slate-700">
                        {rec.paymentMode}
                      </span>
                    </td>

                    <td className="py-4 px-3 text-center">
                      {rec.isPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3" /> Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                          <Clock className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-6 text-center">
                      <button
                        type="button"
                        onClick={() => setReceiptJob(rec.job)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-600 hover:text-white transition shadow-sm"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Official Service Receipt / Invoice Modal ── */}
      {receiptJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8 shadow-2xl text-slate-100 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1 shadow-sm">
                  <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Industrial Calibration & Service
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Official Service Invoice & Payment Receipt Slip
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white transition"
                  title="Print Slip"
                >
                  <Printer className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptJob(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white transition"
                  title="Close Modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Receipt Content */}
            <div className="py-6 space-y-6">
              {/* Top Meta Info */}
              <div className="grid grid-cols-2 gap-4 rounded-2xl bg-slate-800/60 p-4 border border-slate-700/60 text-xs">
                <div>
                  <p className="text-slate-400">Invoice / Receipt Ref:</p>
                  <p className="font-mono font-bold text-blue-400 text-sm">{receiptJob.job_number}</p>
                  <p className="text-slate-400 mt-2">Date & Time:</p>
                  <p className="font-semibold text-white">
                    {receiptJob.completed_at
                      ? new Date(receiptJob.completed_at).toLocaleString()
                      : receiptJob.scheduled_date}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Client / Company:</p>
                  <p className="font-bold text-white text-sm">
                    {client?.company_name || profile?.company_name || client?.client_name || 'Valued Customer'}
                  </p>
                  <p className="text-slate-400 mt-2">Client Contact:</p>
                  <p className="text-slate-300 font-mono">
                    {client?.phone || profile?.phone || 'On Record'}
                  </p>
                </div>
              </div>

              {/* Service & Issue Details */}
              <div className="rounded-2xl border border-slate-800 p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Service Call Title:</span>
                  <span className="font-bold text-white">{receiptJob.issue_title}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Call Type:</span>
                  <span className="font-semibold text-purple-300">{receiptJob.call_type || 'Per Call'}</span>
                </div>
                {receiptJob.work_performed && (
                  <div className="pt-1">
                    <span className="text-slate-400 block mb-1">Work Done / Action Taken:</span>
                    <p className="text-slate-200 bg-slate-800/40 p-2.5 rounded-xl border border-slate-700/40">
                      {receiptJob.work_performed}
                    </p>
                  </div>
                )}
                {receiptJob.parts_replaced && (
                  <div className="pt-1">
                    <span className="text-slate-400 block mb-1">Spare Parts Replaced:</span>
                    <p className="text-cyan-300 bg-cyan-950/20 p-2.5 rounded-xl border border-cyan-500/20 font-mono text-[11px]">
                      {receiptJob.parts_replaced}
                    </p>
                  </div>
                )}
              </div>

              {/* Charges Breakdown Slip Table */}
              <div className="rounded-2xl border border-slate-700 bg-slate-800/30 overflow-hidden text-xs">
                <table className="w-full">
                  <thead className="bg-slate-800/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="py-2.5 px-4 text-left">Item Description</th>
                      <th className="py-2.5 px-4 text-right">Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200 font-medium">
                    <tr>
                      <td className="py-2.5 px-4">Inspection / Visit Charge</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {receiptJob.call_type === 'Warranty' || receiptJob.call_type === 'ASC'
                          ? '₹0 (Warranty Covered)'
                          : `₹${(receiptJob.inspection_charge ?? 0).toLocaleString('en-IN')}`}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Service & Calibration Labor Charge</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {receiptJob.call_type === 'Warranty' || receiptJob.call_type === 'ASC'
                          ? '₹0 (Warranty Covered)'
                          : `₹${(receiptJob.service_charge ?? 0).toLocaleString('en-IN')}`}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Spare Parts / Hardware Component Charge</td>
                      <td className="py-2.5 px-4 text-right font-mono text-cyan-300">
                        ₹{(receiptJob.part_charge ?? 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr className="bg-slate-800/60 font-bold text-white text-sm">
                      <td className="py-3 px-4">Net Total Amount</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400 text-base">
                        ₹
                        {(
                          (receiptJob.call_type === 'Warranty' || receiptJob.call_type === 'ASC'
                            ? 0
                            : (receiptJob.inspection_charge ?? 0) + (receiptJob.service_charge ?? 0)) +
                          (receiptJob.part_charge ?? 0)
                        ).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Payment Settlement Status Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-bold">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Payment Status: SETTLED & RECEIVED</p>
                    <p className="text-[11px] text-emerald-300">
                      Payment Mode: {receiptJob.payment_mode || 'Cash'} • Amount Received: {receiptJob.amount_received || 'Yes'}
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400 font-mono">
                  Authorized ICS Service Verification
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="border-t border-slate-800 pt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReceiptJob(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition shadow-md shadow-blue-600/30"
              >
                <Printer className="h-4 w-4" />
                <span>Print Official Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
