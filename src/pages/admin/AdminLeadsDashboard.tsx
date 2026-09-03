import { useEffect, useState } from 'react';
import { fetchAllLeads } from '@/lib/leads';
import type { Lead } from '@/types/database';
import {
  BarChart3,
  TrendingUp,
  Target,
  Trophy,
  IndianRupee,
  PieChart,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';

export function AdminLeadsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllLeads().then((data) => {
      setLeads(data);
      setLoading(false);
    });
  }, []);

  const totalLeads = leads.length;
  const wonLeads = leads.filter((l) => l.status === 'WON').length;
  const lostLeads = leads.filter((l) => l.status === 'LOST').length;
  const activeLeads = leads.filter((l) => l.status !== 'WON' && l.status !== 'LOST').length;

  const wonRevenue = leads
    .filter((l) => l.status === 'WON')
    .reduce((s, l) => s + (l.estimated_value || 0), 0);

  const pipelineValue = leads
    .filter((l) => l.status !== 'WON' && l.status !== 'LOST')
    .reduce((s, l) => s + (l.estimated_value || 0), 0);

  const closedCount = wonLeads + lostLeads;
  const winRate = closedCount > 0 ? Math.round((wonLeads / closedCount) * 100) : 0;

  // Stages count
  const stageCounts: Record<string, number> = {
    NEW: leads.filter((l) => l.status === 'NEW').length,
    CONTACTED: leads.filter((l) => l.status === 'CONTACTED').length,
    'REQUIREMENT IDENTIFIED': leads.filter((l) => l.status === 'REQUIREMENT IDENTIFIED').length,
    'FOLLOW-UP': leads.filter((l) => l.status === 'FOLLOW-UP').length,
    QUOTATION: leads.filter((l) => l.status === 'QUOTATION').length,
    NEGOTIATION: leads.filter((l) => l.status === 'NEGOTIATION').length,
    WON: wonLeads,
    LOST: lostLeads,
  };

  // Sources breakdown
  const sourceCounts: Record<string, number> = {};
  leads.forEach((l) => {
    sourceCounts[l.lead_source] = (sourceCounts[l.lead_source] || 0) + 1;
  });

  // Categories breakdown
  const categoryCounts: Record<string, number> = {};
  leads.forEach((l) => {
    categoryCounts[l.lead_category] = (categoryCounts[l.lead_category] || 0) + 1;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-purple-600" />
          Lead Pipeline Analytics & Funnel
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Comprehensive conversion visibility across all business development channels
        </p>
      </div>

      {/* Top Metrics Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Leads</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalLeads}</p>
          <p className="text-[10px] text-slate-400 font-medium">All logged opportunities</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-xs">
          <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Won Revenue</p>
          <p className="text-2xl font-black text-emerald-900 mt-1">₹{wonRevenue.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-emerald-700 font-medium">{wonLeads} deals closed</p>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4 shadow-xs">
          <p className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">Active Pipeline</p>
          <p className="text-2xl font-black text-purple-900 mt-1">₹{pipelineValue.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-purple-700 font-medium">{activeLeads} leads in progress</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-xs">
          <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">Win Rate</p>
          <p className="text-2xl font-black text-blue-900 mt-1">{winRate}%</p>
          <p className="text-[10px] text-blue-700 font-medium">{wonLeads} of {closedCount} completed</p>
        </div>
      </div>

      {/* ─── VISUAL PIPELINE FUNNEL ─── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
          <Layers className="h-5 w-5 text-purple-600" />
          Sales Pipeline Funnel Stages
        </h2>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {Object.entries(stageCounts).map(([stage, count]) => {
            const isWon = stage === 'WON';
            const isLost = stage === 'LOST';
            const percent = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;

            return (
              <div
                key={stage}
                className={`rounded-2xl border p-3 flex flex-col justify-between transition ${
                  isWon
                    ? 'border-emerald-300 bg-emerald-50/60'
                    : isLost
                    ? 'border-red-200 bg-red-50/40'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 truncate">
                    {stage}
                  </p>
                  <p
                    className={`text-xl font-black mt-1 ${
                      isWon ? 'text-emerald-700' : isLost ? 'text-red-700' : 'text-slate-900'
                    }`}
                  >
                    {count}
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200/60">
                  <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full ${
                        isWon ? 'bg-emerald-600' : isLost ? 'bg-red-500' : 'bg-purple-600'
                      }`}
                      style={{ width: `${Math.min(100, percent * 2)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono mt-1 block">{percent}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Breakdown: Source & Category ─── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Source Breakdown */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-amber-500" />
            Leads by Generation Source
          </h3>
          <div className="space-y-2">
            {Object.entries(sourceCounts).map(([src, count]) => {
              const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
              const isService = src === 'Service Visit';

              return (
                <div key={src} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={`font-semibold ${isService ? 'text-amber-800 font-bold' : 'text-slate-700'}`}>
                      {src} {isService && '⭐ (Engineers)'}
                    </span>
                    <span className="font-mono text-slate-500">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full ${isService ? 'bg-amber-500' : 'bg-indigo-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Target className="h-4 w-4 text-purple-600" />
            Leads by Opportunity Category
          </h3>
          <div className="space-y-2">
            {Object.entries(categoryCounts).map(([cat, count]) => {
              const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-700">{cat}</span>
                    <span className="font-mono text-slate-500">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-purple-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
