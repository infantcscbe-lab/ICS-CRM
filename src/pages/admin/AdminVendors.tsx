import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Vendor, ServiceJob } from '@/types/database';
import {
  Plus,
  Pencil,
  X,
  Search,
  Phone,
  Mail,
  MapPin,
  Trash2,
  Building,
  Wrench,
  CheckCircle2,
  XCircle,
  Briefcase,
  Store,
  ExternalLink,
  ShieldCheck,
  Tag,
} from 'lucide-react';

const SERVICE_TYPES = [
  'Chip-Level Motherboard Repair',
  'Printer & Scanner Service',
  'Hard Disk & Data Recovery',
  'SMPS & Power Supply Repair',
  'Laptop Display & Hinge Repair',
  'CCTV & Security Networking',
  'Spare Parts & Components Supplier',
  'Other Specialized Repair',
];

const LOCAL_VENDORS_KEY = 'ics_local_vendors_cache';

export function AdminVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [vendorName, setVendorName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0]);
  const [customServiceType, setCustomServiceType] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Coimbatore');
  const [gstin, setGstin] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    load();

    const ch = supabase
      .channel('admin-vendors')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function load() {
    try {
      const [{ data: vData, error: vErr }, { data: jData }] = await Promise.all([
        supabase.from('vendors').select('*').order('created_at', { ascending: false }),
        supabase.from('service_jobs').select('*'),
      ]);

      if (vErr) {
        console.warn('Vendors table query warning:', vErr.message);
        // Fallback to local storage
        const cached = localStorage.getItem(LOCAL_VENDORS_KEY);
        if (cached) {
          try {
            setVendors(JSON.parse(cached));
          } catch {
            setVendors([]);
          }
        }
      } else if (vData) {
        setVendors(vData as Vendor[]);
        localStorage.setItem(LOCAL_VENDORS_KEY, JSON.stringify(vData));
      }

      setJobs((jData as unknown as ServiceJob[]) || []);
    } catch (err) {
      console.error('Failed to load vendors:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingVendor(null);
    setVendorName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setServiceType(SERVICE_TYPES[0]);
    setCustomServiceType('');
    setAddress('');
    setCity('Coimbatore');
    setGstin('');
    setNotes('');
    setIsActive(true);
    setFormError(null);
    setShowModal(true);
  }

  function handleOpenEdit(v: Vendor) {
    setEditingVendor(v);
    setVendorName(v.vendor_name);
    setContactPerson(v.contact_person || '');
    setPhone(v.phone);
    setEmail(v.email || '');
    if (SERVICE_TYPES.includes(v.service_type || '')) {
      setServiceType(v.service_type || SERVICE_TYPES[0]);
      setCustomServiceType('');
    } else {
      setServiceType('Other Specialized Repair');
      setCustomServiceType(v.service_type || '');
    }
    setAddress(v.address || '');
    setCity(v.city || 'Coimbatore');
    setGstin(v.gstin || '');
    setNotes(v.notes || '');
    setIsActive(v.is_active ?? true);
    setFormError(null);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorName.trim()) {
      setFormError('Vendor Name is required.');
      return;
    }
    if (!phone.trim()) {
      setFormError('Phone number is required.');
      return;
    }

    setSaving(true);
    setFormError(null);

    const finalServiceType =
      serviceType === 'Other Specialized Repair' && customServiceType.trim()
        ? customServiceType.trim()
        : serviceType;

    const payload = {
      vendor_name: vendorName.trim(),
      contact_person: contactPerson.trim() || null,
      phone: phone.trim(),
      email: email.trim() || null,
      service_type: finalServiceType,
      address: address.trim() || null,
      city: city.trim() || 'Coimbatore',
      gstin: gstin.trim() || null,
      notes: notes.trim() || null,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingVendor) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', editingVendor.id);
        if (error) {
          // Update local cache fallback
          const updated = vendors.map((v) => (v.id === editingVendor.id ? { ...v, ...payload } : v));
          setVendors(updated);
          localStorage.setItem(LOCAL_VENDORS_KEY, JSON.stringify(updated));
        } else {
          load();
        }
      } else {
        const newVendorId = crypto.randomUUID ? crypto.randomUUID() : `vendor-${Date.now()}`;
        const newVendor: Vendor = {
          id: newVendorId,
          ...payload,
          created_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('vendors').insert([newVendor]);
        if (error) {
          // Fallback to local cache
          const updated = [newVendor, ...vendors];
          setVendors(updated);
          localStorage.setItem(LOCAL_VENDORS_KEY, JSON.stringify(updated));
        } else {
          load();
        }
      }

      setShowModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save vendor.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to remove this vendor from your directory?')) return;
    try {
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) {
        const updated = vendors.filter((v) => v.id !== id);
        setVendors(updated);
        localStorage.setItem(LOCAL_VENDORS_KEY, JSON.stringify(updated));
      } else {
        load();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  const filtered = useMemo(() => {
    return vendors.filter((v) => {
      const matchesSearch =
        !search ||
        v.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
        (v.contact_person && v.contact_person.toLowerCase().includes(search.toLowerCase())) ||
        v.phone.includes(search) ||
        (v.city && v.city.toLowerCase().includes(search.toLowerCase())) ||
        (v.service_type && v.service_type.toLowerCase().includes(search.toLowerCase()));

      const matchesCat = categoryFilter === 'all' || v.service_type === categoryFilter;
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? v.is_active !== false
          : v.is_active === false;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [vendors, search, categoryFilter, statusFilter]);

  // Counts
  const activeCount = vendors.filter((v) => v.is_active !== false).length;
  const categoriesCount = new Set(vendors.map((v) => v.service_type).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Store className="h-6 w-6 text-blue-600" />
            Vendor Directory & Outsource Partners
          </h1>
          <p className="text-sm text-slate-500">
            Manage external repair partners, chip-level service centers, and hardware component suppliers
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <Plus className="h-5 w-5" /> Add New Vendor
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Vendors</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{vendors.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Active Partners</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-900">{activeCount}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Service Categories</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-900">{categoriesCount}</p>
        </div>
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-purple-700">Primary Hub</p>
          <p className="mt-1 text-xl font-extrabold text-purple-900 truncate">Coimbatore</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor by name, phone, city, or specialty..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 py-2 pl-10 pr-3 text-xs font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="all">🏷️ All Categories</option>
            {SERVICE_TYPES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="all">⚡ All Statuses</option>
            <option value="active">Active Partners</option>
            <option value="inactive">Inactive Partners</option>
          </select>
        </div>
      </div>

      {/* Vendors Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 font-bold tracking-wider">
            <tr>
              <th className="px-4 py-3.5">Vendor Name</th>
              <th className="px-4 py-3.5">Specialty / Service</th>
              <th className="px-4 py-3.5">Contact Person</th>
              <th className="px-4 py-3.5">Phone & Email</th>
              <th className="px-4 py-3.5">Location / City</th>
              <th className="px-4 py-3.5 text-center">Status</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Loading vendors...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  <Store className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p className="font-semibold text-slate-600">No vendors found matching filters</p>
                  <p className="text-xs text-slate-400 mt-1">Click "Add New Vendor" to register external service partners</p>
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold text-sm border border-blue-200 shadow-sm">
                        {v.vendor_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{v.vendor_name}</p>
                        {v.gstin && (
                          <span className="text-[10px] text-slate-400 font-mono">GST: {v.gstin}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                      <Wrench className="h-3 w-3" />
                      {v.service_type || 'General Hardware Service'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-slate-800">
                    {v.contact_person || '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="space-y-0.5 text-xs">
                      <a
                        href={`tel:${v.phone}`}
                        className="font-bold text-slate-900 hover:text-blue-600 flex items-center gap-1"
                      >
                        <Phone className="h-3 w-3 text-emerald-600" /> {v.phone}
                      </a>
                      {v.email && (
                        <a
                          href={`mailto:${v.email}`}
                          className="text-slate-500 hover:text-blue-600 flex items-center gap-1"
                        >
                          <Mail className="h-3 w-3 text-slate-400" /> {v.email}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span>{v.city || 'Coimbatore'}</span>
                    </div>
                    {v.address && <p className="text-[11px] text-slate-400 truncate max-w-xs">{v.address}</p>}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        v.is_active !== false
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {v.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(v)}
                        className="rounded-lg bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100 transition border border-blue-200"
                        title="Edit Vendor"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(v.id)}
                        className="rounded-lg bg-red-50 p-1.5 text-red-600 hover:bg-red-100 transition border border-red-200"
                        title="Delete Vendor"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Vendor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <Store className="h-5 w-5 text-blue-400" />
                <h3 className="font-bold text-base">
                  {editingVendor ? 'Edit Vendor Partner' : 'Register New Vendor Partner'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700 border border-red-200">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Vendor / Shop Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="e.g. Sri Lakshmi Chip Solutions"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g. Suresh Kumar"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Primary Phone / Mobile *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 98422 12345"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. info@vendor.com"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Service Category / Specialty *
                </label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600"
                >
                  {SERVICE_TYPES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {serviceType === 'Other Specialized Repair' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Specify Specialty
                  </label>
                  <input
                    type="text"
                    value={customServiceType}
                    onChange={(e) => setCustomServiceType(e.target.value)}
                    placeholder="e.g. Laser Toner Refilling & Drum Replacement"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    City / Town
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Coimbatore, Tirupur, Erode"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    GSTIN / Tax ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="e.g. 33AAAAA0000A1Z5"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-600 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Full Workshop / Store Address
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. #45, 100 Feet Road, Gandhipuram, Coimbatore - 641012"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Vendor Notes & Pricing Terms
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Standard 30-day warranty on chip-level work, 15% discount for ICS."
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="vendor-active-toggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="vendor-active-toggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Vendor is active for outsourcing and call assignment
                </label>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
                >
                  {saving ? 'Saving...' : editingVendor ? 'Update Vendor' : 'Create Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
