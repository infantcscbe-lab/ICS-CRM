import { useEffect, useState, useMemo, useRef, type FormEvent } from 'react';
import type { JobPriority, Client, Profile } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { X, Plus, Loader2, Globe, UserCheck, Cpu, Calendar, AlertTriangle, CheckCircle2, Building2, Lock, Wrench, Users, FileText, ChevronDown, Search, Check } from 'lucide-react';
import { safeInsertServiceJob } from '@/lib/safeDb';
import { markNotificationAsRead, addAdminNotification } from '@/lib/notifications';
import { parseClientDevices, getDeviceContractInfo } from '@/lib/clientDevices';
import { useBranch } from '@/context/BranchContext';
import { matchesBranch, getProfileBranch, getClientBranch, getBranchName, normalizeBranch, ALL_BRANCHES_ID } from '@/lib/branches';

export interface InitialJobData {
  clientId?: string;
  clientName?: string;
  clientCompany?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientCity?: string;
  deviceId?: string;
  issueTitle?: string;
  issueDescription?: string;
  priority?: JobPriority;
  callSource?: 'online' | 'direct';
  directCallType?: 'inboard' | 'outboard';
  scheduledDate?: string;
  scheduledTime?: string;
  callGivenBy?: string;
  assignedByName?: string;
  adminNotes?: string;
  engineerId?: string;
  isAssistCall?: boolean;
  assistEngineerId?: string;
  assistNotes?: string;
  notificationId?: string;
  branch?: string;
}

interface CreateJobModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultEngineerId?: string;
  initialData?: InitialJobData | null;
}

