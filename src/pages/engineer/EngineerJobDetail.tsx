import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { getCurrentPosition, useResilientLocationTracker, type LocationData } from '@/hooks/useLocation';
import type { ServiceJob, ServiceJobPhoto, PhotoType, Client, ClientDevice, JobLocationLog, Profile, Vendor } from '@/types/database';
import { parseClientDevices, getDeviceContractInfo } from '@/lib/clientDevices';
import {
  ArrowLeft,
  Phone,
  MapPin,
  Clock,
  Car,
  Wrench,
  CheckCircle2,
  Camera,
  Loader2,
  Route,
  Navigation,
  UserCheck,
  Building,
  Store,
  PhoneCall,
  X,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Cpu,
} from 'lucide-react';
import {
  formatKm,
  calculateGpsDistance,
  haversineDistance,
  formatDuration,
  fetchRoadDrivingRoute,
  fetchMapMatchedRoute,
} from '@/lib/distance';
import { LiveTrackingMap } from '@/components/maps/LiveTrackingMap';
import { sendCustomerCallReportPdf } from '@/lib/emailReport';
import { addAdminNotification } from '@/lib/notifications';
import { safeUpdateServiceJob } from '@/lib/safeDb';
import { EngineerCreateLeadModal } from '@/components/leads/EngineerCreateLeadModal';
import { fetchAllLeads } from '@/lib/leads';
import type { Lead } from '@/types/database';
import { Sparkles } from 'lucide-react';
import { backgroundKeepAlive } from '@/lib/backgroundKeepAlive';

interface EngineerJobDetailProps {
  jobId: string;
  onBack: () => void;
}

