import { supabase } from './supabase';
import type {
  Lead,
  LeadAssignmentHistory,
  LeadFollowup,
  Quotation,
  QuotationItem,
  LeadCategory,
  LeadPriority,
  LeadStatus,
  LeadSource,
} from '@/types/database';

export const INITIAL_LEAD_CATEGORIES = [
  'CCTV',
  'Computer',
  'Laptop',
  'Printer',
  'Networking',
  'Server',
  'UPS',
  'Firewall',
  'Biometric',
  'Barcode / Labeling',
  'Software',
  'AMC',
  'Home Automation',
  'Video Door Phone',
  'GPS',
  'Other',
];

export const LEAD_SOURCES: LeadSource[] = [
  'Service Visit',
  'Admin Created',
  'Sales Executive',
  'Website',
  'Phone Call',
  'WhatsApp',
  'Walk-in',
  'Referral',
  'Existing Customer',
  'Other',
];

export const LEAD_STATUS_PIPELINE: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'REQUIREMENT IDENTIFIED',
  'FOLLOW-UP',
  'QUOTATION',
  'NEGOTIATION',
  'WON',
  'LOST',
];

const LOCAL_STORAGE_LEADS_KEY = 'ics_local_leads_cache';
const LOCAL_STORAGE_HISTORY_KEY = 'ics_local_lead_history_cache';
const LOCAL_STORAGE_FOLLOWUPS_KEY = 'ics_local_lead_followups_cache';
const LOCAL_STORAGE_QUOTATIONS_KEY = 'ics_local_quotations_cache';

// ─── Local Storage Resilience Helpers ───

function getCachedLeads(): Lead[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_LEADS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function setCachedLeads(leads: Lead[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_LEADS_KEY, JSON.stringify(leads));
  } catch {}
}

