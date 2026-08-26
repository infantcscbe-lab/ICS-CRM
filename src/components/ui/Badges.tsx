import type { JobStatus, JobPriority } from '@/types/database';

const statusConfig: Record<JobStatus, { label: string; classes: string }> = {
  assigned: { label: 'Assigned', classes: 'bg-slate-100 text-slate-700' },
  traveling: { label: 'On Call', classes: 'bg-blue-100 text-blue-700' },
  reached: { label: 'In Client Place', classes: 'bg-cyan-100 text-cyan-700' },
  in_progress: { label: 'In Client Place', classes: 'bg-cyan-100 text-cyan-700' },
  solved: { label: 'In Client Place', classes: 'bg-teal-100 text-teal-700' },
  completed: { label: 'Completed', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', classes: 'bg-red-100 text-red-700' },
  vendor: { label: 'Vendor Handling', classes: 'bg-purple-100 text-purple-700 font-semibold' },
  call_back: { label: 'Call Back Scheduled', classes: 'bg-amber-100 text-amber-800 font-semibold' },
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
