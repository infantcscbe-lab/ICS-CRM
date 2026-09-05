import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { RequestCallModal } from '@/components/jobs/RequestCallModal';
import type { ServiceJob, Client, Profile } from '@/types/database';
import { parseClientDevices, getDeviceContractInfo } from '@/lib/clientDevices';
import { ChevronRight, Plus, Search, Filter, ChevronDown, Check, Send, Cpu } from 'lucide-react';

interface EngineerJobsProps {
  onViewJob: (job: ServiceJob) => void;
}

const filters: { value: string; label: string; dotColor: string }[] = [
  { value: 'active', label: 'Active Calls', dotColor: 'bg-blue-500' },
  { value: 'assigned', label: 'Assigned', dotColor: 'bg-slate-400' },
  { value: 'traveling', label: 'On Call (Traveling)', dotColor: 'bg-amber-500' },
  { value: 'in_progress', label: 'In Client Place', dotColor: 'bg-indigo-500' },
  { value: 'vendor', label: 'Vendor Handling', dotColor: 'bg-purple-500' },
  { value: 'call_back', label: 'Call Back Scheduled', dotColor: 'bg-rose-500' },
  { value: 'completed', label: 'Completed', dotColor: 'bg-emerald-500' },
  { value: 'all', label: 'All Jobs', dotColor: 'bg-slate-600' },
];