export function CreateJobModal({ open, onClose, onCreated, defaultEngineerId, initialData }: CreateJobModalProps) {
  const { profile } = useAuth();
  const { currentBranch, canSwitchBranch, branchesList } = useBranch();
  const [clients, setClients] = useState<Client[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);

  const [jobBranch, setJobBranch] = useState<string>(() => {
    if (!canSwitchBranch) return normalizeBranch(profile?.branch);
    return currentBranch === ALL_BRANCHES_ID ? 'cbe' : currentBranch;
  });

  const [clientId, setClientId] = useState('');
  const [engineerId, setEngineerId] = useState(defaultEngineerId || '');
  const [callSource, setCallSource] = useState<'online' | 'direct'>('direct');
  const [directCallType, setDirectCallType] = useState<'inboard' | 'outboard'>('outboard');
  const [deviceId, setDeviceId] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [priority, setPriority] = useState<JobPriority>('medium');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('');
  const [assignedByName, setAssignedByName] = useState('');
  const [callGivenBy, setCallGivenBy] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isAssistCall, setIsAssistCall] = useState(false);
  const [assistEngineerId, setAssistEngineerId] = useState('');
  const [assistNotes, setAssistNotes] = useState('');

  const [newClientName, setNewClientName] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientSecondaryContact, setNewClientSecondaryContact] = useState('');
  const [newClientSecondaryPhone, setNewClientSecondaryPhone] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientCity, setNewClientCity] = useState('');

  const [showNewDeviceInput, setShowNewDeviceInput] = useState(false);
  const [newDeviceInput, setNewDeviceInput] = useState('');
  const [registeringDevice, setRegisteringDevice] = useState(false);

  function getNextDeviceSuggestion(clientObj?: Client | null): string {
    const list = (clientObj?.device_ids || '')
      .split(/[,\n;]/)
      .map((d) => d.trim())
      .filter(Boolean);

    let maxNum = 100;
    list.forEach((d) => {
      const match = d.match(/(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    return `ICS-DEV-${maxNum + 1}`;
  }

  function handleOpenNewDevice() {
    const selectedClientObj = clients.find((c) => c.id === clientId);
    const suggestion = getNextDeviceSuggestion(selectedClientObj);
    setNewDeviceInput(suggestion);
    setShowNewDeviceInput(true);
  }

  async function handleRegisterNewDevice() {
    const tag = newDeviceInput.trim().toUpperCase();
    if (!tag || !clientId) return;

    setRegisteringDevice(true);
    try {
      const clientObj = clients.find((c) => c.id === clientId);
      const existingList = (clientObj?.device_ids || '')
        .split(/[,\n;]/)
        .map((d) => d.trim())
        .filter(Boolean);

      if (!existingList.includes(tag)) {
        existingList.push(tag);
      }

      const updatedDeviceIds = existingList.join(', ');
      const updatedCount = existingList.length;

      // Update in Supabase clients table
      const { error: cErr } = await supabase
        .from('clients')
        .update({
          device_ids: updatedDeviceIds,
          device_count: updatedCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientId);

      if (cErr) {
        console.warn('Notice updating clients table for new device:', cErr.message);
      }

      // Update local clients state so UI reflects it immediately
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, device_ids: updatedDeviceIds, device_count: updatedCount }
            : c
        )
      );

      // Select this new device for the current job
      setDeviceId(tag);
      setNewDeviceInput('');
      setShowNewDeviceInput(false);
    } catch (err) {
      console.error('Failed to register device:', err);
    } finally {
      setRegisteringDevice(false);
    }
  }

  useEffect(() => {
    if (open) {
      loadData();
      if (initialData) {
        if (initialData.clientId) {
          setClientId(initialData.clientId);
          setShowNewClient(false);
        } else if (initialData.clientName) {
          setShowNewClient(true);
          setNewClientName(initialData.clientName || '');
          setNewClientCompany(initialData.clientCompany || '');
          setNewClientPhone(initialData.clientPhone || '');
          setNewClientEmail(initialData.clientEmail || '');
          setNewClientAddress(initialData.clientAddress || '');
          setNewClientCity(initialData.clientCity || '');
        }
        if (initialData.branch) setJobBranch(normalizeBranch(initialData.branch));
        if (initialData.engineerId) setEngineerId(initialData.engineerId);
        if (initialData.callSource) setCallSource(initialData.callSource);
        if (initialData.directCallType) setDirectCallType(initialData.directCallType);
        if (initialData.deviceId) setDeviceId(initialData.deviceId);
        if (initialData.issueTitle) setIssueTitle(initialData.issueTitle);
        if (initialData.issueDescription) setIssueDescription(initialData.issueDescription);
        if (initialData.priority) setPriority(initialData.priority);
        if (initialData.scheduledDate) setScheduledDate(initialData.scheduledDate);
        if (initialData.scheduledTime) setScheduledTime(initialData.scheduledTime);
        if (initialData.callGivenBy) setCallGivenBy(initialData.callGivenBy);
        if (initialData.assignedByName) setAssignedByName(initialData.assignedByName);
        if (initialData.adminNotes) setAdminNotes(initialData.adminNotes);
        if (initialData.isAssistCall != null) setIsAssistCall(initialData.isAssistCall);
        if (initialData.assistEngineerId) setAssistEngineerId(initialData.assistEngineerId);
        if (initialData.assistNotes) setAssistNotes(initialData.assistNotes);
      } else {
        if (defaultEngineerId) {
          setEngineerId(defaultEngineerId);
        } else if (profile?.role === 'engineer') {
          setEngineerId(profile.id);
        }
        setAssignedByName(profile?.full_name || (profile?.role === 'engineer' ? 'Service Engineer' : 'Admin'));
      }
    }
  }, [open, defaultEngineerId, profile, initialData]);

  async function loadData() {
    try {
      const [{ data: cData }, { data: eData }] = await Promise.all([
        supabase.from('clients').select('*').order('client_name'),
        supabase.from('profiles').select('*').eq('role', 'engineer').eq('is_active', true).order('full_name'),
      ]);
      setClients((cData as unknown as Client[]) || []);
      setEngineers((eData as unknown as Profile[]) || []);
    } catch {
      // ignore
    }
  }

  // Filter engineers by selected job branch
  const branchEngineers = useMemo(() => {
    return engineers.filter((e) => matchesBranch(getProfileBranch(e), jobBranch));
  }, [engineers, jobBranch]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!showNewClient && !clientId) {
      setError('Please select a client or enter new client details.');
      return;
    }
    if (showNewClient && !newClientName.trim()) {
      setError('Client contact name is required.');
      return;
    }
    if (!engineerId) {
      setError('Please select an engineer.');
      return;
    }
    if (isAssistCall) {
      if (!assistEngineerId) {
        setError('Please select an Assist Engineer or uncheck Assist Call.');
        return;
      }
      if (assistEngineerId === engineerId) {
        setError('Primary engineer and assist engineer cannot be the same person.');
        return;
      }
    }
    if (!issueTitle.trim()) {
      setError('Issue title is required.');
      return;
    }
    if (!scheduledDate) {
      setError('Scheduled date is required.');
      return;
    }

    setLoading(true);

    try {
      let finalClientId = clientId;

      if (showNewClient) {
        const newCId = crypto.randomUUID();
        const clientPayload = {
          id: newCId,
          client_name: newClientName.trim(),
          company_name: newClientCompany.trim(),
          phone: newClientPhone.trim(),
          email: newClientEmail.trim(),
          secondary_contact_name: newClientSecondaryContact.trim() || null,
          secondary_phone: newClientSecondaryPhone.trim() || null,
          additional_contacts: newClientSecondaryContact.trim() || newClientSecondaryPhone.trim()
            ? [{ name: newClientSecondaryContact.trim(), phone: newClientSecondaryPhone.trim(), role: 'Secondary' }]
            : [],
          address: newClientAddress.trim(),
          city: newClientCity.trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        let newClientData = null;
        try {
          const { data: newClient, error: clientErr } = await supabase
            .from('clients')
            .insert(clientPayload)
            .select()
            .single();

          if (clientErr) throw clientErr;
          newClientData = newClient;
        } catch {
          // Fallback if secondary contact columns are not yet applied in remote Supabase
          const fallbackPayload = {
            id: newCId,
            client_name: newClientName.trim(),
            company_name: newClientCompany.trim(),
            phone: newClientPhone.trim(),
            email: newClientEmail.trim(),
            address: newClientAddress.trim(),
            city: newClientCity.trim(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { data: fbClient, error: fbErr } = await supabase
            .from('clients')
            .insert(fallbackPayload)
            .select()
            .single();

          if (fbErr) throw new Error(`Database Error creating client: ${fbErr.message}`);
          newClientData = fbClient;
        }

        if (newClientData) finalClientId = (newClientData as Client).id;
      }

      const newJobId = crypto.randomUUID();
      const { data: allJobs } = await supabase.from('service_jobs').select('job_number');
      let maxNum = 1000;
      (allJobs || []).forEach((j) => {
        const match = j.job_number?.match(/JOB-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const autoJobNo = `JOB-${maxNum + 1}`;

      const jobPayload = {
        id: newJobId,
        job_number: autoJobNo,
        client_id: finalClientId,
        engineer_id: engineerId,
        is_assist_call: isAssistCall,
        assist_engineer_id: isAssistCall ? assistEngineerId : null,
        assist_status: isAssistCall ? ('assigned' as const) : null,
        assist_notes: isAssistCall ? assistNotes.trim() : null,
        device_id: deviceId.trim() || null,
        issue_title: issueTitle.trim(),
        issue_description: issueDescription.trim(),
        priority,
        status: 'assigned' as const,
        call_source: callSource,
        direct_call_type: callSource === 'direct' ? directCallType : null,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        assigned_at: new Date().toISOString(),
        call_given_by: callGivenBy.trim() || null,
        assigned_by_name: assignedByName.trim() || profile?.full_name || (profile?.role === 'engineer' ? 'Service Engineer' : 'Admin'),
        admin_notes: adminNotes.trim(),
        branch: normalizeBranch(jobBranch),
        created_by: profile?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: jobErr } = await safeInsertServiceJob(jobPayload);
      if (jobErr) throw new Error(`Database Error creating service job: ${jobErr.message}`);

      // If Assist Call, trigger alert to assist engineer
      if (isAssistCall && assistEngineerId) {
        const leadEng = engineers.find((e) => e.id === engineerId);
        const clientObj = clients.find((c) => c.id === finalClientId);
        addAdminNotification({
          job_id: newJobId,
          job_number: autoJobNo,
          type: 'status_change',
          title: `Assist Call Assigned: #${autoJobNo}`,
          message: `You are assigned as Assist Engineer for Job #${autoJobNo} at ${clientObj?.client_name || 'Client'} with Lead Engineer ${leadEng?.full_name || 'colleague'}.`,
          actor_name: profile?.full_name || 'Admin',
          data: {
            is_assist_call: true,
            lead_engineer_id: engineerId,
            lead_engineer_name: leadEng?.full_name || '',
          },
        }).catch(() => {});
      }

      // Ensure any newly specified device ID is permanently registered to the client's credentials
      if (finalClientId && deviceId.trim()) {
        const clientObj = clients.find((c) => c.id === finalClientId);
        const existingTags = (clientObj?.device_ids || '')
          .split(/[,\n;]/)
          .map((d) => d.trim())
          .filter(Boolean);

        const usedTags = deviceId
          .split(/[,\n;]/)
          .map((d) => d.trim().toUpperCase())
          .filter(Boolean);

        let changed = false;
        usedTags.forEach((t) => {
          if (t && !existingTags.includes(t)) {
            existingTags.push(t);
            changed = true;
          }
        });

        if (changed) {
          try {
            await supabase
              .from('clients')
              .update({
                device_ids: existingTags.join(', '),
                device_count: existingTags.length,
                updated_at: new Date().toISOString(),
              })
              .eq('id', finalClientId);
          } catch (dErr) {
            console.warn('Could not sync new device to client record:', dErr);
          }
        }
      }

      if (initialData?.notificationId) {
        await markNotificationAsRead(initialData.notificationId);
      }

      onCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job.');
    } finally {
      setLoading(false);
    }
  }

  // Search and Filter states for Client and Engineer
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientFilterMode, setClientFilterMode] = useState<'all' | 'devices' | 'phone'>('all');
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const [engineerSearchQuery, setEngineerSearchQuery] = useState('');
  const [isEngineerDropdownOpen, setIsEngineerDropdownOpen] = useState(false);
  const engineerDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns smoothly when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
      if (engineerDropdownRef.current && !engineerDropdownRef.current.contains(event.target as Node)) {
        setIsEngineerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientSearchQuery.trim().toLowerCase();
    return clients.filter((c) => {
      if (clientFilterMode === 'devices' && (!c.device_ids || !c.device_ids.trim())) return false;
      if (clientFilterMode === 'phone' && (!c.phone || !c.phone.trim())) return false;
      if (!q) return true;
      const name = (c.client_name || '').toLowerCase();
      const comp = (c.company_name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const city = (c.city || '').toLowerCase();
      const addr = (c.address || '').toLowerCase();
      const devs = (c.device_ids || '').toLowerCase();
      return name.includes(q) || comp.includes(q) || phone.includes(q) || city.includes(q) || addr.includes(q) || devs.includes(q);
    });
  }, [clients, clientSearchQuery, clientFilterMode]);

  const selectedClient = useMemo(() => {
    return clients.find((c) => c.id === clientId) || null;
  }, [clients, clientId]);

  const handleSelectClient = (c: Client) => {
    setClientId(c.id);
    setIsClientDropdownOpen(false);
    setClientSearchQuery('');
    const devList = (c.device_ids || '')
      .split(/[,\n;]/)
      .map((d) => d.trim())
      .filter(Boolean);
    if (devList.length > 0) {
      setDeviceId(devList[0]);
    } else {
      setDeviceId('');
    }
  };

  const filteredEngineers = useMemo(() => {
    const q = engineerSearchQuery.trim().toLowerCase();
    if (!q) return branchEngineers;
    return branchEngineers.filter((e) => {
      const name = (e.full_name || '').toLowerCase();
      const empId = (e.employee_id || '').toLowerCase();
      const email = (e.email || '').toLowerCase();
      return name.includes(q) || empId.includes(q) || email.includes(q);
    });
  }, [branchEngineers, engineerSearchQuery]);

  const selectedEngineer = useMemo(() => {
    return engineers.find((e) => e.id === engineerId) || null;
  }, [engineers, engineerId]);

  const handleSelectEngineer = (e: Profile) => {
    setEngineerId(e.id);
    setIsEngineerDropdownOpen(false);
    setEngineerSearchQuery('');
  };

  function handleClose() {
    setClientId('');
    setEngineerId(defaultEngineerId || '');
    setIsAssistCall(false);
    setAssistEngineerId('');
    setAssistNotes('');
    setCallSource('direct');
    setDeviceId('');
    setIssueTitle('');
    setIssueDescription('');
    setPriority('medium');
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setScheduledTime('');
    setAssignedByName('');
    setCallGivenBy('');
    setAdminNotes('');
    setShowNewClient(false);
    setNewClientName('');
    setNewClientCompany('');
    setNewClientPhone('');
    setNewClientEmail('');
    setNewClientSecondaryContact('');
    setNewClientSecondaryPhone('');
    setNewClientAddress('');
    setNewClientCity('');
    setShowNewDeviceInput(false);
    setNewDeviceInput('');
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/65 p-3 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="my-auto w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modern Sleek Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-6 sm:px-7 py-4 sm:py-5 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner shrink-0">
              <Wrench className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">Create Service Job</h2>
                <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-300 border border-blue-500/30 shrink-0">
                  New Call
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {profile?.role === 'engineer'
                  ? 'Log direct or online service call as Engineer'
                  : 'Configure call routing, customer equipment & assign service engineer'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition shrink-0 ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-w-0 w-full">
          
          {/* Scrollable Form Body with overflow-x-hidden */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-36 space-y-4 sm:space-y-5 bg-slate-50/50 min-w-0 w-full">
            
            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-200 p-3.5 sm:p-4 text-sm text-red-700 font-medium flex items-center gap-2.5 shadow-2xs">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* CARD 1: CALL ROUTING & OPERATING BRANCH */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4 min-w-0 w-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                  <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>1. Call Routing & Operating Branch</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400 shrink-0">Step 1 of 4</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                {/* Call Source Segmented Control */}
                <div className="min-w-0">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                    Call Type / Source *
                  </label>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/90 p-1 border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setCallSource('direct')}
                      className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg py-2 px-2.5 text-xs font-bold transition truncate ${
                        callSource === 'direct'
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <UserCheck className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Direct Call</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCallSource('online')}
                      className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg py-2 px-2.5 text-xs font-bold transition truncate ${
                        callSource === 'online'
                          ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Online Call</span>
                    </button>
                  </div>
                </div>

                {/* Operating Branch */}
                <div className="min-w-0">
                  <label htmlFor="create-job-branch-select" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                    Operating Branch *
                  </label>
                  {!canSwitchBranch ? (
                    <div className="flex items-center justify-between rounded-xl bg-slate-100 border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-800">
                      <div className="flex items-center gap-2 truncate">
                        <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">{getBranchName(jobBranch)}</span>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 shrink-0">
                        <Lock className="h-3 w-3" /> Locked
                      </span>
                    </div>
                  ) : (
                    <select
                      id="create-job-branch-select"
                      value={jobBranch}
                      onChange={(e) => {
                        setJobBranch(e.target.value);
                        setEngineerId('');
                        setAssistEngineerId('');
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs truncate"
                    >
                      {branchesList.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Direct Call Sub-options */}
              {callSource === 'direct' && (
                <div className="pt-3 border-t border-slate-100 animate-in fade-in duration-150 min-w-0">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">
                    Service Delivery Mode *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                    <button
                      type="button"
                      onClick={() => setDirectCallType('inboard')}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold border transition truncate ${
                        directCallType === 'inboard'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">🏢 Inboard (In-House / Walk-in)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectCallType('outboard')}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold border transition truncate ${
                        directCallType === 'outboard'
                          ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">🚗 Outboard (On-Site / Field Visit)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* CARD 2: CLIENT & EQUIPMENT INFORMATION */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4 min-w-0 w-full overflow-visible relative z-30">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                  <Users className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>2. Customer & Equipment Details</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400 shrink-0">Step 2 of 4</span>
              </div>

              {/* Client Selection with Instant Direct Search & Filter */}
              <div className="min-w-0 w-full">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                  Customer / Client *
                </label>
                {!showNewClient ? (
                  <div ref={clientDropdownRef} className="relative min-w-0 w-full">
                    {/* Backdrop to close combobox popover */}
                    {isClientDropdownOpen && (
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsClientDropdownOpen(false)}
                      />
                    )}

                    <div className="flex items-center gap-2 min-w-0 w-full">
                      {selectedClient ? (
                        /* Selected Client Card */
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-2.5 rounded-xl border border-blue-300 bg-blue-50/70 px-3.5 py-2 text-xs sm:text-sm shadow-2xs">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 truncate">
                            <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                              {selectedClient.client_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1 truncate">
                              <div className="flex items-center gap-2 truncate">
                                <span className="font-bold text-slate-900 truncate text-sm">
                                  {selectedClient.client_name}
                                </span>
                                {selectedClient.company_name && (
                                  <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200 shrink-0 truncate max-w-[150px]">
                                    {selectedClient.company_name}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 truncate">
                                {selectedClient.phone && <span className="font-mono font-semibold text-slate-700">📞 {selectedClient.phone}</span>}
                                {selectedClient.city && <span>📍 {selectedClient.city}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setClientId('');
                                setDeviceId('');
                                setClientSearchQuery('');
                                setIsClientDropdownOpen(true);
                              }}
                              className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-100/70 px-2.5 py-1 rounded-lg border border-blue-200 transition shadow-2xs"
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setClientId('');
                                setDeviceId('');
                                setClientSearchQuery('');
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition"
                              title="Clear selection"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Direct Active Search Input */
                        <div className="relative flex-1 min-w-0">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={clientSearchQuery}
                            onFocus={() => setIsClientDropdownOpen(true)}
                            onChange={(e) => {
                              setClientSearchQuery(e.target.value);
                              setIsClientDropdownOpen(true);
                            }}
                            placeholder="Type customer name, mobile, company, or city..."
                            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-9 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs font-medium"
                          />
                          {clientSearchQuery ? (
                            <button
                              type="button"
                              onClick={() => setClientSearchQuery('')}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* New Customer Action */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewClient(true);
                          setIsClientDropdownOpen(false);
                        }}
                        className="shrink-0 flex items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 border border-blue-200 transition shadow-2xs whitespace-nowrap"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">New Customer</span>
                        <span className="sm:hidden">New</span>
                      </button>
                    </div>

                    {/* High-Contrast Floating Popover */}
                    {isClientDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 min-w-0">
                        <div className="p-2.5 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setClientFilterMode('all')}
                              className={`px-2 py-0.5 rounded-lg font-bold text-[11px] transition ${
                                clientFilterMode === 'all'
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              All ({clients.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setClientFilterMode('phone')}
                              className={`px-2 py-0.5 rounded-lg font-bold text-[11px] transition ${
                                clientFilterMode === 'phone'
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              With Phone
                            </button>
                            <button
                              type="button"
                              onClick={() => setClientFilterMode('devices')}
                              className={`px-2 py-0.5 rounded-lg font-bold text-[11px] transition ${
                                clientFilterMode === 'devices'
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              With Machines
                            </button>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {filteredClients.length} match{filteredClients.length === 1 ? '' : 'es'}
                          </span>
                        </div>

                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                          {filteredClients.length > 0 ? (
                            filteredClients.map((c) => {
                              const isSelected = c.id === clientId;
                              return (
                                <div
                                  key={c.id}
                                  onClick={() => handleSelectClient(c)}
                                  className={`p-3 hover:bg-blue-50/80 cursor-pointer transition flex items-center justify-between gap-2.5 text-xs ${
                                    isSelected ? 'bg-blue-50/90 font-semibold' : ''
                                  }`}
                                >
                                  <div className="min-w-0 flex-1 truncate">
                                    <div className="flex items-center gap-2 truncate">
                                      <span className="font-bold text-slate-900 text-sm truncate">{c.client_name}</span>
                                      {c.company_name && (
                                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200 shrink-0 truncate max-w-[160px]">
                                          {c.company_name}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 mt-1 text-[11px]">
                                      {c.phone && <span className="font-mono font-medium text-slate-700">📞 {c.phone}</span>}
                                      {c.city && <span>📍 {c.city}</span>}
                                      {c.address && <span className="text-slate-400 truncate max-w-[180px]">{c.address}</span>}
                                    </div>
                                  </div>
                                  <div className="shrink-0 flex items-center gap-2">
                                    {c.device_ids && (
                                      <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                        🏷️ {c.device_ids.split(/[,\n;]/).filter(Boolean).length} Dev
                                      </span>
                                    )}
                                    {isSelected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="p-5 text-center text-xs text-slate-500 space-y-2">
                              <p className="font-medium text-slate-600">No customers found matching "{clientSearchQuery}"</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewClientName(clientSearchQuery);
                                  setShowNewClient(true);
                                  setIsClientDropdownOpen(false);
                                }}
                                className="inline-flex items-center gap-1.5 font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 text-xs shadow-2xs"
                              >
                                <Plus className="h-3.5 w-3.5" /> Register new customer "{clientSearchQuery}"
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4 animate-in fade-in duration-150 min-w-0 w-full">
                    <div className="flex justify-between items-center pb-2 border-b border-blue-200/60">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5 text-blue-600" /> New Customer Registration
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowNewClient(false)}
                        className="text-xs font-bold text-blue-700 hover:underline"
                      >
                        ← Back to existing list
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                      <input
                        id="new-client-name"
                        name="new_client_name"
                        type="text"
                        placeholder="Client name *"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 min-w-0 w-full"
                      />
                      <input
                        id="new-client-company"
                        name="new_client_company"
                        type="text"
                        placeholder="Company name"
                        value={newClientCompany}
                        onChange={(e) => setNewClientCompany(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 min-w-0 w-full"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                      <input
                        id="new-client-phone"
                        name="new_client_phone"
                        type="text"
                        placeholder="Primary Phone *"
                        value={newClientPhone}
                        onChange={(e) => setNewClientPhone(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 min-w-0 w-full"
                      />
                      <input
                        id="new-client-email"
                        name="new_client_email"
                        type="email"
                        placeholder="Email (Optional)"
                        value={newClientEmail}
                        onChange={(e) => setNewClientEmail(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 min-w-0 w-full"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                      <input
                        id="new-client-secondary-contact"
                        name="new_client_secondary_contact"
                        type="text"
                        placeholder="Contact Person (Optional)"
                        value={newClientSecondaryContact}
                        onChange={(e) => setNewClientSecondaryContact(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 min-w-0 w-full"
                      />
                      <input
                        id="new-client-secondary-phone"
                        name="new_client_secondary_phone"
                        type="tel"
                        placeholder="Contact Mobile No. (Optional)"
                        value={newClientSecondaryPhone}
                        onChange={(e) => setNewClientSecondaryPhone(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 font-mono min-w-0 w-full"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                      <input
                        id="new-client-address"
                        name="new_client_address"
                        type="text"
                        placeholder="Site Address"
                        value={newClientAddress}
                        onChange={(e) => setNewClientAddress(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 min-w-0 w-full"
                      />
                      <input
                        id="new-client-city"
                        name="new_client_city"
                        type="text"
                        placeholder="City"
                        value={newClientCity}
                        onChange={(e) => setNewClientCity(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 min-w-0 w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Device Selector & Quick Chips */}
              <div className="min-w-0 w-full">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="create-job-device" className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 truncate">
                    <Cpu className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <span>Target Device / Machine Tag</span>
                  </label>
                  {clientId && !showNewClient && (
                    <button
                      type="button"
                      onClick={handleOpenNewDevice}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" /> Register New Tag
                    </button>
                  )}
                </div>

                {(() => {
                  const selectedClientObj = clients.find((c) => c.id === clientId);
                  const clientDevs = parseClientDevices(selectedClientObj);

                  if (clientDevs.length > 0) {
                    return (
                      <select
                        id="create-job-device"
                        name="device_id"
                        value={deviceId}
                        onChange={(e) => {
                          if (e.target.value === '__new_device__') {
                            handleOpenNewDevice();
                          } else {
                            setDeviceId(e.target.value);
                          }
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs truncate min-w-0"
                      >
                        <option value="">-- Choose Registered Device --</option>
                        {clientDevs.map((d) => {
                          const info = getDeviceContractInfo(d);
                          const cLabel = info.isExpired
                            ? 'Expired (NC)'
                            : d.contract_type === 'amc'
                            ? 'AMC Active'
                            : d.contract_type === 'warranty'
                            ? 'Warranty Active'
                            : 'Standard / NC';
                          return (
                            <option key={d.device_id} value={d.device_id}>
                              {d.device_id} • [{cLabel}]
                            </option>
                          );
                        })}
                        {clientDevs.length > 1 && (
                          <option value={clientDevs.map((d) => d.device_id).join(', ')}>
                            ★ All Registered Devices ({clientDevs.length})
                          </option>
                        )}
                        <option value="__new_device__" className="text-blue-600 font-bold bg-blue-50">
                          ➕ + Register New Device Tag...
                        </option>
                      </select>
                    );
                  }

                  return (
                    <input
                      id="create-job-device"
                      name="device_id"
                      type="text"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      placeholder="e.g. ICS-DEV-101, Dell Inspiron..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs min-w-0"
                    />
                  );
                })()}
              </div>

              {/* Inline Register New Device Drawer */}
              {showNewDeviceInput && (
                <div className="rounded-2xl border border-blue-300 bg-blue-50/70 p-3.5 sm:p-4 space-y-2.5 shadow-xs animate-in fade-in duration-150 min-w-0 w-full">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 uppercase tracking-wider truncate">
                      <Cpu className="h-4 w-4 text-blue-600 shrink-0" />
                      <span>Register Machine Tag to Customer Profile</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNewDeviceInput(false)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-blue-100 hover:text-slate-600 transition shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="text"
                      value={newDeviceInput}
                      onChange={(e) => setNewDeviceInput(e.target.value)}
                      placeholder="e.g. ICS-DEV-103 or custom serial / tag..."
                      className="flex-1 rounded-xl border border-blue-300 bg-white px-3.5 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-blue-600 shadow-2xs min-w-0"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRegisterNewDevice();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleRegisterNewDevice}
                      disabled={!newDeviceInput.trim() || registeringDevice}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-xs flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {registeringDevice ? 'Saving...' : 'Add Tag'}
                    </button>
                  </div>
                </div>
              )}

              {/* Interactive Device Chips & Coverage Preview */}
              {(() => {
                const selectedClientObj = clients.find((c) => c.id === clientId);
                const clientDevs = parseClientDevices(selectedClientObj);
                if (clientDevs.length === 0) return null;

                const selectedList = (deviceId || '').split(/[,\n;]/).map((d) => d.trim()).filter(Boolean);
                const selectedObjs = clientDevs.filter((d) => selectedList.includes(d.device_id));

                return (
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 space-y-2.5 min-w-0 w-full">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">
                        Quick Select Machine Tag:
                      </span>
                      {clientDevs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = clientDevs.map((d) => d.device_id).join(', ');
                            setDeviceId(deviceId === allIds ? '' : allIds);
                          }}
                          className="text-[11px] font-bold text-blue-600 hover:underline shrink-0"
                        >
                          {deviceId === clientDevs.map((d) => d.device_id).join(', ') ? 'Clear All' : 'Select All Tags'}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 min-w-0">
                      {clientDevs.map((d) => {
                        const isSelected = selectedList.includes(d.device_id);
                        const info = getDeviceContractInfo(d);
                        return (
                          <button
                            key={d.device_id}
                            type="button"
                            onClick={() => {
                              if (selectedList.includes(d.device_id)) {
                                const rem = selectedList.filter((x) => x !== d.device_id);
                                setDeviceId(rem.join(', '));
                              } else {
                                const next = [...selectedList, d.device_id];
                                setDeviceId(next.join(', '));
                              }
                            }}
                            className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold border transition shadow-2xs ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <span>{d.device_id}</span>
                            <span
                              className={`rounded px-1 py-0.5 text-[9px] font-sans font-extrabold uppercase ${
                                isSelected
                                  ? 'bg-blue-800/80 text-blue-100'
                                  : info.isExpired
                                  ? 'bg-red-100 text-red-700'
                                  : d.contract_type === 'amc'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : d.contract_type === 'warranty'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {info.isExpired ? 'Expired' : d.contract_type === 'amc' ? 'AMC' : d.contract_type === 'warranty' ? 'Warranty' : 'NC'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedObjs.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/80 flex flex-wrap gap-2 min-w-0">
                        {selectedObjs.map((d) => {
                          const info = getDeviceContractInfo(d);
                          return (
                            <div
                              key={d.device_id}
                              className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-md border border-slate-200 font-mono text-[11px] truncate max-w-full"
                            >
                              <span className="font-bold text-slate-900 truncate">{d.device_id}:</span>
                              <span
                                className={`font-bold shrink-0 ${
                                  info.isExpired
                                    ? 'text-red-600'
                                    : info.isExpiringSoon
                                    ? 'text-amber-700'
                                    : d.contract_type === 'amc'
                                    ? 'text-indigo-700'
                                    : d.contract_type === 'warranty'
                                    ? 'text-emerald-700'
                                    : 'text-slate-600'
                                }`}
                              >
                                {info.statusLabel}
                              </span>
                              <span className="text-slate-400 font-sans text-[10px] shrink-0">
                                ({info.dateRangeLabel})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* CARD 3: PROBLEM DIAGNOSIS & ISSUE DETAILS */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4 min-w-0 w-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>3. Problem Diagnosis & Priority</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400 shrink-0">Step 3 of 4</span>
              </div>

              <div className="space-y-3.5 min-w-0">
                <div className="min-w-0">
                  <label htmlFor="create-job-title" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                    Issue Title / Complaint *
                  </label>
                  <input
                    id="create-job-title"
                    name="issue_title"
                    type="text"
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    placeholder="e.g. Desktop not powering on, OS corrupt, thermal shutdown..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-semibold shadow-2xs min-w-0"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="create-job-description" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                    Detailed Symptoms / Work Scope (Optional)
                  </label>
                  <textarea
                    id="create-job-description"
                    name="issue_description"
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    rows={2}
                    placeholder="Provide any client remarks, symptoms or specific checklist for the technician..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs min-w-0"
                  />
                </div>

                {/* Modern Priority Selector */}
                <div className="min-w-0">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                    Call Priority Level *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                    {[
                      { id: 'low', label: 'Low', color: 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-emerald-500', dot: 'bg-emerald-500' },
                      { id: 'medium', label: 'Medium', color: 'bg-blue-50 text-blue-800 border-blue-300 ring-blue-500', dot: 'bg-blue-500' },
                      { id: 'high', label: 'High', color: 'bg-amber-50 text-amber-800 border-amber-300 ring-amber-500', dot: 'bg-amber-500' },
                      { id: 'urgent', label: 'Urgent', color: 'bg-rose-50 text-rose-800 border-rose-300 ring-rose-500', dot: 'bg-rose-500' },
                    ].map((p) => {
                      const isSelected = priority === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPriority(p.id as JobPriority)}
                          className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold border transition shadow-2xs truncate ${
                            isSelected
                              ? `${p.color} ring-2 shadow-xs`
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${p.dot} shrink-0`}></span>
                          <span className="truncate">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 4: ENGINEER ASSIGNMENT & SCHEDULE */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4 min-w-0 w-full overflow-visible relative z-20">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                  <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>4. Engineer Assignment & Dispatch Schedule</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400 shrink-0">Step 4 of 4</span>
              </div>

              {/* Primary Engineer with Instant Direct Search & Filter */}
              <div className="min-w-0 w-full">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                    Assign Primary Service Engineer *
                  </label>
                  {selectedEngineer && (
                    <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      ✓ Engineer Assigned
                    </span>
                  )}
                </div>

                <div ref={engineerDropdownRef} className="relative min-w-0 w-full">
                  {selectedEngineer ? (
                    /* Selected Engineer Card */
                    <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-blue-400/80 bg-gradient-to-r from-blue-50/90 via-blue-50/50 to-indigo-50/50 p-3 text-xs sm:text-sm shadow-sm">
                      <div className="flex items-center gap-3 min-w-0 flex-1 truncate">
                        <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                          {selectedEngineer.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1 truncate">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200 text-xs shrink-0">
                              {selectedEngineer.employee_id || `EMP-${selectedEngineer.id.slice(0, 5).toUpperCase()}`}
                            </span>
                            <span className="font-extrabold text-slate-900 truncate text-sm">
                              {selectedEngineer.full_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 truncate">
                            <span>📧 {selectedEngineer.email}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEngineerId('');
                            setEngineerSearchQuery('');
                            setIsEngineerDropdownOpen(true);
                          }}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition shadow-2xs"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEngineerId('');
                            setEngineerSearchQuery('');
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition"
                          title="Clear selection"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Direct Active Search Input */
                    <div className="relative min-w-0 w-full">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={engineerSearchQuery}
                        onFocus={() => setIsEngineerDropdownOpen(true)}
                        onChange={(e) => {
                          setEngineerSearchQuery(e.target.value);
                          setIsEngineerDropdownOpen(true);
                        }}
                        placeholder={`Search field engineer in ${getBranchName(jobBranch)} by name, ID, or email...`}
                        className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-9 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs font-medium"
                      />
                      {engineerSearchQuery ? (
                        <button
                          type="button"
                          onClick={() => setEngineerSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEngineerDropdownOpen(!isEngineerDropdownOpen)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${isEngineerDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Engineer Search Popover */}
                  {isEngineerDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 min-w-0">
                      <div className="p-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500 font-semibold px-3.5">
                        <span>{filteredEngineers.length} active engineer{filteredEngineers.length === 1 ? '' : 's'} available</span>
                        <span className="text-slate-400 text-[11px]">{getBranchName(jobBranch)}</span>
                      </div>

                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {filteredEngineers.length > 0 ? (
                          filteredEngineers.map((e) => {
                            const isSelected = e.id === engineerId;
                            return (
                              <div
                                key={e.id}
                                onClick={() => handleSelectEngineer(e)}
                                className={`p-3 hover:bg-blue-50/80 cursor-pointer transition flex items-center justify-between gap-2.5 text-xs ${
                                  isSelected ? 'bg-blue-50/90 font-semibold' : ''
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0 truncate">
                                  <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                                    {e.full_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 truncate">
                                    <div className="flex items-center gap-2 truncate">
                                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[11px] shrink-0">
                                        {e.employee_id || `EMP-${e.id.slice(0, 5).toUpperCase()}`}
                                      </span>
                                      <span className="font-bold text-slate-900 truncate text-sm">{e.full_name}</span>
                                    </div>
                                    <span className="text-[11px] text-slate-400 truncate block mt-0.5">{e.email}</span>
                                  </div>
                                </div>
                                {isSelected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-4 text-center text-xs text-slate-500">
                            No active engineers found matching "{engineerSearchQuery}" in {getBranchName(jobBranch)}.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {branchEngineers.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-amber-600 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    No active engineers found registered under {getBranchName(jobBranch)}.
                  </p>
                )}
              </div>

              {/* Assist Call Card */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-3 min-w-0 w-full">
                <div className="flex items-center justify-between">
                  <label htmlFor="create-job-assist-call-checkbox" className="flex items-center gap-2.5 cursor-pointer select-none min-w-0">
                    <input
                      id="create-job-assist-call-checkbox"
                      type="checkbox"
                      checked={isAssistCall}
                      onChange={(e) => {
                        setIsAssistCall(e.target.checked);
                        if (!e.target.checked) {
                          setAssistEngineerId('');
                          setAssistNotes('');
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 truncate">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 truncate">
                        <span>🤝 Companion / Assist Call</span>
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200 uppercase shrink-0">
                          2 Engineers
                        </span>
                      </span>
                      <p className="text-[11px] text-slate-500 truncate">
                        Enable if a secondary engineer accompanies the lead engineer to this site.
                      </p>
                    </div>
                  </label>
                </div>

                {isAssistCall && (
                  <div className="pt-3 border-t border-indigo-100 space-y-3 animate-in fade-in duration-150 min-w-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                      <div className="min-w-0">
                        <label htmlFor="create-job-assist-engineer" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-indigo-900 truncate">
                          Select Assist Engineer *
                        </label>
                        <select
                          id="create-job-assist-engineer"
                          value={assistEngineerId}
                          onChange={(e) => setAssistEngineerId(e.target.value)}
                          className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs truncate min-w-0"
                        >
                          <option value="">-- Choose Companion Engineer --</option>
                          {engineers
                            .filter((e) => e.id !== engineerId)
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                [{e.employee_id || `EMP-${e.id.slice(0, 5).toUpperCase()}`}] {e.full_name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="min-w-0">
                        <label htmlFor="create-job-assist-notes" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-indigo-900 truncate">
                          Assist Role / Purpose
                        </label>
                        <input
                          id="create-job-assist-notes"
                          type="text"
                          value={assistNotes}
                          onChange={(e) => setAssistNotes(e.target.value)}
                          placeholder="e.g. Hardware install assist, Heavy lift..."
                          className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs min-w-0"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Schedule Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                <div className="min-w-0">
                  <label htmlFor="create-job-date" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                    Scheduled Date *
                  </label>
                  <input
                    id="create-job-date"
                    name="scheduled_date"
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs min-w-0"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="create-job-time" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 truncate">
                    Scheduled Time Slot
                  </label>
                  <input
                    id="create-job-time"
                    name="scheduled_time"
                    type="text"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    placeholder="e.g. 10:30 AM, 02:00 PM..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs min-w-0"
                  />
                </div>
              </div>

              {/* Attribution Meta Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 min-w-0">
                <div className="min-w-0">
                  <label htmlFor="create-job-assigner" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">
                    Assigned By
                  </label>
                  <input
                    id="create-job-assigner"
                    name="assigned_by_name"
                    type="text"
                    value={assignedByName}
                    onChange={(e) => setAssignedByName(e.target.value)}
                    placeholder="e.g. Bala, Coordinator..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 min-w-0"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="create-job-caller" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">
                    Call Given By / Caller
                  </label>
                  <input
                    id="create-job-caller"
                    name="call_given_by"
                    type="text"
                    value={callGivenBy}
                    onChange={(e) => setCallGivenBy(e.target.value)}
                    placeholder="e.g. Manager, Front Desk..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 min-w-0"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="create-job-notes" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">
                    Internal Notes
                  </label>
                  <input
                    id="create-job-notes"
                    name="admin_notes"
                    type="text"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Remarks or instructions..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 min-w-0"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Sticky Action Footer */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-slate-200/90 bg-white px-4 sm:px-7 py-3.5 shadow-lg shrink-0 min-w-0 w-full">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium min-w-0 truncate mr-2">
              <span className="flex items-center gap-1.5 font-bold text-slate-800 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                {callSource === 'direct' ? (directCallType === 'inboard' ? 'Direct Inboard' : 'Direct Outboard') : 'Online Call'}
              </span>
              <span>•</span>
              <span className="font-semibold text-slate-600 truncate">{getBranchName(jobBranch)}</span>
              <span>•</span>
              <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wider px-2 py-0.5 rounded bg-slate-100 border border-slate-200 shrink-0">
                {priority} Priority
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-500/20 active:scale-[0.99] disabled:opacity-60 transition"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Create & Assign Call
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
