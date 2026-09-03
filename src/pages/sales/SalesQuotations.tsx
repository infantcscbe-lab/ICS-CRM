import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchQuotations, createQuotation, fetchLeadsForUser } from '@/lib/leads';
import type { Quotation, Lead, QuotationItem } from '@/types/database';
import {
  FileText,
  Plus,
  Search,
  IndianRupee,
  Building2,
  Calendar,
  Trash2,
  X,
  Printer,
  CheckCircle2,
  User,
  Sparkles,
} from 'lucide-react';

export function SalesQuotations() {
  const { profile } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [activeQuotation, setActiveQuotation] = useState<Quotation | null>(null);

  useEffect(() => {
    loadData();
  }, [profile?.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [allQuotes, myLeads] = await Promise.all([
        fetchQuotations(),
        profile ? fetchLeadsForUser(profile.id, profile.role) : [],
      ]);
      setQuotations(profile?.role === 'admin' ? allQuotes : allQuotes.filter((q) => q.created_by === profile?.id));
      setLeads(myLeads);
    } catch (err) {
      console.error('Error fetching quotations:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = quotations.filter((q) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      q.quotation_number.toLowerCase().includes(s) ||
      q.customer_name.toLowerCase().includes(s) ||
      (q.company_name || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-purple-600" />
            Quotations & Estimates
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Generate formal sales quotations for CCTV, computers, servers, and AMC
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="self-start sm:self-center inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-700 transition"
        >
          <Plus className="h-4 w-4" />
          <span>+ Create Quotation</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by quote #, customer, or company..."
          className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 shadow-xs outline-none focus:border-purple-500"
        />
      </div>

      {/* Quotations List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading quotations...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-2">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <p className="text-base font-bold text-slate-800">No quotations yet</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Click "+ Create Quotation" to generate a formal quote from an existing lead or customer.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((quote) => (
            <div
              key={quote.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="font-mono text-xs font-bold text-purple-700">{quote.quotation_number}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      quote.status === 'Approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : quote.status === 'Sent'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {quote.status}
                  </span>
                </div>

                <p className="font-bold text-slate-900 text-sm mt-2 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  {quote.customer_name}
                </p>
                {quote.company_name && (
                  <p className="text-xs text-slate-500 font-medium">{quote.company_name}</p>
                )}

                <div className="mt-3 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
                  <p className="font-semibold text-slate-900">
                    {quote.items?.length || 0} Line Items
                  </p>
                  <p className="text-sm font-black text-slate-900 mt-1 flex items-center gap-0.5">
                    <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
                    {quote.total_amount.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>{new Date(quote.created_at).toLocaleDateString()}</span>
                <button
                  onClick={() => setActiveQuotation(quote)}
                  className="font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
                >
                  <Printer className="h-3.5 w-3.5" /> View Slip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quotation Creator Modal */}
      {showModal && (
        <CreateQuotationModal
          leads={leads}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            loadData();
          }}
        />
      )}

      {/* View Printable Slip Modal */}
      {activeQuotation && (
        <PrintQuotationModal
          quotation={activeQuotation}
          onClose={() => setActiveQuotation(null)}
        />
      )}
    </div>
  );
}

function CreateQuotationModal({
  leads,
  onClose,
  onSaved,
}: {
  leads: Lead[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxRate, setTaxRate] = useState(18);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('Payment: 50% advance, 50% on completion. Warranty: 1 year standard.');
  const [submitting, setSubmitting] = useState(false);

  const [items, setItems] = useState<
    { product_name: string; description: string; quantity: number; unit_price: number }[]
  >([{ product_name: '', description: '', quantity: 1, unit_price: 0 }]);

  function handleSelectLead(leadId: string) {
    setSelectedLeadId(leadId);
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setCustomerName(lead.customer_name);
      setCompanyName(lead.company_name || '');
      setContactPerson(lead.contact_person || lead.customer_name);
      setMobileNumber(lead.mobile_number);
      setEmail(lead.email || '');
      setAddress(lead.address || '');
      if (lead.requirement) {
        setItems([
          {
            product_name: `${lead.lead_category}: ${lead.requirement}`,
            description: lead.customer_remarks || 'Supply & installation',
            quantity: 1,
            unit_price: lead.estimated_value || 0,
          },
        ]);
      }
    }
  }

  function addItem() {
    setItems((prev) => [...prev, { product_name: '', description: '', quantity: 1, unit_price: 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: string, val: any) {
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  }

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxable * taxRate) / 100;
  const grandTotal = Math.round(taxable + taxAmount);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !customerName.trim()) return;

    setSubmitting(true);
    try {
      await createQuotation({
        lead_id: selectedLeadId || undefined,
        customer_name: customerName.trim(),
        company_name: companyName.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        mobile_number: mobileNumber.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        created_by: profile.id,
        created_by_name: profile.full_name,
        items: items.map((it) => ({
          product_name: it.product_name.trim() || 'Service Item',
          description: it.description.trim() || undefined,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          total_price: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
        })),
        tax_rate: taxRate,
        discount_amount: discountAmount,
        notes: notes.trim() || undefined,
      });

      onSaved();
    } catch (err: any) {
      alert(`Failed to save quotation: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden my-6">
        <div className="bg-purple-700 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">New Quotation Builder</h2>
            <p className="text-xs text-purple-200">Generate formal price quotation</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-white/80 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Select Lead dropdown */}
          {leads.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Autofill from Existing Lead (Optional)
              </label>
              <select
                value={selectedLeadId}
                onChange={(e) => handleSelectLead(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs font-medium text-slate-900 outline-none focus:border-purple-500"
              >
                <option value="">-- Choose an assigned lead --</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lead_number} • {l.customer_name} ({l.lead_category} - {l.requirement.slice(0, 40)}...)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Customer Name *</label>
              <input
                required
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number</label>
              <input
                type="text"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800">Quotation Line Items</label>
              <button
                type="button"
                onClick={addItem}
                className="text-xs font-bold text-purple-600 hover:text-purple-700"
              >
                + Add Item
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 p-3 bg-slate-50/50 space-y-2">
                <div className="flex gap-2">
                  <input
                    required
                    type="text"
                    placeholder="Product or Service Name"
                    value={item.product_name}
                    onChange={(e) => updateItem(idx, 'product_name', e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-red-500 p-1 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold">Qty</span>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold">Unit Price (₹)</span>
                    <input
                      type="number"
                      min="0"
                      value={item.unit_price}
                      onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold">Total (₹)</span>
                    <p className="pt-2 text-xs font-bold text-slate-800">
                      ₹{(item.quantity * item.unit_price).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pricing Totals */}
          <div className="rounded-xl bg-purple-50 p-4 text-xs space-y-1.5 border border-purple-100">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal:</span>
              <span className="font-bold text-slate-900">₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Discount (₹):</span>
              <input
                type="number"
                min="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value))}
                className="w-24 rounded border border-purple-200 bg-white p-1 text-right text-xs"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">GST Tax (%):</span>
              <input
                type="number"
                min="0"
                max="28"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="w-16 rounded border border-purple-200 bg-white p-1 text-right text-xs"
              />
            </div>
            <div className="flex justify-between pt-2 border-t border-purple-200 font-black text-sm text-purple-950">
              <span>Grand Total:</span>
              <span>₹{grandTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-700 transition disabled:opacity-50"
            >
              {submitting ? 'Generating...' : 'Save & Issue Quotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PrintQuotationModal({
  quotation,
  onClose,
}: {
  quotation: Quotation;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden my-6">
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Formal Quotation Slip</h2>
            <p className="text-xs text-slate-400 font-mono">{quotation.quotation_number}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold hover:bg-white/20"
            >
              Print
            </button>
            <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-8 text-xs space-y-6">
          {/* Company Branding */}
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h1 className="text-xl font-black text-slate-900">ICS Service Manager</h1>
              <p className="text-slate-500 text-[11px]">IT Systems, CCTV & AMC Solutions</p>
            </div>
            <div className="text-right font-mono">
              <p className="font-bold text-purple-700">{quotation.quotation_number}</p>
              <p className="text-slate-400 text-[10px]">
                Date: {new Date(quotation.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Customer info */}
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-100">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Customer / Client:</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{quotation.customer_name}</p>
              {quotation.company_name && <p className="text-slate-600">{quotation.company_name}</p>}
              {quotation.address && <p className="text-slate-500 mt-1">{quotation.address}</p>}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Issued By:</p>
              <p className="font-bold text-slate-900 mt-0.5">{quotation.created_by_name}</p>
              <p className="text-slate-500">Sales Executive</p>
              {quotation.mobile_number && <p className="text-slate-500 mt-1">Ph: {quotation.mobile_number}</p>}
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-slate-400 uppercase text-[10px]">
                <th className="py-2">Item</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 text-right">Price</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotation.items?.map((it, i) => (
                <tr key={i} className="py-2">
                  <td className="py-2">
                    <p className="font-bold text-slate-800">{it.product_name}</p>
                    {it.description && <p className="text-[10px] text-slate-400">{it.description}</p>}
                  </td>
                  <td className="py-2 text-center">{it.quantity}</td>
                  <td className="py-2 text-right font-mono">₹{it.unit_price.toLocaleString('en-IN')}</td>
                  <td className="py-2 text-right font-mono font-bold">
                    ₹{it.total_price.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total Box */}
          <div className="rounded-xl bg-slate-50 p-4 space-y-1 text-right border border-slate-100 font-mono">
            <p>Subtotal: ₹{quotation.subtotal.toLocaleString('en-IN')}</p>
            {quotation.discount_amount > 0 && (
              <p className="text-red-600">Discount: -₹{quotation.discount_amount.toLocaleString('en-IN')}</p>
            )}
            <p>GST ({quotation.tax_rate}%): ₹{quotation.tax_amount.toLocaleString('en-IN')}</p>
            <p className="text-base font-black text-slate-900 pt-2 border-t">
              Total Amount: ₹{quotation.total_amount.toLocaleString('en-IN')}
            </p>
          </div>

          {quotation.notes && (
            <p className="text-[11px] text-slate-500 italic">Terms & Notes: {quotation.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}
