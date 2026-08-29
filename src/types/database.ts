export type UserRole = 'admin' | 'engineer';

export type JobStatus =
  | 'assigned'
  | 'traveling'
  | 'reached'
  | 'in_progress'
  | 'solved'
  | 'completed'
  | 'cancelled'
  | 'vendor'
  | 'call_back';

export type JobPriority = 'low' | 'medium' | 'high' | 'urgent';

export type PhotoType = 'before' | 'after' | 'other';

export interface Profile {
  id: string;
  employee_id?: string | null;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  joining_date?: string | null; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  client_code?: string | null;
  client_name: string;
  company_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  vendor_name: string;
  contact_person?: string | null;
  phone: string;
  email?: string | null;
  service_type?: string | null;
  address?: string | null;
  city?: string | null;
  gstin?: string | null;
  is_active?: boolean;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ServiceJob {
  id: string;
  job_number: string;
  client_id: string;
  engineer_id: string | null;
  issue_title: string;
  issue_description: string;
  priority: JobPriority;
  status: JobStatus;
  scheduled_date: string;
  scheduled_time: string;
  assigned_at: string | null;
  travel_started_at: string | null;
  reached_at: string | null;
  service_started_at: string | null;
  solved_at: string | null;
  completed_at: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  reached_latitude: number | null;
  reached_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  start_odometer: number | null;
  end_odometer: number | null;
  total_km: number | null;
  gps_distance_km: number | null;
  diagnosis: string;
  work_performed: string;
  parts_replaced: string;
  engineer_notes: string;
  admin_notes: string;
  // ICS Physical Call Report Slip Fields
  call_type?: 'Warranty' | 'ASC' | 'Repeated' | 'Per Call';
  earth_checking?: 'Yes' | 'No';
  physical_damage?: 'Yes' | 'No';
  inspection_charge?: number;
  part_replaced_status?: 'Yes' | 'No';
  part_charge?: number;
  service_charge?: number;
  payment_mode?: 'Cash' | 'Cheque' | 'Online' | 'Credit' | 'UPI';
  amount_received?: 'Yes' | 'No';
  // Additional Workflow Fields
  vendor_name?: string | null;
  vendor_phone?: string | null;
  vendor_notes?: string | null;
  call_back_date?: string | null;
  call_back_time?: string | null;
  call_back_reason?: string | null;
  reassigned_from_id?: string | null;
  reassigned_from_name?: string | null;
  reassignment_reason?: string | null;
  call_given_by?: string | null;
  call_source?: 'online' | 'direct' | null;
  assigned_by_name?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  engineer?: Profile | null;
}

export interface ServiceJobPhoto {
  id: string;
  job_id: string;
  photo_url: string;
  photo_type: PhotoType;
  uploaded_by: string | null;
  created_at: string;
}

export interface JobLocationLog {
  id: string;
  job_id: string;
  engineer_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
}

export interface ServiceHistory {
  id: string;
  client_id: string;
  job_id: string;
  engineer_id: string | null;
  issue: string;
  solution: string;
  service_date: string | null;
  notes: string;
  total_km: number | null;
  created_at: string;
  engineer?: Profile | null;
  job?: ServiceJob;
}

export interface AdminNotification {
  id: string;
  job_id?: string | null;
  job_number?: string | null;
  type: 'reassigned' | 'vendor' | 'call_back' | 'status_change' | 'leave_request' | 'call_request';
  title: string;
  message: string;
  actor_name: string;
  created_at: string;
  read: boolean;
  data?: {
    target_engineer_id?: string;
    target_engineer_name?: string;
    vendor_name?: string;
    vendor_phone?: string;
    call_back_date?: string;
    call_back_time?: string;
    reason?: string;
    leave_id?: string;
    leave_type?: string;
    // Call Request Payload
    client_id?: string;
    client_name?: string;
    client_company?: string;
    client_phone?: string;
    client_email?: string;
    client_address?: string;
    client_city?: string;
    issue_title?: string;
    issue_description?: string;
    priority?: JobPriority;
    call_source?: 'online' | 'direct';
    scheduled_date?: string;
    scheduled_time?: string;
    call_given_by?: string;
    assigned_by_name?: string;
    admin_notes?: string;
    requesting_engineer_id?: string;
    requesting_engineer_name?: string;
  };
}

export type DutyAttendanceStatus =
  | 'on_duty'
  | 'punched_out'
  | 'present'
  | 'late'
  | 'half_day'
  | 'absent'
  | 'on_leave'
  | 'holiday'
  | 'weekly_off';

export interface DutyAttendance {
  id: string;
  engineer_id: string;
  date: string; // YYYY-MM-DD
  punch_in_at: string; // ISO
  punch_in_latitude?: number | null;
  punch_in_longitude?: number | null;
  punch_in_address?: string | null;
  punch_out_at?: string | null; // ISO
  punch_out_latitude?: number | null;
  punch_out_longitude?: number | null;
  punch_out_address?: string | null;
  work_shift?: string;
  total_work_minutes?: number | null;
  overtime_minutes?: number | null;
  total_km?: number | null;
  is_late?: boolean;
  is_half_day?: boolean;
  is_regularized?: boolean;
  regularized_reason?: string | null;
  admin_notes?: string | null;
  status: DutyAttendanceStatus;
}

export type LeaveType = 'casual' | 'sick' | 'earned' | 'half_day' | 'emergency' | 'regularization';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  engineer_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: LeaveStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  admin_remarks?: string | null;
  created_at: string;
  engineer?: Profile | null;
}

export interface AttendancePolicyConfig {
  id: string;
  shift_start_time: string; // e.g. "09:00"
  shift_end_time: string; // e.g. "18:30"
  grace_period_minutes: number; // e.g. 15
  half_day_min_hours: number; // e.g. 4.5
  full_day_min_hours: number; // e.g. 8.0
  weekly_off_days?: number[]; // [0] for Sunday
}

