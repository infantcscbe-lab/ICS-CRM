import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Client, ServiceJob } from '@/types/database';
import { UpdateOutstandingModal } from '@/components/clients/UpdateOutstandingModal';
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
} from 'lucide-react';

type FilterTab = 'outstanding' | 'all' | 'high' | 'cleared';
type SortOption = 'amount_desc' | 'amount_asc' | 'name_asc' | 'date_desc';

export function AdminOutstandingReport() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
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

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('admin-outstanding-report-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadData(isManual = false) {
    if (isManual) setRefreshing(true);
    try {
      const [{ data: clientData }, { data: jobData }] = await Promise.all([
        supabase.from('clients').select('*').order('client_name'),
        supabase.from('service_jobs').select('id, client_id, status, scheduled_date'),
      ]);

      setClients((clientData as unknown as Client[]) || []);
      setJobs((jobData as unknown as ServiceJob[]) || []);
    } catch (err) {
      console.error('Failed to load outstanding data:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }

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
    };
  }, [clients]);

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
          c.phone?.includes(q) ||
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
      if (sortBy === 'name_asc') return a.client_name.localeCompare(b.client_name);
      if (sortBy === 'date_desc') {
        const dateA = a.outstanding_updated_at || a.updated_at || '';
        const dateB = b.outstanding_updated_at || b.updated_at || '';
        return dateB.localeCompare(dateA);
      }
      return 0;
    });

    return list;
  }, [clients, activeTab, selectedCity, searchQuery, sortBy]);

  // Quick Clear directly from table
  async function handleQuickClear(client: Client) {
    if (!window.confirm(`Are you sure you want to mark ${client.client_name}'s outstanding balance as ₹0 (Settled)?`)) {
      return;
    }

    try {
      const now = new Date().toISOString();
      const updater = profile?.full_name || 'Admin';
      const notes = client.outstanding_notes
        ? `${client.outstanding_notes} (Cleared on ${new Date().toLocaleDateString()})`
        : 'Settled / Cleared';

      const { error: uErr } = await supabase
        .from('clients')
        .update({
          outstanding_amount: 0,
          outstanding_notes: notes,
          outstanding_updated_at: now,
          outstanding_updated_by: updater,
          updated_at: now,
        })
        .eq('id', client.id);

      if (uErr) throw uErr;

      setClients((prev) =>
        prev.map((c) =>
          c.id === client.id
            ? {
                ...c,
                outstanding_amount: 0,
                outstanding_notes: notes,
                outstanding_updated_at: now,
                outstanding_updated_by: updater,
              }
            : c
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear outstanding.');
    }
  }

  // Export to CSV
  function handleExportCSV() {
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
    window.print();
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
              Client Outstanding Receivables Report
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track client dues, update payment balances, and view overdue receivables across all service accounts
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
        {/* Total Outstanding Card */}
        <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50/90 via-white to-red-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-600">
              Total Outstanding
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700">
              <IndianRupee className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-red-700">
            ₹{stats.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-red-600/80 font-semibold">
            Across {stats.clientsWithOutstandingCount} client{stats.clientsWithOutstandingCount === 1 ? '' : 's'}
          </p>
        </div>

        {/* Clients with Dues */}
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">
              Accounts with Dues
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-900">
            {stats.clientsWithOutstandingCount}
            <span className="text-xs font-semibold text-slate-500 ml-1.5">/ {stats.totalClients} clients</span>
          </p>
          <p className="mt-1 text-[11px] text-amber-700/90 font-semibold">
            {stats.totalClients > 0
              ? `${Math.round((stats.clientsWithOutstandingCount / stats.totalClients) * 100)}% of total accounts`
              : '0%'}
          </p>
        </div>

        {/* Average Outstanding */}
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 via-white to-blue-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700">
              Average Debtor Balance
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-blue-900">
            ₹{Math.round(stats.avgOutstanding).toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[11px] text-blue-600/80 font-medium">Per pending client</p>
        </div>

        {/* Settled / Cleared Accounts */}
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
              Settled / Zero Balance
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">{stats.clearedCount}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-semibold">Accounts fully cleared</p>
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
              placeholder="Search by client name, company, phone, city, notes..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-8 text-xs font-medium text-slate-900 placeholder:text-slate-400 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
              className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Option */}
          <div className="sm:col-span-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="amount_desc">Sort: Highest Outstanding</option>
              <option value="amount_asc">Sort: Lowest Outstanding</option>
              <option value="name_asc">Sort: Client Name (A-Z)</option>
              <option value="date_desc">Sort: Recently Updated</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Client Outstanding Data Table ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Client / Account</th>
                <th className="py-3 px-4">Location & Contact</th>
                <th className="py-3 px-4 text-right">Outstanding Dues</th>
                <th className="py-3 px-4">Notes / Remarks</th>
                <th className="py-3 px-4">Last Updated</th>
                <th className="py-3 px-4 text-center print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <UserX className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-600">No client records found</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting your search or filter tab</p>
                  </td>
                </tr>
              ) : (
                displayedClients.map((client) => {
                  const amt = Number(client.outstanding_amount || 0);
                  const isHigh = amt >= 5000;
                  const isPositive = amt > 0;

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Client info */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">
                          {client.client_name}
                        </div>
                        {client.company_name && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            {client.company_name}
                          </div>
                        )}
                        {client.device_ids && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
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
                          >
                            <IndianRupee className="h-3 w-3" />
                            <span>Update</span>
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
          }}
        />
      )}
    </div>
  );
}