function getCachedHistory(): LeadAssignmentHistory[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCachedHistory(history: LeadAssignmentHistory[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function getCachedFollowups(): LeadFollowup[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_FOLLOWUPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCachedFollowups(followups: LeadFollowup[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_FOLLOWUPS_KEY, JSON.stringify(followups));
  } catch {}
}

function getCachedQuotations(): Quotation[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_QUOTATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCachedQuotations(quotes: Quotation[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_QUOTATIONS_KEY, JSON.stringify(quotes));
  } catch {}
}

// ─── Lead Number Generation ───
export function generateLeadNumber(): string {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  return `L-${year}-${randomSuffix}`;
}

// ─── Quotation Number Generation ───
export function generateQuotationNumber(): string {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `QT-${year}-${randomSuffix}`;
}

// ─── Create Lead ───
export async function createLead(params: {
  customer_id?: string | null;
  customer_name: string;
  company_name?: string | null;
  contact_person?: string | null;
  mobile_number: string;
  email?: string | null;
  address?: string | null;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  service_job_id?: string | null;
  service_job_number?: string | null;
  created_by: string;
  created_by_name: string;
  created_by_role: 'engineer' | 'admin' | 'sales_executive' | string;
  original_owner_id: string;
  original_owner_name: string;
  current_owner_id: string;
  current_owner_name: string;
  current_owner_role?: string;
  lead_source: LeadSource;
  lead_category: LeadCategory;
  requirement: string;
  priority: LeadPriority;
  estimated_value?: number;
  customer_remarks?: string | null;
  photo_url?: string | null;
  next_followup_date?: string | null;
  next_followup_time?: string | null;
}): Promise<Lead> {
  const id = crypto.randomUUID();
  const lead_number = generateLeadNumber();
  const now = new Date().toISOString();

  const newLead: Lead = {
    id,
    lead_number,
    customer_id: params.customer_id || null,
    customer_name: params.customer_name,
    company_name: params.company_name || null,
    contact_person: params.contact_person || null,
    mobile_number: params.mobile_number,
    email: params.email || null,
    address: params.address || null,
    gps_latitude: params.gps_latitude || null,
    gps_longitude: params.gps_longitude || null,
    service_job_id: params.service_job_id || null,
    service_job_number: params.service_job_number || null,
    created_by: params.created_by,
    created_by_name: params.created_by_name,
    created_by_role: params.created_by_role,
    original_owner_id: params.original_owner_id,
    original_owner_name: params.original_owner_name,
    current_owner_id: params.current_owner_id,
    current_owner_name: params.current_owner_name,
    current_owner_role: params.current_owner_role || params.created_by_role,
    lead_source: params.lead_source,
    lead_category: params.lead_category,
    requirement: params.requirement,
    priority: params.priority,
    estimated_value: params.estimated_value || 0,
    customer_remarks: params.customer_remarks || null,
    status: 'NEW',
    photo_url: params.photo_url || null,
    next_followup_date: params.next_followup_date || null,
    next_followup_time: params.next_followup_time || null,
    created_at: now,
    updated_at: now,
  };

  // Initial Assignment History Entry
  const initialHistory: LeadAssignmentHistory = {
    id: crypto.randomUUID(),
    lead_id: id,
    from_user_id: null,
    from_user_name: null,
    to_user_id: params.current_owner_id,
    to_user_name: params.current_owner_name,
    transferred_by_id: params.created_by,
    transferred_by_name: params.created_by_name,
    reason: `Lead created via ${params.lead_source}`,
    action: 'created',
    created_at: now,
  };

  // Save to cache first
  const cached = getCachedLeads();
  setCachedLeads([newLead, ...cached]);

  const cachedHist = getCachedHistory();
  setCachedHistory([initialHistory, ...cachedHist]);

  // Initial planned follow-up if scheduled
  if (params.next_followup_date) {
    const initialFollowup: LeadFollowup = {
      id: crypto.randomUUID(),
      lead_id: id,
      user_id: params.current_owner_id,
      user_name: params.current_owner_name,
      followup_date: params.next_followup_date,
      followup_time: params.next_followup_time || null,
      followup_type: 'Phone Call',
      notes: 'Initial follow-up scheduled on lead creation',
      status: 'Planned',
      created_at: now,
    };
    const cachedFollowups = getCachedFollowups();
    setCachedFollowups([initialFollowup, ...cachedFollowups]);

    supabase
      .from('lead_followups')
      .insert(initialFollowup)
      .then(({ error }) => {
        if (error) console.warn('Supabase initial followup insert note:', error);
      });
  }

  // Attempt Supabase insert
  try {
    const { error: lErr } = await supabase.from('leads').insert(newLead);
    if (lErr) console.error('Supabase lead insert error:', lErr);
    const { error: hErr } = await supabase.from('lead_assignment_history').insert(initialHistory);
    if (hErr) console.error('Supabase history insert error:', hErr);
  } catch (err) {
    console.warn('Database lead insert note (cached locally):', err);
  }

  return newLead;
}

// ─── Fetch Leads with Role Filtering ───
export async function fetchAllLeads(): Promise<Lead[]> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const dbLeads = data as unknown as Lead[];
      // Sync any local offline leads if missing in DB
      const local = getCachedLeads();
      const dbIds = new Set(dbLeads.map((d) => d.id));
      const missingInDb = local.filter((l) => !dbIds.has(l.id));
      if (missingInDb.length > 0) {
        Promise.resolve(supabase.from('leads').upsert(missingInDb)).catch(() => {});
      }

      const merged = [...dbLeads, ...missingInDb];
      setCachedLeads(merged);
      return merged;
    }
  } catch {
    // ignore
  }

  return getCachedLeads();
}

// ─── Fetch Leads for Specific User / Role ───
export async function fetchLeadsForUser(userId: string, role: string): Promise<Lead[]> {
  const allLeads = await fetchAllLeads();

  if (role === 'admin') {
    return allLeads;
  }

  if (role === 'sales_executive') {
    // Sales Executive only sees leads currently assigned to them
    return allLeads.filter((l) => l.current_owner_id === userId);
  }

  if (role === 'engineer') {
    // Engineer sees leads they created/originated
    return allLeads.filter((l) => l.created_by === userId || l.original_owner_id === userId);
  }

  return [];
}

// ─── Permission Check: Who can follow up on a lead ───
// Admin can follow up on any lead.
// Sales Executive and Engineer can only follow up on their own leads.
export function canUserFollowupLead(
  user: { id?: string; role?: string } | null | undefined,
  lead: Lead | null | undefined
): boolean {
  if (!user?.id || !user?.role || !lead) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'sales_executive') {
    return (
      lead.current_owner_id === user.id ||
      lead.original_owner_id === user.id ||
      lead.created_by === user.id
    );
  }
  if (user.role === 'engineer') {
    return (
      lead.original_owner_id === user.id ||
      lead.created_by === user.id ||
      lead.current_owner_id === user.id
    );
  }
  return false;
}