export function EngineerJobs({ onViewJob }: EngineerJobsProps) {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('eng-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function load() {
    if (!profile) return;
    const [{ data: jobData }, { data: clientData }, { data: allEngData }] = await Promise.all([
      supabase.from('service_jobs').select('*').order('scheduled_date', { ascending: false }),
      supabase.from('clients').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    const dbEngList = (allEngData as unknown as Profile[]) || [];
    const engMap = new Map<string, Profile>();
    dbEngList.forEach((e) => engMap.set(e.id, e));

    const dbClients = (clientData as unknown as Client[]) || [];
    const clientMap = new Map<string, Client>();
    dbClients.forEach((c) => clientMap.set(c.id, c));

    // Match jobs strictly belonging to current engineer by ID, Emp ID, or unique full name
    const myName = (profile.full_name || '').trim().toLowerCase();
    const myEmpId = (profile.employee_id || '').trim().toLowerCase();

    function isMyJob(j: ServiceJob) {
      if (!j.engineer_id) return false;
      if (j.engineer_id === profile!.id) return true;
      const eng = j.engineer || engMap.get(j.engineer_id);
      if (!eng) return false;
      if (eng.id === profile!.id) return true;
      if (myEmpId && eng.employee_id && eng.employee_id.trim().toLowerCase() === myEmpId) {
        return true;
      }
      if (myName && eng.full_name && eng.full_name.trim().toLowerCase() === myName) {
        return true;
      }
      return false;
    }

    const allDbJobs = ((jobData as unknown as ServiceJob[]) || [])
      .map((j) => ({
        ...j,
        client: j.client || clientMap.get(j.client_id),
        engineer: j.engineer || engMap.get(j.engineer_id || ''),
      }))
      .filter(isMyJob);

    setJobs(allDbJobs);
    setLoading(false);
  }

  const activeStatuses = ['assigned', 'traveling', 'reached', 'in_progress', 'solved', 'vendor', 'call_back'];
  const inClientStatuses = ['reached', 'in_progress', 'solved'];

  const filterCounts = useMemo(() => {
    return {
      active: jobs.filter((j) => activeStatuses.includes(j.status)).length,
      assigned: jobs.filter((j) => j.status === 'assigned').length,
      traveling: jobs.filter((j) => j.status === 'traveling').length,
      in_progress: jobs.filter((j) => inClientStatuses.includes(j.status)).length,
      vendor: jobs.filter((j) => j.status === 'vendor').length,
      call_back: jobs.filter((j) => j.status === 'call_back').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      all: jobs.length,
    };
  }, [jobs]);

  const currentFilterObj = filters.find((f) => f.value === filter) || filters[0];

  const filtered = jobs.filter((j) => {
    const matchesFilter =
      filter === 'all'
        ? true
        : filter === 'active'
        ? activeStatuses.includes(j.status)
        : filter === 'in_progress'
        ? inClientStatuses.includes(j.status)
        : j.status === filter;

    const matchesSearch =
      !search ||
      j.job_number.toLowerCase().includes(search.toLowerCase()) ||
      j.issue_title.toLowerCase().includes(search.toLowerCase()) ||
      j.client?.client_name.toLowerCase().includes(search.toLowerCase()) ||
      (j.assigned_by_name && j.assigned_by_name.toLowerCase().includes(search.toLowerCase())) ||
      (j.call_given_by && j.call_given_by.toLowerCase().includes(search.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500 font-medium">Loading service calls...</p>
      </div>
    );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">My Jobs</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <Send className="h-3.5 w-3.5" /> Request Call
        </button>
      </div>

      {/* Search & Sliding Filter Dropdown Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search Box */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by job #, client, issue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
          />
        </div>

        {/* Sliding Filter Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition shadow-2xs ${
              dropdownOpen
                ? 'border-blue-500 bg-blue-50/70 text-blue-900 ring-2 ring-blue-100'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-3.5 w-3.5 text-blue-600" />
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${currentFilterObj.dotColor}`} />
              <span>{currentFilterObj.label}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-600 border border-slate-200">
                {filterCounts[filter as keyof typeof filterCounts] ?? 0}
              </span>
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                dropdownOpen ? 'rotate-180 text-blue-600' : ''
              }`}
            />
          </button>

          {/* Slide-Down Menu */}
          {dropdownOpen && (
            <div className="absolute right-0 z-30 mt-1.5 w-60 origin-top-right rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl transition-all animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                Filter by Call Status
              </div>
              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                {filters.map((f) => {
                  const isSelected = filter === f.value;
                  const count = filterCounts[f.value as keyof typeof filterCounts] ?? 0;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        setFilter(f.value);
                        setDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
                        isSelected
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isSelected ? 'bg-white' : f.dotColor
                          }`}
                        />
                        <span>{f.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            isSelected
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {count}
                        </span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-500 font-medium">No service calls found matching "{currentFilterObj.label}"</p>
            {(search || filter !== 'active') && (
              <button
                onClick={() => {
                  setSearch('');
                  setFilter('active');
                }}
                className="mt-2 text-xs font-bold text-blue-600 hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          filtered.map((job) => (
            <button
              key={job.id}
              onClick={() => onViewJob(job)}
              className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{job.client?.client_name}</p>
                    {job.call_source && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          job.call_source === 'online'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {job.call_source}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{job.issue_title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>
                      {job.scheduled_date} • {job.scheduled_time || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                      👤 Assigned by:{' '}
                      <strong className="text-slate-900">
                        {job.assigned_by_name || job.reassigned_from_name || 'Admin'}
                      </strong>
                    </span>
                    {job.call_given_by && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                        📞 Call by: <strong className="text-slate-900">{job.call_given_by}</strong>
                      </span>
                    )}
                    {(() => {
                      const allClientDevs = parseClientDevices(job.client);
                      const targetId = job.device_id?.split(/[,\n;]/)[0]?.trim() || allClientDevs[0]?.device_id;
                      if (!targetId) return null;
                      const matched = allClientDevs.find((cd) => cd.device_id.toUpperCase() === targetId.toUpperCase());
                      const info = matched ? getDeviceContractInfo(matched) : null;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold border ${
                            info?.isExpired
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : info?.isExpiringSoon
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : matched?.contract_type === 'amc'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : matched?.contract_type === 'warranty'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <Cpu className="h-3 w-3 text-blue-600" />
                          <span>{targetId}</span>
                          <span className="font-sans text-[9px] uppercase opacity-85">
                            [{info?.isExpired ? 'EXPIRED' : matched?.contract_type === 'amc' ? 'AMC' : matched?.contract_type === 'warranty' ? 'WARRANTY' : 'NC'}]
                          </span>
                        </span>
                      );
                    })()}
                  </div>

                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={job.status} />
                  <PriorityBadge priority={job.priority} />
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {showCreate && (
        <RequestCallModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onRequestSubmitted={load}
        />
      )}
    </div>
  );
}
