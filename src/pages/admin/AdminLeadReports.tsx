import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllLeads } from '@/lib/leads';
import type { Lead, Profile } from '@/types/database';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Sparkles,
  Users,
  Trophy,
  IndianRupee,
  Briefcase,
  Search,
} from 'lucide-react';

export function AdminLeadReports() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<'engineers' | 'sales'>('engineers');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAllLeads(),
      supabase.from('profiles').select('*').in('role', ['engineer', 'sales_executive']),
    ]).then(([l, emp]) => {
      setLeads(l);
      setEmployees((emp.data as unknown as Profile[]) || []);
      setLoading(false);
    });
  }, []);

  const engineers = employees.filter((e) => e.role === 'engineer');
  const salesExecs = employees.filter((e) => e.role === 'sales_executive');

  // Engineer Stats Calculation
  const engineerReports = engineers.map((eng) => {
    // All leads originally created/discovered by this engineer
    const engLeads = leads.filter(
      (l) => l.original_owner_id === eng.id || l.created_by === eng.id
    );
    const totalLeads = engLeads.length;
    const wonDeads = engLeads.filter((l) => l.status === 'WON');
    const wonCount = wonDeads.length;
    const wonRevenue = wonDeads.reduce((s, l) => s + (l.estimated_value || 0), 0);
    const totalPipeline = engLeads.reduce((s, l) => s + (l.estimated_value || 0), 0);
    const conversionRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

    return {
      id: eng.id,
      empId: eng.employee_id || '—',
      name: eng.full_name,
      phone: eng.phone || '—',
      totalLeads,
      wonCount,
      wonRevenue,
      totalPipeline,
      conversionRate,
    };
  });

  // Sales Executive Stats Calculation
  const salesReports = salesExecs.map((se) => {
    // All leads currently assigned to or closed by this sales executive
    const seLeads = leads.filter((l) => l.current_owner_id === se.id);
    const totalAssigned = seLeads.length;
    const wonDeals = seLeads.filter((l) => l.status === 'WON');
    const lostDeals = seLeads.filter((l) => l.status === 'LOST');
    const wonCount = wonDeals.length;
    const wonRevenue = wonDeals.reduce((s, l) => s + (l.estimated_value || 0), 0);
    const closedCount = wonCount + lostDeals.length;
    const conversionRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

    return {
      id: se.id,
      empId: se.employee_id || '—',
      name: se.full_name,
      phone: se.phone || '—',
      totalAssigned,
      wonCount,
      lostCount: lostDeals.length,
      wonRevenue,
      conversionRate,
    };
  });

  function exportCSV() {
    let rows: string[][] = [];
    if (activeTab === 'engineers') {
      rows.push(['Emp ID', 'Engineer Name', 'Leads Generated', 'Won Deals', 'Won Sales Value (₹)', 'Pipeline Value (₹)', 'Conversion %']);
      engineerReports.forEach((r) => {
        rows.push([r.empId, r.name, String(r.totalLeads), String(r.wonCount), String(r.wonRevenue), String(r.totalPipeline), `${r.conversionRate}%`]);
      });
    } else {
      rows.push(['Emp ID', 'Sales Executive', 'Assigned Leads', 'Won Deals', 'Lost Deals', 'Won Revenue (₹)', 'Win Rate %']);
      salesReports.forEach((r) => {
        rows.push([r.empId, r.name, String(r.totalAssigned), String(r.wonCount), String(r.lostCount), String(r.wonRevenue), `${r.conversionRate}%`]);
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeTab}_lead_performance_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-purple-600" />
            Lead Generation & Sales Performance Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit engineer discovery incentives and sales executive closing conversion
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1.5"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={exportCSV}
            className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-xs flex items-center gap-1.5 transition"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex rounded-2xl bg-slate-200/80 p-1 max-w-md">
        <button
          onClick={() => setActiveTab('engineers')}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'engineers'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span>Engineer Discovery (Incentives)</span>
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'sales'
              ? 'bg-white text-purple-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="h-3.5 w-3.5 text-purple-600" />
          <span>Sales Exec Performance</span>
        </button>
      </div>

      {/* ─── TAB 1: SERVICE ENGINEERS LEAD GENERATION (INCENTIVES) ─── */}
      {activeTab === 'engineers' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Service Engineer Lead Generation & Incentive Ledger
              </h2>
              <p className="text-xs text-slate-500">
                Calculates total new business opportunities discovered by field engineers during service calls
              </p>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              {engineerReports.reduce((s, r) => s + r.totalLeads, 0)} Total Leads Identified
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Emp ID</th>
                  <th className="px-4 py-3">Engineer Name</th>
                  <th className="px-4 py-3 text-center">Leads Generated</th>
                  <th className="px-4 py-3 text-center">Won Deals</th>
                  <th className="px-4 py-3 text-right">Won Sales Value (₹)</th>
                  <th className="px-4 py-3 text-right">Total Pipeline (₹)</th>
                  <th className="px-4 py-3 text-center">Conversion %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {engineerReports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-bold text-slate-600">{r.empId}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{r.name}</td>
                    <td className="px-4 py-3 text-center font-bold text-amber-700 bg-amber-50/50">
                      {r.totalLeads}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-700">
                      {r.wonCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      ₹{r.wonRevenue.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      ₹{r.totalPipeline.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold font-mono">
                        {r.conversionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 2: SALES EXECUTIVE PERFORMANCE ─── */}
      {activeTab === 'sales' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Sales Executive Conversion Performance
              </h2>
              <p className="text-xs text-slate-500">
                Audit closing rate and sales revenue by sales representative
              </p>
            </div>
            <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
              {salesReports.length} Sales Executives
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Emp ID</th>
                  <th className="px-4 py-3">Sales Executive</th>
                  <th className="px-4 py-3 text-center">Assigned Leads</th>
                  <th className="px-4 py-3 text-center">Won Deals</th>
                  <th className="px-4 py-3 text-center">Lost Deals</th>
                  <th className="px-4 py-3 text-right">Won Revenue (₹)</th>
                  <th className="px-4 py-3 text-center">Win Rate %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {salesReports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-bold text-slate-600">{r.empId}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{r.name}</td>
                    <td className="px-4 py-3 text-center font-bold text-purple-700 bg-purple-50/40">
                      {r.totalAssigned}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-700">
                      {r.wonCount}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-red-600">
                      {r.lostCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      ₹{r.wonRevenue.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-md bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 font-bold font-mono">
                        {r.conversionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