export function EngineerJobDetail({ jobId, onBack }: EngineerJobDetailProps) {
  const { profile } = useAuth();
  const [job, setJob] = useState<ServiceJob | null>(null);
  const [engineersList, setEngineersList] = useState<Profile[]>([]);
  const [photos, setPhotos] = useState<ServiceJobPhoto[]>([]);
  const [routeLogs, setRouteLogs] = useState<JobLocationLog[]>([]);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Service fields
  const [diagnosis, setDiagnosis] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [partsReplaced, setPartsReplaced] = useState('');
  const [engineerNotes, setEngineerNotes] = useState('');

  // Completion fields
  const [manualKm, setManualKm] = useState('');
  const [endOdometer, setEndOdometer] = useState('');
  const [showComplete, setShowComplete] = useState(false);

  // Secondary Action Modals
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [targetEngId, setTargetEngId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorNotes, setVendorNotes] = useState('');

  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackDate, setCallbackDate] = useState(new Date().toISOString().split('T')[0]);
  const [callbackTime, setCallbackTime] = useState('10:00 AM');
  const [callbackReason, setCallbackReason] = useState('');

  // ICS Call Report Slip Fields
  const [callType, setCallType] = useState<'Warranty' | 'ASC' | 'Repeated' | 'Per Call'>('Per Call');
  const [earthChecking, setEarthChecking] = useState<'Yes' | 'No'>('Yes');
  const [physicalDamage, setPhysicalDamage] = useState<'Yes' | 'No'>('No');
  const [inspectionCharge, setInspectionCharge] = useState<string>('');
  const [partReplacedStatus, setPartReplacedStatus] = useState<'Yes' | 'No'>('No');
  const [partCharge, setPartCharge] = useState<string>('');
  const [serviceCharge, setServiceCharge] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Cheque' | 'Online' | 'Credit' | 'UPI'>('Cash');
  const [amountReceived, setAmountReceived] = useState<'Yes' | 'No'>('Yes');

  const [activeDirectConflict, setActiveDirectConflict] = useState<ServiceJob | null>(null);
  const [showCreateLeadModal, setShowCreateLeadModal] = useState(false);
  const [linkedLeads, setLinkedLeads] = useState<Lead[]>([]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`eng-job-detail-${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => {
        load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchAllLeads().then((all) => setLinkedLeads(all.filter((l) => l.service_job_id === jobId)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [jobId, profile?.id]);

  async function load() {
    fetchAllLeads().then((all) => setLinkedLeads(all.filter((l) => l.service_job_id === jobId)));
    const [{ data: jobData }, { data: photoData }, { data: clientData }, { data: logData }, { data: engData }, { data: vendorData }] =
      await Promise.all([
        supabase.from('service_jobs').select('*').eq('id', jobId).maybeSingle(),
        supabase.from('service_job_photos').select('*').eq('job_id', jobId).order('created_at'),
        supabase.from('clients').select('*'),
        supabase.from('job_location_logs').select('*').eq('job_id', jobId).order('recorded_at'),
        supabase.from('profiles').select('*').eq('role', 'engineer').eq('is_active', true).order('full_name'),
        supabase.from('vendors').select('*').eq('is_active', true).order('vendor_name'),
      ]);

    const dbEng = (engData as unknown as Profile[]) || [];
    const engMap = new Map<string, Profile>();
    dbEng.forEach((e) => engMap.set(e.id, e));
    setEngineersList(dbEng);

    const dbVendors = (vendorData as unknown as Vendor[]) || [];
    if (dbVendors.length > 0) {
      setVendorsList(dbVendors);
    } else {
      const cached = localStorage.getItem('ics_local_vendors_cache');
      if (cached) setVendorsList(JSON.parse(cached));
    }

    const dbClients = (clientData as unknown as Client[]) || [];
    const clientMap = new Map<string, Client>();
    dbClients.forEach((c) => clientMap.set(c.id, c));

    let j = jobData as unknown as ServiceJob;
    if (j) {
      j.client = j.client || clientMap.get(j.client_id);
      j.engineer = j.engineer || (j.engineer_id ? engMap.get(j.engineer_id) : null);

      // Auto-set default call_type from device contract if not manually saved on job
      if (j.call_type) {
        setCallType(j.call_type);
      } else {
        const clientDevs = parseClientDevices(j.client);
        const targetId = j.device_id?.split(/[,\n;]/)[0]?.trim();
        const matchedDev = targetId
          ? clientDevs.find((d) => d.device_id.toUpperCase() === targetId.toUpperCase())
          : clientDevs[0];

        if (matchedDev) {
          const info = getDeviceContractInfo(matchedDev);
          if (info.effectiveStatus === 'warranty') {
            setCallType('Warranty');
          } else if (info.effectiveStatus === 'amc') {
            setCallType('ASC');
          } else {
            setCallType('Per Call');
          }
        }
      }
    }

    // Check if engineer has any other active direct call in progress
    let conflict: ServiceJob | null = null;
    if (profile?.id && j && j.call_source !== 'online') {
      const { data: conflictData } = await supabase
        .from('service_jobs')
        .select('id, job_number, status, call_source, client_id, issue_title')
        .eq('engineer_id', profile.id)
        .neq('id', jobId)
        .in('status', ['traveling', 'reached', 'in_progress', 'solved']);

      const found = ((conflictData as unknown as ServiceJob[]) || []).find(
        (cj) => cj.call_source !== 'online'
      );
      if (found) {
        conflict = {
          ...found,
          client: clientMap.get(found.client_id),
        };
      }
    }
    setActiveDirectConflict(conflict);

    let fetchedLogs = (logData as unknown as JobLocationLog[]) || [];
    try {
      const cachedRaw = localStorage.getItem(`ics_logs_${jobId}`);
      if (cachedRaw) {
        const cachedArr: JobLocationLog[] = JSON.parse(cachedRaw);
        if (cachedArr.length > fetchedLogs.length) {
          fetchedLogs = cachedArr;
        }
      }
    } catch {
      // ignore
    }

    setJob(j);
    setPhotos((photoData as unknown as ServiceJobPhoto[]) || []);
    setRouteLogs(fetchedLogs);
    if (fetchedLogs.length > 0) {
      const last = fetchedLogs[fetchedLogs.length - 1];
      setCurrentCoords({ latitude: last.latitude, longitude: last.longitude });
      lastRecordedCoordsRef.current = { latitude: last.latitude, longitude: last.longitude };
    } else if (j?.start_latitude && j?.start_longitude) {
      setCurrentCoords({ latitude: j.start_latitude, longitude: j.start_longitude });
      lastRecordedCoordsRef.current = { latitude: j.start_latitude, longitude: j.start_longitude };
    }
    setDiagnosis(j?.diagnosis || '');
    setWorkPerformed(j?.work_performed || '');
    setPartsReplaced(j?.parts_replaced || '');
    if (j?.total_km) setManualKm(String(j.total_km));
    if (j?.end_odometer) setEndOdometer(String(j.end_odometer));
    if (j?.vendor_name) setVendorName(j.vendor_name);
    if (j?.vendor_phone) setVendorPhone(j.vendor_phone);
    if (j?.vendor_notes) setVendorNotes(j.vendor_notes);
    if (j?.call_back_date) setCallbackDate(j.call_back_date);
    if (j?.call_back_time) setCallbackTime(j.call_back_time);
    if (j?.call_back_reason) setCallbackReason(j.call_back_reason);
    setLoading(false);
  }

  async function updateJob(updates: Record<string, unknown>) {
    const { error: uErr } = await safeUpdateServiceJob(jobId, updates);
    if (uErr) {
      throw new Error(`Database Error: ${uErr.message}`);
    }
    await load();
  }

  // Silent update that doesn't trigger full reload spinner
  async function updateJobSilent(updates: Record<string, unknown>) {
    await safeUpdateServiceJob(jobId, updates);
    setJob((prev) => (prev ? ({ ...prev, ...updates } as ServiceJob) : null));
  }

  // Active tracking state: only when direct call is in traveling status
  const isTrackingActive = job?.status === 'traveling' && job?.call_source !== 'online';
  const lastRecordedCoordsRef = useRef<{ latitude: number; longitude: number; time: number } | null>(null);

  const handleLocationUpdate = useCallback(
    async (loc: LocationData) => {
      if (!profile || !jobId) return;

      const coords = { latitude: loc.latitude, longitude: loc.longitude };
      // Always update live position on map so vehicle pin reflects current location
      setCurrentCoords(coords);

      // 1. Accuracy & Validity Check:
      // Allow up to 120m accuracy (standard mobile GPS outdoors / in pockets / on bikes).
      // Filter out cell-tower triangulation or extreme noise > 120m.
      if (loc.accuracy && loc.accuracy > 120) return;
      if (Math.abs(loc.latitude) < 0.0001 && Math.abs(loc.longitude) < 0.0001) return;

      // 2. Movement vs Stationary Filter (>= 15 meters):
      // Capture points when engineer has moved at least 15m (0.015 km) to faithfully trace roads and turns.
      const nowMs = loc.timestamp || Date.now();
      if (lastRecordedCoordsRef.current) {
        const distFromLast = haversineDistance(
          lastRecordedCoordsRef.current.latitude,
          lastRecordedCoordsRef.current.longitude,
          coords.latitude,
          coords.longitude
        );

        // If distance is less than 15m (0.015 km), do not record duplicate waypoint dot
        if (distFromLast < 0.015) {
          return;
        }

        // Glitch Filter: Speed-based check instead of static 1km check!
        const timeDiffS = Math.max(1, (nowMs - lastRecordedCoordsRef.current.time) / 1000);
        const speedKmh = (distFromLast / timeDiffS) * 3600;

        // In city/suburban driving, jump > 150m at speed > 140 km/h is an obvious GPS multipath glitch
        if (speedKmh > 140 && distFromLast > 0.15) {
          console.warn('Ignoring impossible GPS jump:', distFromLast, 'km at', speedKmh, 'km/h');
          return;
        }
      }

      lastRecordedCoordsRef.current = { latitude: coords.latitude, longitude: coords.longitude, time: nowMs };

      const newLog: JobLocationLog = {
        id: crypto.randomUUID(),
        job_id: jobId,
        engineer_id: profile.id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        recorded_at: new Date().toISOString(),
      };

      setRouteLogs((prev) => {
        const nextLogs = [...prev, newLog];
        try {
          localStorage.setItem(`ics_logs_${jobId}`, JSON.stringify(nextLogs));
        } catch {
          // ignore
        }
        // Calculate exact cumulative KM traveled by engineer from GPS checkpoints (Start -> A -> B -> ... -> End)
        const accumulatedKm = calculateGpsDistance(nextLogs);

        // Periodically update the live cumulative KM on the job record
        updateJobSilent({
          total_km: accumulatedKm,
          gps_distance_km: accumulatedKm,
        });

        return nextLogs;
      });

      try {
        await supabase.from('job_location_logs').insert({
          job_id: jobId,
          engineer_id: profile.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      } catch {
        /* silent - location tracking is best-effort */
      }
    },
    [profile?.id, jobId]
  );

  const {
    gpsStatus,
    accuracy,
    lastUpdate,
    speedKmH,
    wakeLockActive,
    backgroundActive,
    enableBackgroundMode,
    reconnectGps,
  } = useResilientLocationTracker({
    active: isTrackingActive,
    onLocationUpdate: handleLocationUpdate,
    tripTitle: `ICS Job #${job?.job_number || 'Travel'}`,
  });

  async function handleStartTravel() {
    setError(null);
    setSuccess(null);
    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      const isOnline = job?.call_source === 'online';

      if (isOnline) {
        // Online Call: Pure timer start, skip GPS tracking and odometer
        await updateJob({
          status: 'traveling', // On Call state
          travel_started_at: now,
        });
        setSuccess('Online Call Started: Call duration timer is active!');
      } else {
        // Direct Call: Check if engineer is already on call or in field for another direct call
        if (profile?.id) {
          const { data: conflictData } = await supabase
            .from('service_jobs')
            .select('id, job_number, status, call_source, client_id, issue_title')
            .eq('engineer_id', profile.id)
            .neq('id', jobId)
            .in('status', ['traveling', 'reached', 'in_progress', 'solved']);

          const activeDirect = ((conflictData as unknown as ServiceJob[]) || []).find(
            (cj) => cj.call_source !== 'online'
          );

          if (activeDirect) {
            const { data: cData } = await supabase
              .from('clients')
              .select('client_name')
              .eq('id', activeDirect.client_id)
              .maybeSingle();

            const clientName = cData?.client_name || '';
            const statusLabel =
              activeDirect.status === 'traveling' ? 'On Call (Traveling)' : 'In Client Place';

            setError(
              `Cannot start Direct Call: You are already ${statusLabel} for Job #${activeDirect.job_number}${
                clientName ? ` (${clientName})` : ''
              }. Since direct calls involve physical field visits, you cannot put another direct call on call concurrently. Please finish or update your ongoing direct call first.`
            );
            setActiveDirectConflict({
              ...activeDirect,
              client: cData ? ({ client_name: clientName } as Client) : undefined,
            });
            setActionLoading(false);
            return;
          }
        }

        // Direct Call: Physical travel with GPS tracking
        let coords = { latitude: 0, longitude: 0 };
        try {
          coords = await getCurrentPosition();
        } catch {
          /* best effort */
        }

        // Immediately start background keepalive within user click gesture
        backgroundKeepAlive.start(`ICS Job #${job?.job_number || 'Travel'}`).catch(() => {});

        await updateJob({
          status: 'traveling',
          travel_started_at: now,
          start_latitude: coords.latitude || null,
          start_longitude: coords.longitude || null,
        });

        if (coords.latitude && coords.longitude) {
          setCurrentCoords(coords);
          lastRecordedCoordsRef.current = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            time: Date.now(),
          };

          // Save initial starting checkpoint to database
          try {
            await supabase.from('job_location_logs').insert({
              job_id: jobId,
              engineer_id: profile?.id,
              latitude: coords.latitude,
              longitude: coords.longitude,
            });
          } catch {
            /* silent */
          }
        }
        setSuccess('Direct Call Started: Live GPS & road tracking active! (Runs in background)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReached() {
    setError(null);
    setSuccess(null);
    setActionLoading(true);
    try {
      const coords = await getCurrentPosition().catch(() => null);
      const now = new Date().toISOString();

      // If coords available, immediately record reached checkpoint to database
      if (coords && coords.latitude && coords.longitude && profile?.id) {
        try {
          await supabase.from('job_location_logs').insert({
            job_id: jobId,
            engineer_id: profile.id,
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
        } catch {
          /* silent */
        }
      }

      // Fetch full GPS trail with timestamps for accurate map matching
      const { data: logs } = await supabase
        .from('job_location_logs')
        .select('latitude, longitude, recorded_at')
        .eq('job_id', jobId)
        .order('recorded_at');

      const allLogs = (logs as { latitude: number; longitude: number; recorded_at: string }[]) || [];
      if (coords && (allLogs.length === 0 || allLogs[allLogs.length - 1].latitude !== coords.latitude)) {
        allLogs.push({ latitude: coords.latitude, longitude: coords.longitude, recorded_at: now });
      }

      let calcKm = 0;
      if (allLogs.length >= 2) {
        const gpsKm = calculateGpsDistance(allLogs);
        calcKm = gpsKm;
        const matchResult = await fetchMapMatchedRoute(allLogs);
        if (
          matchResult &&
          matchResult.distanceKm > 0 &&
          (gpsKm === 0 || Math.abs(matchResult.distanceKm - gpsKm) <= gpsKm * 0.25)
        ) {
          calcKm = matchResult.distanceKm;
        }
      } else if (job?.start_latitude && job?.start_longitude && coords) {
        // Only 1 or 0 logs — use route API between start and current
        const roadResult = await fetchRoadDrivingRoute(
          job.start_latitude,
          job.start_longitude,
          coords.latitude,
          coords.longitude
        );
        if (roadResult && roadResult.distanceKm > 0) {
          calcKm = roadResult.distanceKm;
        } else {
          calcKm =
            Math.round(
              haversineDistance(job.start_latitude, job.start_longitude, coords.latitude, coords.longitude) * 100
            ) / 100;
        }
      }

      await updateJob({
        status: 'reached',
        reached_at: now,
        service_started_at: now,
        reached_latitude: coords?.latitude || null,
        reached_longitude: coords?.longitude || null,
        total_km: calcKm,
        gps_distance_km: calcKm,
      });
      setSuccess(`In Client Place! Travel KM (${calcKm.toFixed(1)} KM) & travel time recorded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark reached.');
    } finally {
      setActionLoading(false);
    }
  }

  // --- NEW WORKFLOW ACTIONS ---

  // 1. Move to Another Engineer
  async function handleReassignEngineer() {
    if (job?.status === 'vendor') {
      setError('This job is currently under Vendor Handling. Only an Admin can reassign this job back to an engineer with notes.');
      return;
    }
    if (!targetEngId) {
      setError('Please select an engineer to assign this job to.');
      return;
    }
    if (targetEngId === profile?.id) {
      setError('Job is already assigned to you. Please select a different engineer.');
      return;
    }
    setError(null);
    setActionLoading(true);
    try {
      const targetEng = engineersList.find((e) => e.id === targetEngId);
      const updates = {
        engineer_id: targetEngId,
        reassigned_from_id: profile?.id || null,
        reassigned_from_name: profile?.full_name || 'Engineer',
        reassignment_reason: reassignReason || 'Reassigned by engineer',
        status: 'assigned' as const,
      };
      await updateJob(updates);

      // Trigger Admin Notification
      addAdminNotification({
        job_id: jobId,
        job_number: job?.job_number || 'JOB',
        type: 'reassigned',
        title: `Job #${job?.job_number} Moved to Engineer`,
        message: `${profile?.full_name || 'Engineer'} reassigned job to ${targetEng?.full_name || 'another engineer'}.${reassignReason ? ` Reason: ${reassignReason}` : ''}`,
        actor_name: profile?.full_name || 'Engineer',
        data: {
          target_engineer_id: targetEngId,
          target_engineer_name: targetEng?.full_name || '',
          reason: reassignReason,
        },
      });

      setSuccess(`Job successfully transferred to ${targetEng?.full_name || 'new engineer'}!`);
      setShowReassignModal(false);
      setTimeout(() => {
        onBack();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign engineer.');
    } finally {
      setActionLoading(false);
    }
  }

  // 2. Move to Vendor
  async function handleMoveToVendor() {
    if (!vendorName.trim()) {
      setError('Please enter a vendor name.');
      return;
    }
    setError(null);
    setActionLoading(true);
    try {
      const updates = {
        status: 'vendor' as const,
        vendor_name: vendorName.trim(),
        vendor_phone: vendorPhone.trim() || null,
        vendor_notes: vendorNotes.trim() || null,
      };
      await updateJob(updates);

      // Trigger Admin Notification
      addAdminNotification({
        job_id: jobId,
        job_number: job?.job_number || 'JOB',
        type: 'vendor',
        title: `Job #${job?.job_number} Moved to Vendor`,
        message: `${profile?.full_name || 'Engineer'} transferred job to Vendor "${vendorName.trim()}".${vendorNotes ? ` Notes: ${vendorNotes}` : ''}`,
        actor_name: profile?.full_name || 'Engineer',
        data: {
          vendor_name: vendorName.trim(),
          vendor_phone: vendorPhone.trim(),
          reason: vendorNotes,
        },
      });

      setSuccess(`Job marked as handed over to vendor ${vendorName}!`);
      setShowVendorModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move to vendor.');
    } finally {
      setActionLoading(false);
    }
  }

  // 3. Call Back
  async function handleScheduleCallback() {
    if (!callbackDate) {
      setError('Please select a call back date.');
      return;
    }
    setError(null);
    setActionLoading(true);
    try {
      const updates = {
        status: 'call_back' as const,
        call_back_date: callbackDate,
        call_back_time: callbackTime,
        call_back_reason: callbackReason.trim() || null,
        scheduled_date: callbackDate,
        scheduled_time: callbackTime,
      };
      await updateJob(updates);

      // Trigger Admin Notification
      addAdminNotification({
        job_id: jobId,
        job_number: job?.job_number || 'JOB',
        type: 'call_back',
        title: `Job #${job?.job_number} Call Back Scheduled`,
        message: `${profile?.full_name || 'Engineer'} scheduled Call Back for ${callbackDate} at ${callbackTime}.${callbackReason ? ` Note: ${callbackReason}` : ''}`,
        actor_name: profile?.full_name || 'Engineer',
        data: {
          call_back_date: callbackDate,
          call_back_time: callbackTime,
          reason: callbackReason,
        },
      });

      setSuccess(`Call Back scheduled for ${callbackDate} at ${callbackTime}!`);
      setShowCallbackModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule call back.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    if (!workPerformed.trim()) {
      setError('Please enter work performed / action taken.');
      return;
    }

    setError(null);
    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      let endCoords: { latitude: number; longitude: number } | null = null;
      try {
        endCoords = await getCurrentPosition();
      } catch {
        /* optional */
      }

      let finalManualKm = 0;
      if (manualKm && !isNaN(parseFloat(manualKm))) {
        finalManualKm = Math.round(parseFloat(manualKm) * 100) / 100;
      } else if (endOdometer) {
        const endKmVal = parseFloat(endOdometer);
        if (!isNaN(endKmVal) && endKmVal >= 0) {
          if (job?.start_odometer != null && endKmVal >= job.start_odometer) {
            finalManualKm = Math.round((endKmVal - job.start_odometer) * 100) / 100;
          } else {
            finalManualKm = endKmVal;
          }
        }
      } else {
        finalManualKm = job?.total_km || job?.gps_distance_km || 0;
      }

      const finalGpsKm = job?.gps_distance_km || job?.total_km || 0;

      const completedJobPayload: ServiceJob = {
        ...job!,
        status: 'completed',
        completed_at: now,
        end_odometer: endOdometer ? parseFloat(endOdometer) : null,
        total_km: finalManualKm,
        gps_distance_km: finalGpsKm,
        end_latitude: endCoords?.latitude ?? null,
        end_longitude: endCoords?.longitude ?? null,
        diagnosis: (diagnosis || '').trim(),
        work_performed: (workPerformed || '').trim(),
        parts_replaced: (partsReplaced || '').trim(),
        engineer_notes: (engineerNotes || '').trim(),
        call_type: callType,
        earth_checking: earthChecking,
        physical_damage: physicalDamage,
        inspection_charge:
          callType === 'Warranty' || callType === 'ASC'
            ? 0
            : inspectionCharge
            ? parseFloat(inspectionCharge) || 0
            : 0,
        part_replaced_status: partReplacedStatus,
        part_charge: partReplacedStatus === 'Yes' && partCharge ? parseFloat(partCharge) || 0 : 0,
        service_charge:
          callType === 'Warranty' || callType === 'ASC'
            ? 0
            : serviceCharge
            ? parseFloat(serviceCharge) || 0
            : 0,
        payment_mode: paymentMode,
        amount_received: amountReceived,
      };

      // 1. Immediately update database
      await updateJob({
        status: 'completed',
        completed_at: now,
        end_odometer: endOdometer ? parseFloat(endOdometer) : null,
        total_km: finalManualKm,
        gps_distance_km: finalGpsKm,
        end_latitude: endCoords?.latitude ?? null,
        end_longitude: endCoords?.longitude ?? null,
        diagnosis: (diagnosis || '').trim(),
        work_performed: (workPerformed || '').trim(),
        parts_replaced: (partsReplaced || '').trim(),
        engineer_notes: (engineerNotes || '').trim(),
        call_type: callType,
        earth_checking: earthChecking,
        physical_damage: physicalDamage,
        inspection_charge:
          callType === 'Warranty' || callType === 'ASC'
            ? 0
            : inspectionCharge
            ? parseFloat(inspectionCharge) || 0
            : 0,
        part_replaced_status: partReplacedStatus,
        part_charge: partReplacedStatus === 'Yes' && partCharge ? parseFloat(partCharge) || 0 : 0,
        service_charge:
          callType === 'Warranty' || callType === 'ASC'
            ? 0
            : serviceCharge
            ? parseFloat(serviceCharge) || 0
            : 0,
        payment_mode: paymentMode,
        amount_received: amountReceived,
      });

      // 2. Close the complete form modal immediately
      setShowComplete(false);

      // 3. Dispatch PDF report in background
      let emailMessage = '';
      try {
        const emailResult = await sendCustomerCallReportPdf(completedJobPayload);
        if (emailResult?.message) {
          emailMessage = ` 📄 ${emailResult.message}`;
        }
      } catch (e) {
        console.warn('Call report PDF dispatch warning:', e);
      }

      setSuccess(`Job Completed Successfully!${emailMessage}`);

      // 4. Automatically navigate back to engineer jobs list after 1.2 seconds
      setTimeout(() => {
        onBack();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete job.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUploadPhoto(type: PhotoType, file: File) {
    if (!profile) return;
    setError(null);
    try {
      const ext = file.name.split('.').pop();
      const path = `${jobId}/${type}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('service-job-photos').upload(path, file);
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from('service-job-photos').getPublicUrl(path);
      const { error: dbErr } = await supabase.from('service_job_photos').insert({
        job_id: jobId,
        photo_url: urlData.publicUrl,
        photo_type: type,
        uploaded_by: profile.id,
      });
      if (dbErr) throw new Error(dbErr.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    }
  }

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500">Loading job...</p>
      </div>
    );
  if (!job) return <div className="p-4 text-center text-slate-500">Job not found.</div>;

  const status = job.status;

  return (
    <div className="pb-8 max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
      >
        <ArrowLeft className="h-5 w-5" /> Back
      </button>

      {/* Status header */}
      <div className="mb-6 rounded-2xl bg-slate-900 p-5 text-center shadow-lg border border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{job.job_number}</p>
        <div className="mt-2 flex justify-center">
          <StatusBadge status={status} />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Workflow Options Row (Move to Engineer, Move to Vendor, Call Back) */}
      {status !== 'completed' && status !== 'cancelled' && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Engineer Actions & Escalation
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {status === 'vendor' ? (
              <div
                title="Only an Admin can reassign a job under Vendor Handling"
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/90 p-2.5 sm:p-3 text-center opacity-60 cursor-not-allowed select-none"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-400 text-white shadow-sm">
                  <UserCheck className="h-4 w-4" />
                </div>
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 leading-tight">
                  Reassign Engineer <span className="block text-[9px] font-medium text-purple-700">(Admin Only)</span>
                </span>
              </div>
            ) : (
              <button
                onClick={() => {
                  setError(null);
                  setShowReassignModal(true);
                }}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 sm:p-3 text-center transition hover:bg-blue-100 hover:border-blue-300"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                  <UserCheck className="h-4 w-4" />
                </div>
                <span className="text-[11px] sm:text-xs font-bold text-blue-900 leading-tight">
                  Reassign Engineer
                </span>
              </button>
            )}

            <button
              onClick={() => {
                setError(null);
                setShowVendorModal(true);
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50/70 p-2.5 sm:p-3 text-center transition hover:bg-purple-100 hover:border-purple-300"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white shadow-sm">
                <Building className="h-4 w-4" />
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-purple-900 leading-tight">
                {status === 'vendor' ? 'Update Vendor' : 'Handover to Vendor'}
              </span>
            </button>

            <button
              onClick={() => {
                setError(null);
                setShowCallbackModal(true);
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 sm:p-3 text-center transition hover:bg-amber-100 hover:border-amber-300"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white shadow-sm">
                <PhoneCall className="h-4 w-4" />
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-amber-900 leading-tight">
                Schedule Follow-up
              </span>
            </button>
          </div>

          {/* Current Vendor info if already assigned */}
          {job.vendor_name && (
            <div className="mt-3 rounded-xl bg-purple-50 p-3 border border-purple-200 text-xs text-purple-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-purple-950">
                <Building className="h-4 w-4 text-purple-600" /> Current Vendor: {job.vendor_name}
              </p>
              {job.vendor_phone && <p className="text-slate-600">Phone: {job.vendor_phone}</p>}
              {job.vendor_notes && <p className="text-slate-600">Notes: {job.vendor_notes}</p>}
              {status === 'vendor' && (
                <p className="text-[11px] font-semibold text-purple-800 pt-1 border-t border-purple-200/60">
                  🔒 Handed over to vendor. Only an Admin can reassign this job back to an engineer with notes.
                </p>
              )}
            </div>
          )}

          {/* Current Call Back info if scheduled */}
          {job.call_back_date && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900">
              <p className="font-bold flex items-center gap-1.5">
                <PhoneCall className="h-4 w-4 text-amber-600" /> Call Back Scheduled:{' '}
                {job.call_back_date} at {job.call_back_time || 'Scheduled Time'}
              </p>
              {job.call_back_reason && (
                <p className="mt-0.5 text-slate-600">Reason: {job.call_back_reason}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Client info */}
      {(() => {
        const allClientDevices = parseClientDevices(job.client);
        const callDeviceIds = (job.device_id || '')
          .split(/[,\n;]/)
          .map((d) => d.trim())
          .filter(Boolean);

        const callDevices: ClientDevice[] =
          callDeviceIds.length > 0
            ? callDeviceIds.map((id) => {
                const match = allClientDevices.find((cd) => cd.device_id.toUpperCase() === id.toUpperCase());
                return (
                  match || {
                    device_id: id,
                    contract_type: 'non_contract',
                    start_date: null,
                    end_date: null,
                    notes: null,
                  }
                );
              })
            : allClientDevices;

        return (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Client</h2>
            <p className="text-lg font-semibold text-slate-900">{job.client?.client_name}</p>
            <p className="text-sm text-slate-600">{job.client?.company_name}</p>
            <div className="mt-3 space-y-1.5 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {job.client?.address}, {job.client?.city}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Scheduled: {job.scheduled_date} {job.scheduled_time}
              </p>
            </div>

            {/* Device IDs & AMC / Warranty / Non-Contract Status for this Call */}
            <div className="mt-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-slate-50 to-blue-50/90 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                  <Cpu className="h-4 w-4 text-blue-600" />
                  Call Device ID & Contract Status
                </span>
                <span className="text-[10px] text-blue-800 font-bold bg-white px-2 py-0.5 rounded-full border border-blue-200 shadow-2xs">
                  {callDevices.length} {callDevices.length === 1 ? 'Device Assigned' : 'Devices Assigned'}
                </span>
              </div>

              {callDevices.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {callDevices.map((dev) => {
                    const info = getDeviceContractInfo(dev);
                    return (
                      <div
                        key={dev.device_id}
                        className="rounded-xl bg-white p-3 border border-blue-100 shadow-xs flex flex-wrap items-center justify-between gap-2.5"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black text-slate-900">
                              {dev.device_id}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase border tracking-wider ${
                                info.isExpired
                                  ? 'bg-red-100 text-red-800 border-red-300'
                                  : info.isExpiringSoon
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : dev.contract_type === 'amc'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : dev.contract_type === 'warranty'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              {info.isExpired
                                ? 'EXPIRED • NON-CONTRACT'
                                : dev.contract_type === 'amc'
                                ? 'AMC CONTRACT'
                                : dev.contract_type === 'warranty'
                                ? 'WARRANTY'
                                : 'NON-CONTRACT'}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600 font-mono">
                            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>Validity: {info.dateRangeLabel}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
                              info.isExpired
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : info.isExpiringSoon
                                ? 'bg-amber-50 text-amber-800 border border-amber-300'
                                : dev.contract_type === 'non_contract'
                                ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {info.isExpired ? (
                              <>
                                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                                <span>Out of Contract (Chargeable)</span>
                              </>
                            ) : info.isExpiringSoon ? (
                              <>
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                <span>Expires in {info.daysRemaining} days</span>
                              </>
                            ) : dev.contract_type === 'non_contract' ? (
                              <span>Non-Contract (Per-Call Visit)</span>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Active ({info.daysRemaining}d left)</span>
                              </>
                            )}
                          </span>
                          {info.isExpired && (
                            <span className="block text-[10px] text-red-600 font-semibold mt-0.5">
                              Collect inspection & service charges
                            </span>
                          )}
                          {dev.contract_type === 'non_contract' && !info.isExpired && (
                            <span className="block text-[10px] text-slate-500 font-semibold mt-0.5">
                              Chargeable per visit
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg bg-white/80 p-2.5 text-xs text-slate-500 border border-dashed border-blue-200">
                  No registered devices recorded for this client.
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <a
                href={`tel:${job.client?.phone}`}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-semibold text-white hover:bg-green-700"
              >
                <Phone className="h-5 w-5" /> Call Client
              </a>
              {job.client?.latitude && job.client?.longitude && (
                <a
                  href={`https://www.google.com/maps?q=${job.client.latitude},${job.client.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
                >
                  <MapPin className="h-5 w-5" /> Google Maps
                </a>
              )}
            </div>
          </div>
        );
      })()}


      {/* ─── NEW BUSINESS LEAD CREATION CALLOUT (PROMINENT BUTTON) ─── */}
      <div className="mb-4 rounded-2xl border-2 border-dashed border-amber-300 bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-amber-50/90 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 uppercase tracking-wider bg-amber-200/60 px-2 py-0.5 rounded-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" /> New Opportunity?
            </span>
            <h3 className="text-base font-extrabold text-slate-900 mt-1">
              Customer needs CCTV, Computers, Laptops, or AMC?
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Create a sales lead in 30 seconds. You will permanently be recorded as the discovering owner for sales incentive credit.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateLeadModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 py-3 text-xs font-black uppercase text-white shadow-lg shadow-orange-500/25 hover:from-amber-600 hover:to-orange-700 transition shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            <span>+ CREATE NEW LEAD</span>
          </button>
        </div>

        {/* Existing Leads created from this job */}
        {linkedLeads.length > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-200/80 space-y-2">
            <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <span>📋 Leads Generated from this Visit ({linkedLeads.length}):</span>
            </p>
            <div className="grid gap-2">
              {linkedLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-xl bg-white border border-amber-200 p-2.5 text-xs flex items-center justify-between shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-amber-700">{lead.lead_number}</span>
                      <span className="font-semibold text-slate-800">[{lead.lead_category}]</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          lead.priority === 'Hot'
                            ? 'bg-red-100 text-red-700'
                            : lead.priority === 'Warm'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {lead.priority}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] mt-0.5">{lead.requirement}</p>
                  </div>
                  <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                    {lead.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live Map Tracking View (Direct Calls Only) */}
      {job.call_source !== 'online' && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
              <Navigation className="h-4 w-4 text-blue-600 animate-pulse" /> Live Trip Navigation
            </h2>
            <div className="flex items-center gap-2">
              {status === 'traveling' && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    gpsStatus === 'connected'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : gpsStatus === 'searching'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      gpsStatus === 'connected'
                        ? 'bg-emerald-500 animate-pulse'
                        : gpsStatus === 'searching'
                        ? 'bg-amber-500 animate-ping'
                        : 'bg-red-500'
                    }`}
                  />
                  {gpsStatus === 'connected'
                    ? 'GPS Connected'
                    : gpsStatus === 'searching'
                    ? 'GPS Searching...'
                    : gpsStatus === 'denied'
                    ? 'GPS Denied'
                    : 'GPS Signal Lost'}
                </span>
              )}
              {status !== 'traveling' && (
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  {status}
                </span>
              )}
            </div>
          </div>

          {/* Background Travel Notice Banner while traveling */}
          {status === 'traveling' && (
            <div className="mb-2 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 p-3 text-xs text-blue-900 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-[10px] shadow-sm">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40"></span>
                    <span className="relative">GPS</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-blue-950">
                      <span>Screen-Off & Background Tracking Active</span>
                      {backgroundActive && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300">
                          ● Running
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-blue-700 mt-0.5">
                      You can lock your phone screen, keep it in your pocket, or switch to Google Maps. Tracking stays active in the background.
                      {accuracy ? ` (Accuracy ±${accuracy}m)` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!backgroundActive && (
                    <button
                      type="button"
                      onClick={enableBackgroundMode}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-emerald-700 transition"
                      title="Activate background lock-screen audio keepalive"
                    >
                      Enable Background
                    </button>
                  )}
                  {(gpsStatus === 'lost' || gpsStatus === 'searching') && (
                    <button
                      type="button"
                      onClick={reconnectGps}
                      className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-blue-700 shrink-0"
                    >
                      Reconnect
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <LiveTrackingMap
            currentLocation={currentCoords}
            startLocation={
              job.start_latitude && job.start_longitude
                ? { latitude: job.start_latitude, longitude: job.start_longitude }
                : null
            }
            reachedLocation={
              job.reached_latitude && job.reached_longitude
                ? { latitude: job.reached_latitude, longitude: job.reached_longitude }
                : job.end_latitude && job.end_longitude
                ? { latitude: job.end_latitude, longitude: job.end_longitude }
                : null
            }
            clientLocation={
              job.client?.latitude && job.client?.longitude
                ? { latitude: job.client.latitude, longitude: job.client.longitude }
                : null
            }
            clientName={job.client?.client_name}
            clientAddress={job.client?.address}
            engineerName={profile?.full_name || 'Engineer'}
            routeLogs={routeLogs}
            status={job.status}
            gpsStatus={gpsStatus}
            accuracy={accuracy}
            lastUpdate={lastUpdate}
            speedKmH={speedKmH}
            totalKm={job.total_km || job.gps_distance_km}
            onReconnectGps={reconnectGps}
            onRoadDistanceCalculated={(roadKm) => {
              if (
                status === 'traveling' &&
                roadKm > 0
              ) {
                const liveGpsKm = calculateGpsDistance(routeLogs);
                if (liveGpsKm === 0 || Math.abs(roadKm - liveGpsKm) <= liveGpsKm * 0.25) {
                  updateJobSilent({
                    gps_distance_km: roadKm,
                    total_km: roadKm,
                  });
                }
              }
            }}
            height="320px"
          />
        </div>
      )}

      {/* Issue */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">Issue</h2>
        <p className="font-semibold text-slate-900">{job.issue_title}</p>
        <p className="mt-1 text-sm text-slate-600">{job.issue_description || 'No description provided.'}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={job.priority} />
          {job.device_id &&
            (() => {
              const allClientDevs = parseClientDevices(job.client);
              return job.device_id
                .split(/[,\n;]/)
                .map((d) => d.trim())
                .filter(Boolean)
                .map((dev) => {
                  const matched = allClientDevs.find((cd) => cd.device_id.toUpperCase() === dev.toUpperCase());
                  const info = matched ? getDeviceContractInfo(matched) : null;
                  return (
                    <span
                      key={dev}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-mono font-bold border ${
                        info?.isExpired
                          ? 'bg-red-50 text-red-800 border-red-300'
                          : info?.isExpiringSoon
                          ? 'bg-amber-50 text-amber-900 border-amber-300'
                          : matched?.contract_type === 'amc'
                          ? 'bg-blue-50 text-blue-800 border-blue-300'
                          : matched?.contract_type === 'warranty'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-purple-100 text-purple-800 border-purple-200'
                      }`}
                      title={info ? `${dev}: ${info.statusLabel} (${info.dateRangeLabel})` : dev}
                    >
                      <Cpu className="h-3 w-3 text-blue-600" />
                      <span>Device: {dev}</span>
                      <span className="rounded bg-white/90 px-1.5 py-0.2 text-[9px] font-sans font-extrabold uppercase border">
                        {info?.isExpired
                          ? 'Expired (NC)'
                          : matched?.contract_type === 'amc'
                          ? 'AMC'
                          : matched?.contract_type === 'warranty'
                          ? 'Warranty'
                          : 'Non-Contract'}
                      </span>
                    </span>
                  );
                });
            })()}

          {job.call_source && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${job.call_source === 'online' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
              🌐 {job.call_source} Call
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
            👤 Assigned By: <strong className="text-slate-900">{job.assigned_by_name || job.reassigned_from_name || 'Admin'}</strong>
          </span>
          {job.call_given_by && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
              📞 Call Given By: <strong className="text-blue-900">{job.call_given_by}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Dynamic Time & KM Calculation Summary Box */}
      {job.call_source === 'online' ? (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center justify-center gap-1.5">
            <Clock className="h-4 w-4 text-indigo-600 animate-pulse" /> Online Call Duration
          </p>
          <p className="mt-1.5 text-2xl font-black text-indigo-950">
            {job.travel_started_at
              ? formatDuration(
                  job.travel_started_at,
                  job.completed_at || (status === 'traveling' ? new Date().toISOString() : null)
                )
              : 'Not Started'}
          </p>
          <p className="text-[11px] text-indigo-600 mt-0.5 font-medium">
            {status === 'traveling' ? 'Active Call Session in Progress' : status === 'completed' ? 'Total Online Call Time' : 'Call session timer will begin once started'}
          </p>
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-slate-400 flex items-center justify-center gap-1">
              <Car className="h-3 w-3 text-blue-600" /> Travel Time
            </p>
            <p className="mt-1 text-base font-bold text-blue-600">
              {job.travel_started_at
                ? formatDuration(
                    job.travel_started_at,
                    job.reached_at || (status === 'traveling' ? new Date().toISOString() : null)
                  )
                : '—'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-slate-400 flex items-center justify-center gap-1">
              <Route className={`h-3 w-3 text-emerald-600 ${status === 'traveling' ? 'animate-pulse' : ''}`} /> Traveled KM
            </p>
            <p className="mt-1 text-base font-bold text-emerald-600">
              {formatKm(
                routeLogs.length > 1
                  ? calculateGpsDistance(routeLogs)
                  : job.gps_distance_km != null && job.gps_distance_km > 0
                  ? job.gps_distance_km
                  : job.total_km != null && job.total_km > 0
                  ? job.total_km
                  : 0
              )}
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5">
              {status === 'traveling'
                ? 'Updated every 5s'
                : status === 'completed'
                ? 'Total Travel Distance'
                : 'GPS Tracked Distance'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-slate-400 flex items-center justify-center gap-1">
              <Clock className="h-3 w-3 text-amber-600" /> In-Client Time
            </p>
            <p className="mt-1 text-base font-bold text-amber-600">
              {job.reached_at
                ? formatDuration(
                    job.reached_at,
                    job.completed_at ||
                      (status !== 'assigned' && status !== 'traveling' ? new Date().toISOString() : null)
                  )
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Direct Call Conflict Warning Notice */}
      {job.call_source !== 'online' && activeDirectConflict && (status === 'assigned' || status === 'call_back' || status === 'vendor') && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-amber-900 text-sm">
              Active Direct Call In Progress
            </p>
            <p className="mt-1 text-amber-800">
              You are currently <strong>{activeDirectConflict.status === 'traveling' ? 'On Call (Traveling)' : 'In Client Place'}</strong> for direct call <strong>Job #{activeDirectConflict.job_number}</strong>{activeDirectConflict.client?.client_name ? ` (${activeDirectConflict.client.client_name})` : ''}.
            </p>
            <p className="mt-1 text-amber-700 font-medium">
              Because direct calls require physical field visits, you cannot put another direct call on call until your ongoing direct call is completed or updated.
            </p>
          </div>
        </div>
      )}

      {/* Workflow primary actions */}
      {(status === 'assigned' || status === 'call_back' || status === 'vendor') && (
        <div className="mb-4">
          <button
            onClick={handleStartTravel}
            disabled={actionLoading || (job.call_source !== 'online' && !!activeDirectConflict)}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base sm:text-lg font-bold shadow-md transition ${
              job.call_source !== 'online' && activeDirectConflict
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed border border-slate-300'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
            }`}
          >
            {actionLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : job.call_source === 'online' ? (
              <Phone className="h-6 w-6" />
            ) : (
              <Car className="h-6 w-6" />
            )}{' '}
            {job.call_source !== 'online' && activeDirectConflict
              ? 'Cannot Start Call (Another Call In Progress)'
              : status === 'call_back'
              ? 'Resume Service (Follow-up Call)'
              : status === 'vendor'
              ? 'Resume Service (From Vendor)'
              : job.call_source === 'online'
              ? 'Start Online Support Call'
              : 'Start Travel (On Field)'}
          </button>
          {job.call_source !== 'online' && activeDirectConflict && (
            <p className="mt-1.5 text-center text-xs text-amber-700 font-medium">
              Complete or update Job #{activeDirectConflict.job_number} before starting this direct call.
            </p>
          )}
        </div>
      )}

      {/* Online Call: Directly Complete Call (Skip In-Client Place) */}
      {status === 'traveling' && job.call_source === 'online' && (
        <button
          onClick={() => setShowComplete(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base sm:text-lg font-bold text-white hover:bg-emerald-700 shadow-md transition"
        >
          <CheckCircle2 className="h-6 w-6" /> Complete Online Call & Generate Report
        </button>
      )}

      {/* Direct Call: In-Client Place button */}
      {status === 'traveling' && job.call_source !== 'online' && (
        <button
          onClick={handleReached}
          disabled={actionLoading}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 py-4 text-base sm:text-lg font-bold text-white hover:bg-cyan-700 shadow-md disabled:opacity-60 transition"
        >
          {actionLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <MapPin className="h-6 w-6" />}{' '}
          Mark Arrived (At Client Place)
        </button>
      )}

      {/* Direct Call: Complete Call */}
      {(status === 'reached' || status === 'in_progress' || status === 'solved') && (
        <button
          onClick={() => setShowComplete(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base sm:text-lg font-bold text-white hover:bg-emerald-700 shadow-md transition"
        >
          <CheckCircle2 className="h-6 w-6" /> Complete Service & Generate Report
        </button>
      )}

      {/* ----------------- MODAL 1: MOVE TO ANOTHER ENGINEER ----------------- */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <UserCheck className="h-5 w-5 text-blue-400" />
                <h3 className="font-bold text-base">Reassign Service Engineer</h3>
              </div>
              <button
                onClick={() => setShowReassignModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-slate-800">
              <p className="text-xs text-slate-600">
                Select a colleague engineer to hand over Job #{job.job_number}. An alert will be sent to the Admin Panel.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Select Engineer *
                </label>
                <select
                  value={targetEngId}
                  onChange={(e) => setTargetEngId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">-- Choose Engineer --</option>
                  {engineersList
                    .filter((e) => e.id !== profile?.id)
                    .map((eng) => (
                      <option key={eng.id} value={eng.id}>
                        {eng.full_name} ({eng.phone || eng.email})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Reason for Transfer
                </label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. In distant zone, requires motherboard hardware specialist..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowReassignModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleReassignEngineer}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                <span>Confirm Reassignment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 2: MOVE TO VENDOR ----------------- */}
      {showVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <Building className="h-5 w-5 text-purple-400" />
                <h3 className="font-bold text-base">Handover to External Vendor</h3>
              </div>
              <button
                onClick={() => setShowVendorModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-slate-800">
              <p className="text-xs text-slate-600">
                Record the 3rd-party vendor details handling Job #{job.job_number}. Admin will receive a notification.
              </p>

              {vendorsList.length > 0 && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3">
                  <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-purple-900">
                    <span className="flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-purple-600" />
                      Select Registered Vendor Partner
                    </span>
                    <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-1.5 py-0.5 rounded">
                      {vendorsList.length} registered
                    </span>
                  </label>
                  <select
                    onChange={(e) => {
                      const selected = vendorsList.find((v) => v.id === e.target.value);
                      if (selected) {
                        setVendorName(selected.vendor_name);
                        setVendorPhone(selected.phone || '');
                        const specialtyNote = selected.service_type ? `[${selected.service_type}] ` : '';
                        const termNote = selected.notes ? `Terms: ${selected.notes}` : '';
                        setVendorNotes(`${specialtyNote}${termNote}`.trim());
                      }
                    }}
                    className="w-full rounded-xl border border-purple-300 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 shadow-sm"
                  >
                    <option value="">-- Choose From Vendor Directory --</option>
                    {vendorsList.map((v) => (
                      <option key={v.id} value={v.id}>
                        🏪 {v.vendor_name} ({v.service_type || v.city || 'Vendor'}) • {v.phone}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vendor / Service Center Name *
                </label>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g. Dell Authorized Service Center, Motherboard Chip Lab..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vendor Phone / Contact
                </label>
                <input
                  type="text"
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vendor Notes / Work Requested
                </label>
                <textarea
                  value={vendorNotes}
                  onChange={(e) => setVendorNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Sent for BGA chip replacement, estimated delivery 3 days..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowVendorModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveToVendor}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-purple-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building className="h-4 w-4" />}
                <span>Confirm Vendor Handover</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 3: CALL BACK ----------------- */}
      {showCallbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <PhoneCall className="h-5 w-5 text-amber-400" />
                <h3 className="font-bold text-base">Schedule Follow-up Call</h3>
              </div>
              <button
                onClick={() => setShowCallbackModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-slate-800">
              <p className="text-xs text-slate-600">
                Select the next follow-up date and time for client {job.client?.client_name}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Follow-up Date *
                  </label>
                  <input
                    type="date"
                    value={callbackDate}
                    onChange={(e) => setCallbackDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Follow-up Time *
                  </label>
                  <input
                    type="text"
                    value={callbackTime}
                    onChange={(e) => setCallbackTime(e.target.value)}
                    placeholder="e.g. 02:30 PM"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Follow-up Reason / Remarks
                </label>
                <textarea
                  value={callbackReason}
                  onChange={(e) => setCallbackReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Client requested visit after lunch, waiting for spare parts delivery..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowCallbackModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleCallback}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-amber-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                <span>Confirm Follow-up</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion modal with Service Details */}
      {showComplete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-md transition-all">
          <div className="relative my-auto w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight">Complete Call & Send Report</h2>
                  <p className="text-xs text-blue-200">ICS Service Report • #{job.job_number || 'JOB-1001'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowComplete(false)}
                className="rounded-lg bg-white/10 p-1.5 text-slate-300 hover:bg-white/20 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[75vh] overflow-y-auto p-6 space-y-4 text-slate-800">
              {/* Call Type, Earth Checking & Physical Damage Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Call Type
                  </label>
                  <select
                    value={callType}
                    onChange={(e) =>
                      setCallType(e.target.value as unknown as 'Warranty' | 'ASC' | 'Repeated' | 'Per Call')
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="Warranty">Warranty</option>
                    <option value="ASC">ASC</option>
                    <option value="Repeated">Repeated</option>
                    <option value="Per Call">Per Call</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Earth Checking
                  </label>
                  <div className="flex gap-2 mt-1">
                    {(['Yes', 'No'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setEarthChecking(opt)}
                        className={`flex-1 py-1 text-xs font-bold rounded-lg border transition ${
                          earthChecking === opt
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Physical Damage / Scratch
                  </label>
                  <div className="flex gap-2 mt-1">
                    {(['Yes', 'No'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setPhysicalDamage(opt)}
                        className={`flex-1 py-1 text-xs font-bold rounded-lg border transition ${
                          physicalDamage === opt
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <Wrench className="h-3.5 w-3.5 text-blue-600" /> Diagnosis / Issue Found
                </label>
                <textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={2}
                  placeholder="e.g. CPU display issue, faulty RAM module or SMPS failure..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Work Performed / Action Taken *
                </label>
                <textarea
                  value={workPerformed}
                  onChange={(e) => setWorkPerformed(e.target.value)}
                  rows={2}
                  placeholder="e.g. Cleaned RAM slots, replaced CMOS battery, system boot tested OK."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className={`grid grid-cols-1 ${job.call_source !== 'online' ? 'sm:grid-cols-3' : ''} gap-3.5`}>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Parts Replaced / Software
                  </label>
                  <input
                    type="text"
                    value={partsReplaced}
                    onChange={(e) => setPartsReplaced(e.target.value)}
                    placeholder="e.g. Drivers, Patch..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {job.call_source !== 'online' && (
                  <>
                    <div>
                      <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700">
                        <span>Manual KM (Bike) *</span>
                        {job.gps_distance_km ? (
                          <span className="text-[10px] font-mono text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            GPS: {job.gps_distance_km.toFixed(1)} KM
                          </span>
                        ) : null}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={manualKm}
                        onChange={(e) => setManualKm(e.target.value)}
                        placeholder={job.total_km ? `${job.total_km.toFixed(1)}` : 'e.g. 17.0'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 font-bold"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                        End Odometer (Optional)
                      </label>
                      <input
                        type="number"
                        value={endOdometer}
                        onChange={(e) => setEndOdometer(e.target.value)}
                        placeholder="e.g. 12560"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Estimation Approx Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="bg-slate-900 px-3.5 py-2 text-white flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">Estimation Approx</span>
                  <span className="text-[11px] text-blue-300 font-medium">
                    {callType === 'Warranty' || callType === 'ASC'
                      ? `${callType} (Charges Waived)`
                      : 'Chargeable Service'}
                  </span>
                </div>
                <div className="p-3.5 space-y-3 text-xs">
                  {callType !== 'Warranty' && callType !== 'ASC' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-700">
                          Inspection Charge (₹)
                        </label>
                        <input
                          type="number"
                          value={inspectionCharge}
                          onChange={(e) => setInspectionCharge(e.target.value)}
                          placeholder="0"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-700">
                          Service Charge (₹)
                        </label>
                        <input
                          type="number"
                          value={serviceCharge}
                          onChange={(e) => setServiceCharge(e.target.value)}
                          placeholder="0"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-semibold"
                        />
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-800">
                          Part Replaced?
                        </label>
                        <span className="text-[10px] text-slate-500">Were any hardware parts replaced?</span>
                      </div>
                      <div className="flex gap-1.5 w-32">
                        {(['Yes', 'No'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setPartReplacedStatus(opt);
                              if (opt === 'No') setPartCharge('');
                            }}
                            className={`flex-1 py-1 text-xs font-bold rounded-lg border transition ${
                              partReplacedStatus === opt
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {partReplacedStatus === 'Yes' && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-200 animate-in fade-in duration-150">
                        <label className="block text-[11px] font-bold uppercase text-slate-700">
                          Part Amount / Charge (₹) *
                        </label>
                        <input
                          type="number"
                          value={partCharge}
                          onChange={(e) => setPartCharge(e.target.value)}
                          placeholder="Enter part cost (e.g. 1500)"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 font-semibold"
                        />
                      </div>
                    )}
                  </div>

                  {((callType !== 'Warranty' && callType !== 'ASC') ||
                    (partReplacedStatus === 'Yes' && !!partCharge)) && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 animate-in fade-in duration-150">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-700">
                          Payment Mode
                        </label>
                        <select
                          value={paymentMode}
                          onChange={(e) =>
                            setPaymentMode(
                              e.target.value as unknown as 'Cash' | 'Cheque' | 'Online' | 'Credit' | 'UPI'
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI / GPay</option>
                          <option value="Online">Online Transfer</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Credit">Credit</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-700">
                          Amount Received?
                        </label>
                        <div className="flex gap-2 mt-1">
                          {(['Yes', 'No'] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setAmountReceived(opt)}
                              className={`flex-1 py-1 text-xs font-bold rounded-lg border transition ${
                                amountReceived === opt
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Engineer Additional Notes
                </label>
                <textarea
                  value={engineerNotes}
                  onChange={(e) => setEngineerNotes(e.target.value)}
                  rows={1}
                  placeholder="Any customer feedback or warranty notes..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Photo Upload Box */}
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3.5">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <Camera className="h-3.5 w-3.5 text-slate-600" /> Service Completion Photo (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleUploadPhoto('after', e.target.files[0]);
                  }}
                  className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50/80 px-6 py-4">
              <button
                onClick={() => setShowComplete(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 py-2.5 text-sm font-bold text-white shadow-md hover:from-green-700 hover:to-emerald-700 disabled:opacity-60 transition"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>Complete & Send PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-500">
            <Camera className="h-4 w-4" /> Photos
          </h2>
          <div className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <div key={p.id} className="text-center">
                <img
                  src={p.photo_url}
                  alt={p.photo_type}
                  className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                />
                <p className="mt-1 text-xs capitalize text-slate-500">{p.photo_type}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KM info */}
      {status === 'completed' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-slate-500">
            <Route className="h-4 w-4" /> Travel Summary
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Odometer KM</p>
              <p className="text-xl font-bold text-slate-900">{formatKm(job.total_km)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">GPS Distance</p>
              <p className="text-xl font-bold text-slate-900">
                {job.gps_distance_km ? formatKm(job.gps_distance_km) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE NEW LEAD MODAL ─── */}
      {profile && (
        <EngineerCreateLeadModal
          isOpen={showCreateLeadModal}
          onClose={() => setShowCreateLeadModal(false)}
          job={job}
          engineerProfile={profile}
          currentCoords={currentCoords}
          onLeadCreated={(newLead) => {
            setLinkedLeads((prev) => [newLead, ...prev]);
            addAdminNotification({
              job_id: job.id,
              job_number: job.job_number,
              type: 'status_change',
              title: `New Lead Created: ${newLead.lead_number}`,
              message: `${profile.full_name} logged a new ${newLead.lead_category} opportunity for ${job.client?.client_name}.`,
              actor_name: profile.full_name,
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
