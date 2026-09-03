import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, ServiceJob, UserRole } from '@/types/database';
import {
  Plus,
  Pencil,
  X,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  Eye,
  Route,
  Trash2,
  Search,
  Users,
  Briefcase,
  Target,
  Sparkles,
} from 'lucide-react';
import { formatKm } from '@/lib/distance';

interface AdminEngineersProps {
  onViewJob: (job: ServiceJob) => void;
}

export function AdminEngineers({ onViewJob }: AdminEngineersProps) {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [detailEng, setDetailEng] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'engineer' | 'sales_executive'>('all');

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-employees-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function load() {
    const [{ data: empData }, { data: jobData }] = await Promise.all([
      supabase.from('profiles').select('*').in('role', ['engineer', 'sales_executive']).order('full_name'),
      supabase.from('service_jobs').select('*'),
    ]);
    setEmployees((empData as unknown as Profile[]) || []);
    setJobs((jobData as unknown as ServiceJob[]) || []);
    setLoading(false);
  }

  const today = new Date().toISOString().split('T')[0];

  function engStats(engId: string) {
    const engJobs = jobs.filter((j) => j.engineer_id === engId);
    const todayJobs = engJobs.filter((j) => j.scheduled_date === today);
    const completed = engJobs.filter((j) => j.status === 'completed');
    const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);
    const active = engJobs.find(
      (j) => j.status === 'traveling' || j.status === 'reached' || j.status === 'in_progress'
    );
    return { todayJobs: todayJobs.length, completed: completed.length, totalKm, activeJob: active };
  }

  async function deleteEmployee(id: string) {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) {
      alert(`Cannot delete employee: ${error.message}`);
      return;
    }
    load();
  }

  const filteredEmployees = employees.filter((emp) => {
    if (roleFilter !== 'all' && emp.role !== roleFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      emp.full_name.toLowerCase().includes(q) ||
      (emp.email || '').toLowerCase().includes(q) ||
      (emp.employee_id || '').toLowerCase().includes(q) ||
      (emp.phone || '').includes(q) ||
      (emp.designation || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="h-6 w-6 text-blue-600" />
            Employees & Workforce
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Service Engineers, Sales Executives, and field staff credentials
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <Plus className="h-4 w-4" /> Add Employee
        </button>
      </div>

      {/* Role Filter Tabs & Search */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex rounded-xl bg-slate-200/80 p-1">
          <button
            onClick={() => setRoleFilter('all')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              roleFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Staff ({employees.length})
          </button>
          <button
            onClick={() => setRoleFilter('engineer')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              roleFilter === 'engineer' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Engineers ({employees.filter((e) => e.role === 'engineer').length})
          </button>
          <button
            onClick={() => setRoleFilter('sales_executive')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              roleFilter === 'sales_executive'
                ? 'bg-white text-purple-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sales Executives ({employees.filter((e) => e.role === 'sales_executive').length})
          </button>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="search-employees"
            name="search_employees"
            aria-label="Search employees"
            type="text"
            placeholder="Search by name, ID, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 shadow-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Employees Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Emp ID</th>
              <th className="px-4 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Department</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Performance</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Loading employees...
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No employees matching current filter.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => {
                const isEngineer = emp.role === 'engineer';
                const isSales = emp.role === 'sales_executive';
                const stats = isEngineer ? engStats(emp.id) : null;

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">
                      {emp.employee_id || '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div>
                        <p>{emp.full_name}</p>
                        <p className="text-[11px] text-slate-400 font-normal">{emp.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          isSales
                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                            : 'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {isSales ? '💼 Sales Exec' : '🔧 Engineer'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p className="font-semibold text-slate-800">{emp.designation || (isSales ? 'Sales Executive' : 'Field Engineer')}</p>
                      <p className="text-[10px] text-slate-400">{emp.department || (isSales ? 'Sales' : 'Service')}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                      {emp.phone || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {emp.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          <XCircle className="h-3 w-3" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {isEngineer && stats ? (
                        <div className="font-mono">
                          <span className="font-bold text-slate-900">{stats.completed} jobs</span>
                          <span className="text-slate-400"> ({formatKm(stats.totalKm)})</span>
                        </div>
                      ) : (
                        <span className="text-purple-700 font-bold text-[11px]">Leads & Sales</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isEngineer && (
                          <button
                            onClick={() => setDetailEng(emp)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            title="View Stats"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditing(emp);
                            setShowModal(true);
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteEmployee(emp.id)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Employee Modal */}
      {showModal && (
        <EmployeeModal
          employee={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            load();
            setShowModal(false);
          }}
        />
      )}

      {/* Detail Stats Modal for Engineer */}
      {detailEng && (
        <EngineerDetail
          engineer={detailEng}
          jobs={jobs.filter((j) => j.engineer_id === detailEng.id)}
          onClose={() => setDetailEng(null)}
          onViewJob={onViewJob}
        />
      )}
    </div>
  );
}

function EmployeeModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [empId, setEmpId] = useState(employee?.employee_id ?? '');
  const [fullName, setFullName] = useState(employee?.full_name ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [role, setRole] = useState<UserRole>(employee?.role ?? 'engineer');
  const [department, setDepartment] = useState(employee?.department ?? '');
  const [designation, setDesignation] = useState(employee?.designation ?? '');
  const [password, setPassword] = useState('');
  const [joiningDate, setJoiningDate] = useState(employee?.joining_date ?? '');
  const [isActive, setIsActive] = useState(employee?.is_active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employee && !empId) {
      const prefix = role === 'sales_executive' ? 'SE' : 'ENG';
      supabase
        .from('profiles')
        .select('employee_id')
        .eq('role', role)
        .then(({ data }) => {
          let maxNum = 100;
          data?.forEach((r) => {
            const match = r.employee_id?.match(/\d+/);
            if (match) {
              const n = parseInt(match[0], 10);
              if (n > maxNum) maxNum = n;
            }
          });
          setEmpId(`${prefix}${String(maxNum + 1).padStart(3, '0')}`);
        });

      if (role === 'sales_executive') {
        setDepartment('Sales & Marketing');
        setDesignation('Sales Executive');
      } else {
        setDepartment('Field Engineering');
        setDesignation('Service Engineer');
      }
    }
  }, [role, employee]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (!employee && !password.trim()) {
      setError('Password is required for new accounts.');
      return;
    }
    setLoading(true);

    try {
      const generatedEmpId =
        empId.trim() ||
        employee?.employee_id ||
        `${role === 'sales_executive' ? 'SE' : 'ENG'}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

      const basePayload = {
        employee_id: generatedEmpId,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: role,
        department: department.trim() || (role === 'sales_executive' ? 'Sales' : 'Service'),
        designation: designation.trim() || (role === 'sales_executive' ? 'Sales Executive' : 'Service Engineer'),
        is_active: isActive,
        joining_date: joiningDate || null,
      };

      if (employee) {
        const { error: uErr } = await supabase.from('profiles').update(basePayload).eq('id', employee.id);
        if (uErr) {
          // Retry without department/designation if custom column error
          const fallback = { ...basePayload };
          delete (fallback as any).department;
          delete (fallback as any).designation;
          await supabase.from('profiles').update(fallback).eq('id', employee.id);
        }
      } else {
        const newId = crypto.randomUUID();
        const insertPayload = {
          id: newId,
          ...basePayload,
          password_hash: password.trim(),
        };

        const { error: pErr } = await supabase.from('profiles').insert(insertPayload);
        if (pErr) {
          const fallback = { ...insertPayload };
          delete (fallback as any).department;
          delete (fallback as any).designation;
          await supabase.from('profiles').insert(fallback);
        }
      }

      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save employee.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-8 w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {employee ? 'Edit Employee' : 'Add New Employee'}
            </h2>
            <p className="text-xs text-slate-500">Service Engineers & Sales Executives</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700 font-medium">{error}</div>}

          {/* Role Selection */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">System Role *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('engineer')}
                className={`rounded-xl border p-3 text-left transition flex items-center gap-2.5 ${
                  role === 'engineer'
                    ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-500/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
                  🔧
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Service Engineer</p>
                  <p className="text-[10px] text-slate-500">Field calls & attendance</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole('sales_executive')}
                className={`rounded-xl border p-3 text-left transition flex items-center gap-2.5 ${
                  role === 'sales_executive'
                    ? 'border-purple-600 bg-purple-50/70 ring-1 ring-purple-500/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white font-bold">
                  💼
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Sales Executive</p>
                  <p className="text-[10px] text-slate-500">Leads & quotations</p>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Employee ID *</label>
              <input
                type="text"
                required
                placeholder="e.g. SE001 or ENG101"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono font-bold outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Kumar S"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Department</label>
              <input
                type="text"
                placeholder="e.g. Sales / Field Service"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Designation</label>
              <input
                type="text"
                placeholder="e.g. Sales Executive"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Email (Username) *</label>
              <input
                type="email"
                required
                placeholder="e.g. kumar@ics-crm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Phone</label>
              <input
                type="text"
                placeholder="+91 98422 11223"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Joining Date</label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                {employee ? 'New Password (Optional)' : 'Password *'}
              </label>
              <input
                type="password"
                placeholder={employee ? 'Leave blank to keep' : 'Account password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <span className="text-xs font-bold text-slate-700">Active Account (Allowed to Log In)</span>
          </label>

          <div className="flex justify-end gap-2.5 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : employee ? 'Update Employee' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EngineerDetail({
  engineer,
  jobs,
  onClose,
  onViewJob,
}: {
  engineer: Profile;
  jobs: ServiceJob[];
  onClose: () => void;
  onViewJob: (j: ServiceJob) => void;
}) {
  const completed = jobs.filter((j) => j.status === 'completed');
  const active = jobs.find(
    (j) => j.status === 'traveling' || j.status === 'reached' || j.status === 'in_progress'
  );
  const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{engineer.full_name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="p-6">
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Total Jobs</p>
              <p className="text-xl font-bold text-slate-900">{jobs.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Completed</p>
              <p className="text-xl font-bold text-slate-900">{completed.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Total KM</p>
              <p className="text-xl font-bold text-slate-900">{formatKm(totalKm)}</p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1">
              <Mail className="h-4 w-4" /> {engineer.email}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="h-4 w-4" /> {engineer.phone || '—'}
            </span>
          </div>

          {active && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-semibold text-blue-700">
                Active Job: {active.job_number} — {active.issue_title}
              </p>
              <button onClick={() => onViewJob(active)} className="mt-1 text-sm text-blue-600 hover:underline">
                View job
              </button>
            </div>
          )}

          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Recent Jobs</h3>
          <div className="space-y-2">
            {jobs.slice(0, 10).map((j) => (
              <div
                key={j.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {j.job_number} — {j.issue_title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {j.client?.client_name} • {j.scheduled_date} • {formatKm(j.total_km)}
                  </p>
                </div>
                <button onClick={() => onViewJob(j)} className="text-blue-600 hover:underline">
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            ))}
            {jobs.length === 0 && <p className="text-sm text-slate-400">No jobs assigned yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