// ─── Transfer Lead (Admin Action) ───
// IMPORTANT: original_owner_id is NEVER changed!
export async function transferLead(params: {
  lead_id: string;
  to_user_id: string;
  to_user_name: string;
  to_user_role: string;
  transferred_by_id: string;
  transferred_by_name: string;
  reason?: string;
}): Promise<Lead | null> {
  const leads = getCachedLeads();
  const leadIndex = leads.findIndex((l) => l.id === params.lead_id);
  if (leadIndex === -1) return null;

  const current = leads[leadIndex];
  const now = new Date().toISOString();

  const historyEntry: LeadAssignmentHistory = {
    id: crypto.randomUUID(),
    lead_id: current.id,
    from_user_id: current.current_owner_id,
    from_user_name: current.current_owner_name,
    to_user_id: params.to_user_id,
    to_user_name: params.to_user_name,
    transferred_by_id: params.transferred_by_id,
    transferred_by_name: params.transferred_by_name,
    reason: params.reason || 'Reassigned by Admin',
    action: 'transferred',
    created_at: now,
  };

  const updatedLead: Lead = {
    ...current,
    // Original owner is permanently preserved!
    current_owner_id: params.to_user_id,
    current_owner_name: params.to_user_name,
    current_owner_role: params.to_user_role,
    updated_at: now,
  };

  leads[leadIndex] = updatedLead;
  setCachedLeads([...leads]);

  const cachedHist = getCachedHistory();
  setCachedHistory([historyEntry, ...cachedHist]);

  try {
    await supabase
      .from('leads')
      .update({
        current_owner_id: params.to_user_id,
        current_owner_name: params.to_user_name,
        current_owner_role: params.to_user_role,
        updated_at: now,
      })
      .eq('id', params.lead_id);

    await supabase.from('lead_assignment_history').insert(historyEntry);
  } catch (err) {
    console.warn('Lead transfer DB sync note:', err);
  }

  return updatedLead;
}

// ─── Update Lead Status ───
export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus,
  extra?: { lost_reason?: string; estimated_value?: number }
): Promise<Lead | null> {
  const leads = getCachedLeads();
  const idx = leads.findIndex((l) => l.id === leadId);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const updated: Lead = {
    ...leads[idx],
    status,
    lost_reason: extra?.lost_reason ?? leads[idx].lost_reason,
    estimated_value: extra?.estimated_value ?? leads[idx].estimated_value,
    updated_at: now,
    closed_at: status === 'WON' || status === 'LOST' ? now : leads[idx].closed_at,
  };

  leads[idx] = updated;
  setCachedLeads([...leads]);

  try {
    await supabase
      .from('leads')
      .update({
        status,
        lost_reason: updated.lost_reason,
        estimated_value: updated.estimated_value,
        updated_at: now,
        closed_at: updated.closed_at,
      })
      .eq('id', leadId);
  } catch (err) {
    console.warn('Lead status update DB note:', err);
  }

  return updated;
}

// ─── Add Follow-up ───
export async function addLeadFollowup(params: {
  lead_id: string;
  user_id: string;
  user_name: string;
  followup_date: string;
  followup_time?: string;
  followup_type: LeadFollowup['followup_type'];
  notes: string;
  next_action?: string;
  next_followup_date?: string;
  next_followup_time?: string;
  status?: LeadFollowup['status'];
  updateLeadStatusTo?: LeadStatus;
}): Promise<LeadFollowup> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const newFollowup: LeadFollowup = {
    id,
    lead_id: params.lead_id,
    user_id: params.user_id,
    user_name: params.user_name,
    followup_date: params.followup_date,
    followup_time: params.followup_time || null,
    followup_type: params.followup_type,
    notes: params.notes,
    next_action: params.next_action || null,
    next_followup_date: params.next_followup_date || null,
    next_followup_time: params.next_followup_time || null,
    status: params.status || 'Completed',
    created_at: now,
  };

  const followups = getCachedFollowups();
  setCachedFollowups([newFollowup, ...followups]);

  // Update next follow-up on lead
  const leads = getCachedLeads();
  const lIndex = leads.findIndex((l) => l.id === params.lead_id);
  if (lIndex !== -1) {
    leads[lIndex].next_followup_date = params.next_followup_date || null;
    leads[lIndex].next_followup_time = params.next_followup_time || null;
    if (params.updateLeadStatusTo) {
      leads[lIndex].status = params.updateLeadStatusTo;
    } else if (leads[lIndex].status === 'NEW' || leads[lIndex].status === 'CONTACTED') {
      leads[lIndex].status = 'FOLLOW-UP';
    }
    leads[lIndex].updated_at = now;
    setCachedLeads([...leads]);
  }

  try {
    await supabase.from('lead_followups').insert(newFollowup);
    if (lIndex !== -1) {
      await supabase
        .from('leads')
        .update({
          next_followup_date: params.next_followup_date || null,
          next_followup_time: params.next_followup_time || null,
          status: leads[lIndex].status,
          updated_at: now,
        })
        .eq('id', params.lead_id);
    }
  } catch (err) {
    console.warn('Lead followup DB insert note:', err);
  }

  return newFollowup;
}

