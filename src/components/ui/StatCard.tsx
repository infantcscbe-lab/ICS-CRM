import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  color: string;
}

export function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
