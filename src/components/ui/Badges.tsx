import type { JobStatus, JobPriority } from '@/types/database';

const statusConfig: Record<JobStatus, { label: string; classes: string }> = {
  assigned: { label: 'Assigned', classes: 'bg-slate-100 text-slate-700 border border-slate-200' },
  traveling: { label: 'On Call / Traveling', classes: 'bg-blue-100 text-blue-800 border border-blue-200' },
  reached: { label: 'Arrived On-Site', classes: 'bg-cyan-100 text-cyan-800 border border-cyan-200 font-semibold' },
  in_progress: { label: 'Service In Progress', classes: 'bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold' },
  solved: { label: 'Work Resolved', classes: 'bg-teal-100 text-teal-800 border border-teal-200 font-semibold' },
  completed: { label: 'Completed', classes: 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold' },
  cancelled: { label: 'Cancelled', classes: 'bg-rose-100 text-rose-700 border border-rose-200' },
  vendor: { label: 'Vendor Handling', classes: 'bg-purple-100 text-purple-800 border border-purple-200 font-semibold' },
  call_back: { label: 'Follow-up Scheduled', classes: 'bg-amber-100 text-amber-800 border border-amber-200 font-semibold' },
};

const priorityConfig: Record<JobPriority, { label: string; classes: string }> = {
  low: { label: 'Low', classes: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Medium', classes: 'bg-yellow-100 text-yellow-700' },
  high: { label: 'High', classes: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', classes: 'bg-red-100 text-red-700' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const cfg = statusConfig[status] || { label: status, classes: 'bg-slate-100 text-slate-700' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  const cfg = priorityConfig[priority] || { label: priority, classes: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}
