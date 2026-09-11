import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Client, ServiceJob, ClientPaymentHistory } from '@/types/database';
import { UpdateOutstandingModal } from '@/components/clients/UpdateOutstandingModal';
import {
  fetchClientPaymentHistory,
  exportPaymentHistoryCsv,
  printPaymentHistoryReport,
  recordClientPayment,
} from '@/lib/clientPayments';
import {
  IndianRupee,
  Search,
  Filter,
  Download,
  Printer,
  RefreshCw,
  Building2,
  Phone,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  X,
  FileText,
  UserX,
  TrendingUp,
  Sparkles,
  Layers,
  History,
  Receipt,
  ArrowRight,
  CreditCard,
  FileSpreadsheet,
} from 'lucide-react';

type FilterTab = 'outstanding' | 'all' | 'high' | 'cleared' | 'history';
type SortOption = 'amount_desc' | 'amount_asc' | 'name_asc' | 'date_desc';

export function AdminOutstandingReport() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<ClientPaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Sorting
  const [activeTab, setActiveTab] = useState<FilterTab>('outstanding');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('amount_desc');

  // Modal State
  const [selectedClientForUpdate, setSelectedClientForUpdate] = useState<Client | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Client History Modal State
  const [selectedClientForHistory, setSelectedClientForHistory] = useState<Client | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  useEffect(() => {
    loadData();

    const clientChannel = supabase
      .channel('admin-outstanding-report-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_payment_history' }, () => {
        loadData();
      })
      .subscribe();

    function handlePaymentRecorded() {
      loadData();
    }
    window.addEventListener('client_payment_recorded', handlePaymentRecorded);

    return () => {
      supabase.removeChannel(clientChannel);
      window.removeEventListener('client_payment_recorded', handlePaymentRecorded);
    };
  }, []);

  async function loadData(isManual = false) {
    if (isManual) setRefreshing(true);
    try {
      const [{ data: clientData }, { data: jobData }, historyData] = await Promise.all([
        supabase.from('clients').select('*').order('client_name'),
        supabase.from('service_jobs').select('id, client_id, status, scheduled_date'),
        fetchClientPaymentHistory(),
      ]);

      setClients((clientData as unknown as Client[]) || []);
      setJobs((jobData as unknown as ServiceJob[]) || []);
      setPaymentHistory(historyData);
    } catch (err) {
      console.error('Failed to load outstanding data:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }

  // Quick lookup of latest payment per client
  const latestPaymentByClient = useMemo(() => {
    const map = new Map<string, ClientPaymentHistory>();
    paymentHistory.forEach((p) => {
      if (!map.has(p.client_id) && (p.type === 'payment' || p.type === 'settlement')) {
        map.set(p.client_id, p);
      }
    });
    return map;
  }, [paymentHistory]);

  // Unique list of cities for city filter
  const cities = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.city && c.city.trim()) set.add(c.city.trim());
    });
    return Array.from(set).sort();
  }, [clients]);

  // Executive KPI calculations
  const stats = useMemo(() => {
    let totalOutstanding = 0;
    let clientsWithOutstandingCount = 0;
    let clearedCount = 0;
    let highestClient: Client | null = null;
    let highestAmount = 0;

    clients.forEach((c) => {
      const amt = Number(c.outstanding_amount || 0);
      if (amt > 0) {
        totalOutstanding += amt;
        clientsWithOutstandingCount++;
        if (amt > highestAmount) {
          highestAmount = amt;
          highestClient = c;
        }
      } else {
        clearedCount++;
      }
    });

    const totalCollected = paymentHistory
      .filter((r) => r.type === 'payment' || r.type === 'settlement')
      .reduce((s, r) => s + Number(r.amount_paid || 0), 0);

    const avgOutstanding =
      clientsWithOutstandingCount > 0 ? totalOutstanding / clientsWithOutstandingCount : 0;

    return {
      totalOutstanding,
      clientsWithOutstandingCount,
      clearedCount,
      totalClients: clients.length,
      avgOutstanding,
      highestClient,
      highestAmount,
      totalCollected,
      totalPaymentsCount: paymentHistory.length,
    };
  }, [clients, paymentHistory]);

  // Filtered & Sorted Clients
  const displayedClients = useMemo(() => {
    let list = [...clients];

    // Filter by Tab
    if (activeTab === 'outstanding') {
      list = list.filter((c) => Number(c.outstanding_amount || 0) > 0);
    } else if (activeTab === 'high') {
      list = list.filter((c) => Number(c.outstanding_amount || 0) >= 5000);
    } else if (activeTab === 'cleared') {
      list = list.filter((c) => Number(c.outstanding_amount || 0) <= 0);
    }

    // Filter by City
    if (selectedCity !== 'all') {
      list = list.filter((c) => c.city?.toLowerCase() === selectedCity.toLowerCase());
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => {
        return (
          c.client_name?.toLowerCase().includes(q) ||
          c.company_name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.city?.toLowerCase().includes(q) ||
          c.outstanding_notes?.toLowerCase().includes(q)
        );
      });
    }

    // Sorting
    list.sort((a, b) => {
      const amtA = Number(a.outstanding_amount || 0);
      const amtB = Number(b.outstanding_amount || 0);

      if (sortBy === 'amount_desc') return amtB - amtA;
      if (sortBy === 'amount_asc') return amtA - amtB;
      if (sortBy === 'name_asc') return (a.client_name || '').localeCompare(b.client_name || '');
      if (sortBy === 'date_desc') {
        const dateA = a.outstanding_updated_at ? new Date(a.outstanding_updated_at).getTime() : 0;
        const dateB = b.outstanding_updated_at ? new Date(b.outstanding_updated_at).getTime() : 0;
        return dateB - dateA;
      }
      return 0;
    });

    return list;
  }, [clients, activeTab, selectedCity, searchQuery, sortBy]);

  // Filtered Payment History (for History Tab)
  const displayedHistory = useMemo(() => {
    let list = [...paymentHistory];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((h) => {
        const clientName = h.client?.client_name || '';
        const compName = h.client?.company_name || '';
        const receipt = h.receipt_no || '';
        const notes = h.notes || '';
        const mode = h.payment_mode || '';
        return (
          clientName.toLowerCase().includes(q) ||
          compName.toLowerCase().includes(q) ||
          receipt.toLowerCase().includes(q) ||
          notes.toLowerCase().includes(q) ||
          mode.toLowerCase().includes(q)
        );
      });
    }

    if (selectedCity !== 'all') {
      list = list.filter((h) => h.client?.city?.toLowerCase() === selectedCity.toLowerCase());
    }

    return list;
  }, [paymentHistory, searchQuery, selectedCity]);

  // Quick Clear action with audit log
  async function handleQuickClear(client: Client) {
    if (!confirm(`Are you sure you want to mark outstanding for ${client.client_name} as Settled / Cleared (₹0)?`)) {
      return;
    }

    const updater = profile?.full_name || 'Admin';
    try {
      const { updatedClient } = await recordClientPayment({
        client,
        amount: Number(client.outstanding_amount || 0),
        mode: 'set',
        notes: `Settled / Cleared (₹0) on ${new Date().toLocaleDateString('en-IN')}`,
        recordedBy: updater,
      });

      setClients((prev) => prev.map((c) => (c.id === client.id ? updatedClient : c)));
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear outstanding.');
    }
  }

  // Export to CSV
  function handleExportCSV() {
    if (activeTab === 'history') {
      exportPaymentHistoryCsv(displayedHistory, 'ICS_Payment_History_Report');
      return;
    }

    const headers = [
      'Client Name',
      'Company Name',
      'Phone',
      'Email',
      'City',
      'Outstanding Amount (INR)',
      'Outstanding Notes',
      'Last Updated Date',
      'Updated By',
    ];

    const rows = displayedClients.map((c) => [
      `"${c.client_name || ''}"`,
      `"${c.company_name || ''}"`,
      `"${c.phone || ''}"`,
      `"${c.email || ''}"`,
      `"${c.city || ''}"`,
      Number(c.outstanding_amount || 0).toFixed(2),
      `"${(c.outstanding_notes || '').replace(/"/g, '""')}"`,
      `"${c.outstanding_updated_at ? new Date(c.outstanding_updated_at).toLocaleDateString() : ''}"`,
      `"${c.outstanding_updated_by || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ICS_Client_Outstanding_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Print Report
  function handlePrint() {
    if (activeTab === 'history') {
      printPaymentHistoryReport(displayedHistory, null);
    } else {
      window.print();
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-semibold text-slate-600">Loading Client Outstanding Report...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Top Dispatch Header ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white shadow-md shadow-red-600/20">
                <IndianRupee className="h-5 w-5" />
              </span>
              Client Outstanding Receivables & Payment Report
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track client dues, view payment deductions (e.g. ₹2,000 − ₹500 = ₹1,500), and inspect payment transaction history
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition"
          >
            <Printer className="h-3.5 w-3.5 text-slate-600" />
            <span>Print Report</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ─── Executive KPI Cards Strip ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Outstanding */}
        <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50/90 via-white to-red-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-700">
              Total Outstanding
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700">
              <IndianRupee className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-black text-red-600">
            ₹{stats.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-red-700 font-medium">
            Across {stats.clientsWithOutstandingCount} {stats.clientsWithOutstandingCount === 1 ? 'client' : 'clients'}
          </p>
        </div>

        {/* Total Payments Collected */}
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
              Payments Collected
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-black text-emerald-700">
            ₹{stats.totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700 font-medium">
            Across {stats.totalPaymentsCount} recorded payments
          </p>
        </div>

        {/* Average Debtor Balance */}
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 via-white to-blue-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700">
              Average Debtor Balance
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-black text-blue-900">
            ₹{Math.round(stats.avgOutstanding).toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[11px] text-blue-600 font-medium">Per pending client</p>
        </div>

        {/* Settled / Cleared Accounts */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50/90 via-white to-slate-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
              Settled / Zero Balance
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-black text-slate-800">{stats.clearedCount}</p>
          <p className="mt-1 text-[11px] text-slate-500 font-semibold">Accounts fully cleared</p>
        </div>
      </div>

      {/* ─── Search, Tabs & Filter Toolbar ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3.5 print:hidden">
        {/* Quick Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('outstanding')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'outstanding'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Has Outstanding ({stats.clientsWithOutstandingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('high')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'high'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>High Dues (≥ ₹5,000)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>All Clients ({clients.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cleared')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'cleared'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Settled ({stats.clearedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Payment History & Collections ({paymentHistory.length})</span>
          </button>
        </div>

        {/* Search & Filter Inputs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          {/* Search Box */}
          <div className="sm:col-span-6 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'history'
                  ? 'Search by receipt #, client name, payment mode, remarks...'
                  : 'Search by client name, company, phone, city, notes...'
              }
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* City Filter */}
          <div className="sm:col-span-3">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs text-slate-700 font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Cities</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By (When in Client view) */}
          {activeTab !== 'history' && (
            <div className="sm:col-span-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs text-slate-700 font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="amount_desc">Sort: Highest Outstanding</option>
                <option value="amount_asc">Sort: Lowest Outstanding</option>
                <option value="name_asc">Sort: Client Name (A-Z)</option>
                <option value="date_desc">Sort: Recently Updated</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ─── MAIN CONTENT VIEW (History Tab OR Outstanding Receivables) ─── */}
      {activeTab === 'history' ? (
        /* ─── PAYMENT TRANSACTION HISTORY LEDGER ─── */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Payment Collection Receipts Ledger</h2>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                {displayedHistory.length} records
              </span>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing deduction calculations: <span className="font-mono font-bold text-slate-800">Previous − Paid = Balance</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                <tr>
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Client / Account</th>
                  <th className="py-3 px-4 text-center">Type</th>
                  <th className="py-3 px-4 text-right">Previous Due</th>
                  <th className="py-3 px-4 text-right">Amount Paid (-)</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Formula / Calculation</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Recorded By</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      <Receipt className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-600">No payment transaction records found.</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        When you or an engineer records a payment, the transaction ledger will appear here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  displayedHistory.map((h) => {
                    const isPayment = h.type === 'payment';
                    const isCharge = h.type === 'charge';
                    const isSettled = h.type === 'settlement';

                    return (
                      <tr key={h.id} className="hover:bg-slate-50/80 transition font-sans">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {h.receipt_no || h.id.slice(0, 8)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-slate-800 font-semibold">
                            {new Date(h.created_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(h.created_at).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">
                            {h.client?.client_name || 'Client Account'}
                          </div>
                          {h.client?.company_name && (
                            <div className="text-[11px] text-slate-500">{h.client.company_name}</div>
                          )}
                          {h.client?.city && (
                            <div className="text-[10px] text-slate-400">{h.client.city}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                              isPayment
                                ? 'bg-emerald-100 text-emerald-800'
                                : isCharge
                                ? 'bg-amber-100 text-amber-800'
                                : isSettled
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isPayment ? 'Payment' : isCharge ? 'Charge (+)' : isSettled ? 'Settlement' : 'Adjust'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-600">
                          ₹{h.previous_outstanding.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-600">
                          {isPayment ? '− ' : isCharge ? '+ ' : ''}₹{h.amount_paid.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-black">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded ${
                              h.current_outstanding === 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'text-red-600'
                            }`}
                          >
                            ₹{h.current_outstanding.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200/80 px-2 py-1 font-mono text-[11px] font-bold text-blue-800">
                            {isPayment
                              ? `₹${h.previous_outstanding} − ₹${h.amount_paid} = ₹${h.current_outstanding}`
                              : isCharge
                              ? `₹${h.previous_outstanding} + ₹${h.amount_paid} = ₹${h.current_outstanding}`
                              : `Set: ₹${h.current_outstanding}`}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                            <CreditCard className="h-3 w-3 text-slate-400" />
                            {h.payment_mode || 'Cash'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-medium">
                          {h.recorded_by || 'Admin'}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs truncate" title={h.notes || ''}>
                          {h.notes || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500 font-semibold">
            <span>Showing {displayedHistory.length} recorded payments</span>
            <span>
              Total Payments Displayed:{' '}
              <strong className="text-emerald-700 font-black">
                ₹
                {displayedHistory
                  .filter((h) => h.type === 'payment' || h.type === 'settlement')
                  .reduce((sum, h) => sum + Number(h.amount_paid || 0), 0)
                  .toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </strong>
            </span>
          </div>
        </div>
      ) : (
        /* ─── CLIENT RECEIVABLES SUMMARY TABLE ─── */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                <tr>
                  <th className="py-3 px-4">Client / Account</th>
                  <th className="py-3 px-4">Location & Contact</th>
                  <th className="py-3 px-4 text-right">Outstanding Dues</th>
                  <th className="py-3 px-4">Latest Payment Breakdown</th>
                  <th className="py-3 px-4">Notes / Remarks</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-center print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <UserX className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-600">No client accounts found matching criteria.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Try adjusting your search query or filters.</p>
                    </td>
                  </tr>
                ) : (
                  displayedClients.map((client) => {
                    const amt = Number(client.outstanding_amount || 0);
                    const isPositive = amt > 0;
                    const isHigh = amt >= 5000;
                    const latestPay = latestPaymentByClient.get(client.id);

                    return (
                      <tr
                        key={client.id}
                        className={`hover:bg-slate-50/80 transition ${
                          isHigh ? 'bg-red-50/20' : isPositive ? 'bg-amber-50/10' : ''
                        }`}
                      >
                        {/* Client & Company */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">{client.client_name}</div>
                          {client.company_name && (
                            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
                              {client.company_name}
                            </div>
                          )}
                          {client.device_ids && (
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                              Dev: {client.device_ids}
                            </div>
                          )}
                        </td>

                        {/* Contact & Location */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                            <a href={`tel:${client.phone}`} className="hover:text-blue-600 hover:underline">
                              {client.phone || 'No phone'}
                            </a>
                          </div>
                          {client.city && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {client.city}
                              {client.address && <span className="text-slate-400"> • {client.address}</span>}
                            </div>
                          )}
                        </td>

                        {/* Outstanding Amount */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-block text-right">
                            <span
                              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-sm font-black ${
                                isHigh
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : isPositive
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </span>
                            <span className="block text-[10px] font-bold uppercase tracking-wider mt-0.5 text-right">
                              {isHigh ? (
                                <span className="text-red-600">High Priority</span>
                              ) : isPositive ? (
                                <span className="text-amber-700">Pending</span>
                              ) : (
                                <span className="text-emerald-600">Settled</span>
                              )}
                            </span>
                          </div>
                        </td>

                        {/* Latest Payment Breakdown (e.g. 2000 - 500 = 1500) */}
                        <td className="py-3.5 px-4">
                          {latestPay ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800">
                                ₹{latestPay.previous_outstanding} − ₹{latestPay.amount_paid} = ₹{latestPay.current_outstanding}
                              </span>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <span>Paid: ₹{latestPay.amount_paid} ({latestPay.payment_mode})</span>
                                <span>•</span>
                                <span>{new Date(latestPay.created_at).toLocaleDateString('en-IN')}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No payments logged</span>
                          )}
                        </td>

                        {/* Notes / Reason */}
                        <td className="py-3.5 px-4 max-w-xs">
                          {client.outstanding_notes ? (
                            <p className="text-xs text-slate-700 line-clamp-2" title={client.outstanding_notes}>
                              {client.outstanding_notes}
                            </p>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No notes recorded</span>
                          )}
                        </td>

                        {/* Last Updated Audit */}
                        <td className="py-3.5 px-4">
                          {client.outstanding_updated_at ? (
                            <div>
                              <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {new Date(client.outstanding_updated_at).toLocaleDateString()}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                By: {client.outstanding_updated_by || 'Admin'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center print:hidden">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedClientForUpdate(client);
                                setIsUpdateModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition shadow-2xs"
                              title="Update Outstanding / Record Payment"
                            >
                              <IndianRupee className="h-3 w-3" />
                              <span>Update</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedClientForHistory(client);
                                setIsHistoryModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition shadow-2xs"
                              title="View Payment History & Ledger"
                            >
                              <History className="h-3 w-3 text-slate-500" />
                              <span>History</span>
                            </button>

                            {isPositive && (
                              <button
                                type="button"
                                onClick={() => handleQuickClear(client)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 transition shadow-2xs"
                                title="Mark as Settled / Clear Outstanding (₹0)"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Clear</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Summary */}
          <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500 font-semibold">
            <span>
              Showing {displayedClients.length} of {clients.length} accounts
            </span>
            <span>
              Filtered Total Outstanding:{' '}
              <strong className="text-slate-900 font-black">
                ₹
                {displayedClients
                  .reduce((s, c) => s + Number(c.outstanding_amount || 0), 0)
                  .toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* ─── Update Outstanding Modal ─── */}
      {selectedClientForUpdate && (
        <UpdateOutstandingModal
          client={selectedClientForUpdate}
          isOpen={isUpdateModalOpen}
          onClose={() => {
            setIsUpdateModalOpen(false);
            setSelectedClientForUpdate(null);
          }}
          currentUser={profile}
          onSuccess={(updated) => {
            setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            loadData();
          }}
        />
      )}

      {/* ─── Individual Client Payment History Modal ─── */}
      {selectedClientForHistory && isHistoryModalOpen && (
        <ClientPaymentHistoryModal
          client={selectedClientForHistory}
          history={paymentHistory.filter((h) => h.client_id === selectedClientForHistory.id)}
          onClose={() => {
            setIsHistoryModalOpen(false);
            setSelectedClientForHistory(null);
          }}
        />
      )}
    </div>
  );
}

interface ClientPaymentHistoryModalProps {
  client: Client;
  history: ClientPaymentHistory[];
  onClose: () => void;
}

function ClientPaymentHistoryModal({ client, history, onClose }: ClientPaymentHistoryModalProps) {
  const currentOutstanding = Number(client.outstanding_amount || 0);
  const totalPaid = history
    .filter((h) => h.type === 'payment' || h.type === 'settlement')
    .reduce((sum, h) => sum + Number(h.amount_paid || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Payment Ledger & Receipts</h2>
              <p className="text-xs text-slate-300">{client.client_name} • {client.company_name || 'Client'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => printPaymentHistoryReport(history, client)}
              className="flex items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-600 transition"
              title="Print Client Statement"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Statement</span>
            </button>
            <button
              type="button"
              onClick={() => exportPaymentHistoryCsv(history, `${client.client_name.replace(/\s+/g, '_')}_Payments`)}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
              title="Export CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition ml-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Mini KPI bar */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50 border-b border-slate-200 p-3 text-center shrink-0">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Current Outstanding</span>
            <p className={`text-base font-black ${currentOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              ₹{currentOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Payments Recorded</span>
            <p className="text-base font-black text-emerald-600">
              ₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Transactions</span>
            <p className="text-base font-black text-slate-800">{history.length}</p>
          </div>
        </div>

        {/* List of payments */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {history.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Receipt className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600">No payment records found for this client.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Payments recorded using the "Update" button will appear here with previous and new balance calculations.
              </p>
            </div>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 text-xs hover:border-slate-300 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                      {h.receipt_no || h.id.slice(0, 8)}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                        h.type === 'payment'
                          ? 'bg-emerald-100 text-emerald-800'
                          : h.type === 'charge'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {h.type === 'payment' ? 'Payment Received (-)' : h.type === 'charge' ? 'Due Added (+)' : 'Settled'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {new Date(h.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    •{' '}
                    {new Date(h.created_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Calculation Breakdown: 2000 - 500 = 1500 */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 font-mono flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="text-left">
                      <span className="text-[9px] uppercase font-sans text-slate-400 block">Previous</span>
                      <span className="font-bold text-slate-700">₹{h.previous_outstanding.toLocaleString('en-IN')}</span>
                    </div>
                    <span className="text-slate-400 font-bold">{h.type === 'charge' ? '+' : '−'}</span>
                    <div className="text-left">
                      <span className="text-[9px] uppercase font-sans text-slate-400 block">Amount</span>
                      <span className="font-black text-emerald-600">₹{h.amount_paid.toLocaleString('en-IN')}</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    <div className="text-left">
                      <span className="text-[9px] uppercase font-sans text-slate-400 block">Remaining</span>
                      <span className="font-black text-slate-900">₹{h.current_outstanding.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                    ₹{h.previous_outstanding} − ₹{h.amount_paid} = ₹{h.current_outstanding}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>
                    <strong>Mode:</strong> {h.payment_mode || 'Cash'} {h.notes ? `• ${h.notes}` : ''}
                  </span>
                  <span className="text-slate-400">Recorded By: {h.recorded_by || 'Admin'}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-right shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
