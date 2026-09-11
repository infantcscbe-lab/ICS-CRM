import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isServiceCoordinatorRole } from '@/types/database';
import {
  BRANCHES,
  ALL_BRANCHES_ID,
  DEFAULT_BRANCH,
  normalizeBranch,
  getBranchObj,
  getAllBranches,
  saveCustomBranch,
  type Branch,
} from '@/lib/branches';

interface BranchContextType {
  currentBranch: string;
  currentBranchObj: Branch;
  setBranch: (branchId: string) => void;
  isAllBranches: boolean;
  canSwitchBranch: boolean;
  userBranch: string;
  branchesList: Branch[];
  addBranch: (newBranch: { name: string; code?: string; state?: string }) => Branch;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const STORAGE_KEY = 'ics_selected_branch';

export function BranchProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const isCoordinator = isServiceCoordinatorRole(profile);
  const isEngineer = profile?.role === 'engineer';
  const isAdmin = profile?.role === 'admin' && !isCoordinator;

  const [branchesList, setBranchesList] = useState<Branch[]>(() => getAllBranches());

  // Listen for dynamic branch updates
  useEffect(() => {
    const handleUpdate = () => {
      setBranchesList(getAllBranches());
    };
    window.addEventListener('ics-branches-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('ics-branches-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Derive user's home branch from their profile (defaults to 'cbe')
  const userBranch = useMemo(() => {
    const emp = (profile?.employee_id || '').toUpperCase();
    if (emp === 'ICSEC013' || emp === 'ICSEC014') {
      return normalizeBranch(profile?.branch || 'ooty');
    }
    return normalizeBranch(profile?.branch);
  }, [profile?.branch, profile?.employee_id]);

  // Can this user switch branches? Only Super Admins can switch.
  // Service Coordinators and Field Engineers are strictly locked to their assigned branch.
  const canSwitchBranch = isAdmin;

  // Selected branch state
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    const emp = (profile?.employee_id || '').toUpperCase();
    if (isCoordinator || isEngineer) {
      if (emp === 'ICSEC013' || emp === 'ICSEC014') {
        return normalizeBranch(profile?.branch || 'ooty');
      }
      return normalizeBranch(profile?.branch);
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeBranch(saved) : ALL_BRANCHES_ID;
  });

  // Keep branch in sync with role and profile
  useEffect(() => {
    if (!profile) return;
    const emp = (profile?.employee_id || '').toUpperCase();
    if (isCoordinator || isEngineer) {
      const fixed =
        emp === 'ICSEC013' || emp === 'ICSEC014'
          ? normalizeBranch(profile.branch || 'ooty')
          : normalizeBranch(profile.branch);
      setSelectedBranch(fixed);
    } else if (isAdmin) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSelectedBranch(normalizeBranch(saved));
      } else {
        setSelectedBranch(ALL_BRANCHES_ID);
      }
    }
  }, [profile?.id, profile?.role, profile?.branch, profile?.employee_id, isCoordinator, isEngineer, isAdmin]);

  const handleSetBranch = (branchId: string) => {
    if (!canSwitchBranch) {
      console.warn('[BranchContext] Branch switching is restricted to Administrators.');
      return;
    }
    const normalized = normalizeBranch(branchId);
    setSelectedBranch(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // ignore
    }
  };

  const handleAddBranch = (newBranch: { name: string; code?: string; state?: string }) => {
    const created = saveCustomBranch(newBranch);
    setBranchesList(getAllBranches());
    return created;
  };

  const currentBranch = canSwitchBranch ? selectedBranch : userBranch;
  const isAllBranches = currentBranch === ALL_BRANCHES_ID;
  const currentBranchObj = useMemo(() => getBranchObj(currentBranch), [currentBranch, branchesList]);

  const value = useMemo<BranchContextType>(() => ({
    currentBranch,
    currentBranchObj,
    setBranch: handleSetBranch,
    isAllBranches,
    canSwitchBranch,
    userBranch,
    branchesList,
    addBranch: handleAddBranch,
  }), [currentBranch, currentBranchObj, canSwitchBranch, userBranch, branchesList]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchContextType {
  const context = useContext(BranchContext);
  if (!context) {
    // Fallback if used outside Provider
    return {
      currentBranch: DEFAULT_BRANCH.id,
      currentBranchObj: DEFAULT_BRANCH,
      setBranch: () => {},
      isAllBranches: false,
      canSwitchBranch: false,
      userBranch: DEFAULT_BRANCH.id,
      branchesList: BRANCHES,
      addBranch: (b) => saveCustomBranch(b),
    };
  }
  return context;
}
