import { supabase } from '@/lib/supabase';

export interface Branch {
  id: string; // canonical identifier, e.g. 'cbe', 'chennai'
  code: string; // short code, e.g. 'CBE', 'CHN'
  name: string; // display name, e.g. 'Coimbatore', 'Chennai'
  label: string; // display label
  state: string;
  isDefault?: boolean;
}

export const ALL_BRANCHES_ID = 'all';

export const BASE_BRANCHES: Branch[] = [
  { id: 'cbe', code: 'CBE', name: 'Coimbatore', label: 'Coimbatore', state: 'Tamil Nadu', isDefault: true },
  { id: 'chennai', code: 'CHN', name: 'Chennai', label: 'Chennai', state: 'Tamil Nadu' },
  { id: 'tirupur', code: 'TPR', name: 'Tirupur', label: 'Tirupur', state: 'Tamil Nadu' },
  { id: 'salem', code: 'SLM', name: 'Salem', label: 'Salem', state: 'Tamil Nadu' },
  { id: 'bengaluru', code: 'BLR', name: 'Bengaluru', label: 'Bengaluru', state: 'Karnataka' },
  { id: 'madurai', code: 'MDU', name: 'Madurai', label: 'Madurai', state: 'Tamil Nadu' },
  { id: 'trichy', code: 'TRY', name: 'Trichy', label: 'Trichy', state: 'Tamil Nadu' },
  { id: 'pollachi', code: 'POL', name: 'Pollachi', label: 'Pollachi', state: 'Tamil Nadu' },
  { id: 'erode', code: 'ERD', name: 'Erode', label: 'Erode', state: 'Tamil Nadu' },
  { id: 'ooty', code: 'OTY', name: 'Ooty', label: 'Ooty', state: 'Tamil Nadu' },
  { id: 'hosur', code: 'HSR', name: 'Hosur', label: 'Hosur', state: 'Tamil Nadu' },
  { id: 'tirunelveli', code: 'TNV', name: 'Tirunelveli', label: 'Tirunelveli', state: 'Tamil Nadu' },
];

const CUSTOM_BRANCHES_KEY = 'ics_custom_branches';

export function getCustomBranches(): Branch[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_BRANCHES_KEY) : null;
    return raw ? (JSON.parse(raw) as Branch[]) : [];
  } catch {
    return [];
  }
}

export function getAllBranches(): Branch[] {
  const custom = getCustomBranches();
  const map = new Map<string, Branch>();
  BASE_BRANCHES.forEach((b) => map.set(b.id, b));
  custom.forEach((b) => map.set(b.id, b));
  return Array.from(map.values());
}

export let BRANCHES: Branch[] = getAllBranches();

export function refreshBranchesList(): Branch[] {
  BRANCHES = getAllBranches();
  return BRANCHES;
}

export function saveCustomBranch(newBranch: { name: string; code?: string; state?: string }): Branch {
  const name = newBranch.name.trim();
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const code = (newBranch.code?.trim() || name.slice(0, 3)).toUpperCase();
  const state = newBranch.state?.trim() || 'Tamil Nadu';

  const branchObj: Branch = {
    id,
    code,
    name,
    label: name,
    state,
  };

  const existing = getCustomBranches().filter((b) => b.id !== id);
  existing.push(branchObj);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_BRANCHES_KEY, JSON.stringify(existing));
    }
  } catch {
    // ignore
  }

  // Sync to Supabase cloud table if branches table exists
  try {
    supabase
      .from('branches')
      .upsert({
        id: branchObj.id,
        name: branchObj.name,
        code: branchObj.code,
        label: branchObj.label,
        state: branchObj.state,
      })
      .then(
        () => {},
        () => {}
      );
  } catch {
    // ignore
  }

  refreshBranchesList();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ics-branches-updated', { detail: branchObj }));
  }
  return branchObj;
}

// Background sync from Supabase cloud database
if (typeof window !== 'undefined') {
  try {
    supabase
      .from('branches')
      .select('*')
      .then(
        ({ data }) => {
          if (data && data.length > 0) {
            const custom = getCustomBranches();
            const map = new Map<string, Branch>();
            custom.forEach((b) => map.set(b.id, b));
            data.forEach((d: any) => {
              map.set(d.id, {
                id: d.id,
                name: d.name,
                code: d.code,
                label: d.label || d.name,
                state: d.state || 'Tamil Nadu',
              });
            });
            localStorage.setItem(CUSTOM_BRANCHES_KEY, JSON.stringify(Array.from(map.values())));
            refreshBranchesList();
            window.dispatchEvent(new CustomEvent('ics-branches-updated'));
          }
        },
        () => {}
      );
  } catch {
    // ignore
  }
}

export const DEFAULT_BRANCH = BASE_BRANCHES.find((b) => b.isDefault) || BASE_BRANCHES[0];

/**
 * Normalizes any text, city, or branch code into a canonical branch id (e.g. 'cbe').
 * Falls back to 'cbe' for unknown or empty values to guarantee 100% data continuity.
 */
