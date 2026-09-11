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
    return normalizeBranch(profile?.branch);
  }, [profile?.branch]);

  // Can this user switch branches? Super Admins and Service Coordinators in Admin can switch.
  // Field Engineers remain strictly locked to their assigned branch.
  const canSwitchBranch = isAdmin || isCoordinator;

  // Selected branch state
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (isEngineer) {
      return normalizeBranch(profile?.branch);
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeBranch(saved);
    return isCoordinator && profile?.branch ? normalizeBranch(profile.branch) : ALL_BRANCHES_ID;
  });

  // Keep branch in sync with role and profile
  useEffect(() => {
    if (!profile) return;
    if (isEngineer) {
      const fixed = normalizeBranch(profile.branch);
      setSelectedBranch(fixed);
    } else if (isAdmin || isCoordinator) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSelectedBranch(normalizeBranch(saved));
      } else if (isCoordinator && profile.branch) {
        setSelectedBranch(normalizeBranch(profile.branch));
      } else {
        setSelectedBranch(ALL_BRANCHES_ID);
      }
    }
  }, [profile?.id, profile?.role, profile?.branch, isCoordinator, isEngineer, isAdmin]);

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
