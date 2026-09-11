import React, { useState, useRef, useEffect } from 'react';
import { useBranch } from '@/context/BranchContext';
import { Building2, Globe, ChevronDown, Check, Lock, Plus, X } from 'lucide-react';
import { ALL_BRANCHES_ID } from '@/lib/branches';

interface BranchSelectorProps {
  className?: string;
  variant?: 'header' | 'inline' | 'compact';
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({ className = '', variant = 'header' }) => {
  const { currentBranch, setBranch, canSwitchBranch, isAllBranches, currentBranchObj, branchesList, addBranch } = useBranch();
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newCity, setNewCity] = useState('');
  const [newCode, setNewCode] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAdd(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Locked branch view for Field Engineers
  if (!canSwitchBranch) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-lg bg-blue-950/80 border border-blue-800/80 px-2.5 py-1 text-xs font-semibold text-blue-200 shadow-xs select-none ${className}`}
        title={`Assigned Branch: ${currentBranchObj.name} (${currentBranchObj.code}). Access is restricted to your branch.`}
      >
        <Building2 className="h-3.5 w-3.5 text-blue-400" />
        <span className="font-bold text-white tracking-wide">{currentBranchObj.name}</span>
        <span className="rounded bg-blue-600/50 px-1 py-0.2 text-[10px] font-mono text-blue-100">
          {currentBranchObj.code}
        </span>
        <Lock className="h-3 w-3 text-blue-400 ml-0.5" />
      </div>
    );
  }

  // Interactive switcher for Administrators & Service Coordinators
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
        title="Filter dashboard and modules by branch"
      >
        <div className="flex items-center gap-1.5">
          {isAllBranches ? (
            <Globe className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Building2 className="h-3.5 w-3.5 text-blue-400" />
          )}
          <span className="text-slate-300 text-[11px] hidden sm:inline">Branch:</span>
          <span className="font-bold text-white truncate max-w-[140px]">
            {isAllBranches ? 'All Branches' : `${currentBranchObj.name} (${currentBranchObj.code})`}
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl bg-slate-900 border border-slate-800 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 text-xs">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 mb-1">
            Filter View by Branch
          </div>

          {/* Option: All Branches */}
          <button
            type="button"
            onClick={() => {
              setBranch(ALL_BRANCHES_ID);
              setOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition ${
              isAllBranches ? 'bg-blue-600 font-bold text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-emerald-400" />
              <span>All Branches (Global)</span>
            </div>
            {isAllBranches && <Check className="h-3.5 w-3.5" />}
          </button>

          {/* Individual Branches */}
          <div className="my-1 border-t border-slate-800/80" />
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {branchesList.map((branch) => {
              const selected = !isAllBranches && currentBranch === branch.id;
              return (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => {
                    setBranch(branch.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition ${
                    selected ? 'bg-blue-600 font-bold text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{branch.name}</span>
                    <span className="rounded bg-slate-800 px-1 py-0.2 text-[9px] font-mono text-slate-300">
                      {branch.code}
                    </span>
                  </div>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Add Custom Branch */}
          <div className="mt-1 border-t border-slate-800/80 pt-1">
            {!showAdd ? (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-bold text-blue-400 hover:bg-slate-800 hover:text-blue-300 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Add Branch Location</span>
              </button>
            ) : (
              <div className="rounded-lg bg-slate-800/90 p-2 space-y-2 border border-slate-700/60 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-300">New Branch</span>
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="City name (e.g. Pollachi)"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Code (e.g. POL)"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs font-mono uppercase text-white placeholder:text-slate-500 outline-none focus:border-blue-500"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newCity.trim()) return;
                      const created = addBranch({
                        name: newCity.trim(),
                        code: newCode.trim() || undefined,
                      });
                      setBranch(created.id);
                      setNewCity('');
                      setNewCode('');
                      setShowAdd(false);
                      setOpen(false);
                    }}
                    className="rounded bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold text-white hover:bg-blue-500"
                  >
                    Save & Switch
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