// ─── Fetch Follow-ups ───
export async function fetchFollowupsForLead(leadId: string): Promise<LeadFollowup[]> {
  try {
    const { data, error } = await supabase
      .from('lead_followups')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data as unknown as LeadFollowup[];
    }
  } catch {}

  return getCachedFollowups().filter((f) => f.lead_id === leadId);
}

// ─── Fetch Assignment History ───
export async function fetchLeadHistory(leadId: string): Promise<LeadAssignmentHistory[]> {
  try {
    const { data, error } = await supabase
      .from('lead_assignment_history')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data as unknown as LeadAssignmentHistory[];
    }
  } catch {}

  return getCachedHistory().filter((h) => h.lead_id === leadId);
}

// ─── Create Quotation ───
export async function createQuotation(params: {
  lead_id?: string | null;
  customer_id?: string | null;
  customer_name: string;
  company_name?: string | null;
  contact_person?: string | null;
  mobile_number?: string | null;
  email?: string | null;
  address?: string | null;
  created_by: string;
  created_by_name: string;
  items: Omit<QuotationItem, 'id' | 'quotation_id'>[];
  tax_rate?: number;
  discount_amount?: number;
  notes?: string | null;
  valid_until?: string | null;
}): Promise<Quotation> {
  const id = crypto.randomUUID();
  const quotation_number = generateQuotationNumber();
  const now = new Date().toISOString();

  const subtotal = params.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const taxRate = params.tax_rate ?? 18;
  const discount = params.discount_amount ?? 0;
  const taxable = Math.max(0, subtotal - discount);
  const taxAmount = (taxable * taxRate) / 100;
  const totalAmount = Math.round(taxable + taxAmount);

  const quotationItems: QuotationItem[] = params.items.map((item) => ({
    id: crypto.randomUUID(),
    quotation_id: id,
    product_name: item.product_name,
    description: item.description || null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.quantity * item.unit_price,
  }));

  const newQuotation: Quotation = {
    id,
    quotation_number,
    lead_id: params.lead_id || null,
    customer_id: params.customer_id || null,
    customer_name: params.customer_name,
    company_name: params.company_name || null,
    contact_person: params.contact_person || null,
    mobile_number: params.mobile_number || null,
    email: params.email || null,
    address: params.address || null,
    created_by: params.created_by,
    created_by_name: params.created_by_name,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    discount_amount: discount,
    total_amount: totalAmount,
    status: 'Sent',
    valid_until: params.valid_until || null,
    notes: params.notes || null,
    items: quotationItems,
    created_at: now,
    updated_at: now,
  };

  const cached = getCachedQuotations();
  setCachedQuotations([newQuotation, ...cached]);

  // If tied to a lead, update lead status to QUOTATION
  if (params.lead_id) {
    await updateLeadStatus(params.lead_id, 'QUOTATION', { estimated_value: totalAmount });
  }

  try {
    await supabase.from('quotations').insert({
      id: newQuotation.id,
      quotation_number: newQuotation.quotation_number,
      lead_id: newQuotation.lead_id,
      customer_id: newQuotation.customer_id,
      customer_name: newQuotation.customer_name,
      company_name: newQuotation.company_name,
      contact_person: newQuotation.contact_person,
      mobile_number: newQuotation.mobile_number,
      email: newQuotation.email,
      address: newQuotation.address,
      created_by: newQuotation.created_by,
      created_by_name: newQuotation.created_by_name,
      subtotal: newQuotation.subtotal,
      tax_rate: newQuotation.tax_rate,
      tax_amount: newQuotation.tax_amount,
      discount_amount: newQuotation.discount_amount,
      total_amount: newQuotation.total_amount,
      status: newQuotation.status,
      valid_until: newQuotation.valid_until,
      notes: newQuotation.notes,
      created_at: now,
      updated_at: now,
    });

    await supabase.from('quotation_items').insert(quotationItems);
  } catch (err) {
    console.warn('Quotation DB insert note:', err);
  }

  return newQuotation;
}

// ─── Fetch Quotations ───
export async function fetchQuotations(leadId?: string): Promise<Quotation[]> {
  try {
    let query = supabase.from('quotations').select('*').order('created_at', { ascending: false });
    if (leadId) {
      query = query.eq('lead_id', leadId);
    }
    const { data, error } = await query;
    if (!error && data) {
      return data as unknown as Quotation[];
    }
  } catch {}

  const cached = getCachedQuotations();
  return leadId ? cached.filter((q) => q.lead_id === leadId) : cached;
}