export function normalizeBranch(value?: string | null): string {
  if (!value) return DEFAULT_BRANCH.id;
  const v = value.toLowerCase().trim();

  if (v === 'all' || v === 'all_branches' || v === 'global') return ALL_BRANCHES_ID;
  if (v.includes('cbe') || v.includes('coimbatore')) return 'cbe';
  if (v.includes('chennai') || v.includes('chn') || v.includes('madras')) return 'chennai';
  if (v.includes('tirupur') || v.includes('tiruppur') || v.includes('tpr')) return 'tirupur';
  if (v.includes('salem') || v.includes('slm')) return 'salem';
  if (v.includes('bengaluru') || v.includes('bangalore') || v.includes('blr')) return 'bengaluru';
  if (v.includes('madurai') || v.includes('mdu')) return 'madurai';
  if (v.includes('trichy') || v.includes('tiruchirappalli') || v.includes('try')) return 'trichy';
  if (v.includes('pollachi') || v.includes('pol')) return 'pollachi';
  if (v.includes('erode') || v.includes('erd')) return 'erode';
  if (v.includes('ooty') || v.includes('udhaga') || v.includes('nilgiri') || v.includes('oty')) return 'ooty';
  if (v.includes('hosur') || v.includes('hsr')) return 'hosur';
  if (v.includes('tirunelveli') || v.includes('tnv') || v.includes('nellai')) return 'tirunelveli';

  // Check against all active branches (including custom ones)
  const all = getAllBranches();
  const match = all.find((b) => b.id === v || b.code.toLowerCase() === v || b.name.toLowerCase() === v);
  if (match) return match.id;

  // Preserve any custom branch slug instead of wrongly turning it into 'cbe'!
  const slug = v.replace(/[^a-z0-9]/g, '');
  if (slug) return slug;

  return DEFAULT_BRANCH.id;
}

export function getBranchObj(branchId?: string | null): Branch {
  const normalized = normalizeBranch(branchId);
  const all = getAllBranches();
  const found = all.find((b) => b.id === normalized);
  if (found) return found;

  const formattedName = (branchId || normalized).charAt(0).toUpperCase() + (branchId || normalized).slice(1);
  return {
    id: normalized,
    code: normalized.slice(0, 3).toUpperCase(),
    name: formattedName,
    label: formattedName,
    state: 'Tamil Nadu',
  };
}

export function getBranchName(branchId?: string | null): string {
  if (branchId === ALL_BRANCHES_ID) return 'All Branches';
  const b = getBranchObj(branchId);
  return `${b.name} (${b.code})`;
}

/**
 * Derives the canonical branch for a ServiceJob.
 * Checks explicit branch -> client city/address -> engineer's branch -> default 'cbe'.
 */
export function getJobBranch(job?: {
  branch?: string | null;
  engineer?: { branch?: string | null } | null;
  client?: { branch?: string | null; city?: string | null; address?: string | null } | null;
} | null): string {
  if (!job) return DEFAULT_BRANCH.id;
  if (job.branch) return normalizeBranch(job.branch);
  if (job.client?.branch) return normalizeBranch(job.client.branch);
  if (job.client?.city) return normalizeBranch(job.client.city);
  if (job.client?.address) return normalizeBranch(job.client.address);
  if (job.engineer?.branch) return normalizeBranch(job.engineer.branch);
  return DEFAULT_BRANCH.id;
}

/**
 * Derives the canonical branch for a Profile (engineer, coordinator, admin).
 */
export function getProfileBranch(profile?: { branch?: string | null; department?: string | null } | null): string {
  if (!profile) return DEFAULT_BRANCH.id;
  if (profile.branch) return normalizeBranch(profile.branch);
  if (profile.department && profile.department.toLowerCase().includes('cbe')) return 'cbe';
  return DEFAULT_BRANCH.id;
}

/**
 * Derives the canonical branch for a Client.
 */
export function getClientBranch(client?: { branch?: string | null; city?: string | null; address?: string | null } | null): string {
  if (!client) return DEFAULT_BRANCH.id;
  if (client.branch) return normalizeBranch(client.branch);
  if (client.city) return normalizeBranch(client.city);
  if (client.address) return normalizeBranch(client.address);
  return DEFAULT_BRANCH.id;
}

/**
 * Derives the canonical branch for a Lead.
 */
export function getLeadBranch(lead?: { branch?: string | null; address?: string | null } | null): string {
  if (!lead) return DEFAULT_BRANCH.id;
  if (lead.branch) return normalizeBranch(lead.branch);
  if (lead.address) return normalizeBranch(lead.address);
  return DEFAULT_BRANCH.id;
}

/**
 * Checks if an entity's branch matches the target filter branch.
 * If targetFilter is 'all', always returns true.
 */
export function matchesBranch(entityBranch: string | null | undefined, targetFilter: string): boolean {
  if (!targetFilter || targetFilter === ALL_BRANCHES_ID) return true;
  const canonicalEntity = normalizeBranch(entityBranch);
  const canonicalTarget = normalizeBranch(targetFilter);
  return canonicalEntity === canonicalTarget;
}

export const deriveBranchFromLocation = normalizeBranch;
