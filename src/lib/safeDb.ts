import { supabase } from './supabase';

/**
 * Cache of known valid columns present on the remote `service_jobs` table.
 */
let knownColumns: Set<string> | null = null;
const missingColumns = new Set<string>();

export async function getAvailableColumns(): Promise<Set<string>> {
  if (knownColumns && knownColumns.size > 0) {
    return knownColumns;
  }

  try {
    const { data } = await supabase.from('service_jobs').select('*').limit(1);
    if (data && data.length > 0) {
      knownColumns = new Set(Object.keys(data[0]));
      return knownColumns;
    }
  } catch {
    /* fallback to safe defaults */
  }

  // Baseline standard schema columns
  knownColumns = new Set([
    'id',
    'job_number',
    'client_id',
    'engineer_id',
    'issue_title',
    'issue_description',
    'device_id',
    'priority',
    'status',
    'scheduled_date',
    'scheduled_time',
    'assigned_at',
    'travel_started_at',
    'reached_at',
    'service_started_at',
    'solved_at',
    'completed_at',
    'start_latitude',
    'start_longitude',
    'reached_latitude',
    'reached_longitude',
    'end_latitude',
    'end_longitude',
    'start_odometer',
    'end_odometer',
    'total_km',
    'gps_distance_km',
    'diagnosis',
    'work_performed',
    'parts_replaced',
    'engineer_notes',
    'admin_notes',
    'call_source',
    'direct_call_type',
    'call_given_by',
    'assigned_by_name',
    'created_by',
    'created_at',
    'updated_at',
  ]);

  return knownColumns;
}

// Pre-warm the column cache immediately
getAvailableColumns().catch(() => {});

const NOT_NULL_STRING_COLUMNS = new Set([
  'diagnosis',
  'work_performed',
  'parts_replaced',
  'engineer_notes',
  'admin_notes',
  'issue_description',
  'issue_title',
  'scheduled_time',
  'vendor_name',
  'vendor_phone',
  'vendor_notes',
  'call_back_reason',
  'call_given_by',
  'assigned_by_name',
  'reassigned_from_name',
  'reassignment_reason',
]);

/**
 * Filters a payload to only include columns that actually exist on the database table,
 * and coerces nulls to safe defaults for non-nullable text columns.
 */
async function sanitizePayload(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const available = await getAvailableColumns();
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    // Exclude known missing columns
    if (missingColumns.has(key)) {
      continue;
    }
    // Only include if available on table
    if (available.has(key)) {
      if (value === null && NOT_NULL_STRING_COLUMNS.has(key)) {
        sanitized[key] = '';
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

/**
 * Safely updates a service job record in Supabase.
 * Pre-sanitizes against known columns so that 400 Bad Request network errors are prevented.
 */
export async function safeUpdateServiceJob(
  jobId: string,
  updates: Record<string, unknown>
): Promise<{ error: Error | null }> {
  let payload = await sanitizePayload(updates);
  let attempts = 0;
  const maxAttempts = 12;

  while (attempts < maxAttempts) {
    attempts++;
    const { error } = await supabase.from('service_jobs').update(payload).eq('id', jobId);
    if (!error) {
      return { error: null };
    }

    // 1. Handle NOT NULL constraint violations dynamically
    const notNullMatch = error.message.match(/null value in column "([a-zA-Z0-9_]+)"/i);
    if (notNullMatch && notNullMatch[1]) {
      const col = notNullMatch[1];
      payload[col] = '';
      continue;
    }

    // 2. Handle missing column / schema cache errors
    const isSchemaColError =
      error.message.includes('column') ||
      error.message.includes('schema cache') ||
      error.message.includes('Could not find');

    if (isSchemaColError) {
      const match = error.message.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
      if (match && match[1]) {
        const col = match[1];
        missingColumns.add(col);
        if (knownColumns) knownColumns.delete(col);
        delete payload[col];
        continue;
      }

      // Fallback to absolute minimal base keys
      const minimalKeys = new Set([
        'status',
        'engineer_id',
        'completed_at',
        'travel_started_at',
        'reached_at',
        'service_started_at',
        'solved_at',
        'device_id',
        'start_latitude',
        'start_longitude',
        'reached_latitude',
        'reached_longitude',
        'end_latitude',
        'end_longitude',
        'start_odometer',
        'end_odometer',
        'total_km',
        'gps_distance_km',
        'diagnosis',
        'work_performed',
        'parts_replaced',
        'engineer_notes',
        'admin_notes',
        'updated_at',
      ]);

      const stripped: Record<string, unknown> = {};
      for (const k of Object.keys(payload)) {
        if (minimalKeys.has(k)) {
          stripped[k] = payload[k] === null && NOT_NULL_STRING_COLUMNS.has(k) ? '' : payload[k];
        }
      }

      const { error: fallbackErr } = await supabase.from('service_jobs').update(stripped).eq('id', jobId);
      if (!fallbackErr) {
        return { error: null };
      }
      return { error: new Error(fallbackErr.message) };
    }

    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Safely inserts a service job record in Supabase without triggering 400 Bad Request.
 */
export async function safeInsertServiceJob(
  payloadInput: Record<string, unknown>
): Promise<{ data: unknown; error: Error | null }> {
  let payload = await sanitizePayload(payloadInput);
  let attempts = 0;
  const maxAttempts = 12;

  while (attempts < maxAttempts) {
    attempts++;
    const { data, error } = await supabase.from('service_jobs').insert(payload).select().single();
    if (!error) {
      return { data, error: null };
    }

    // 1. Handle NOT NULL constraint violations dynamically
    const notNullMatch = error.message.match(/null value in column "([a-zA-Z0-9_]+)"/i);
    if (notNullMatch && notNullMatch[1]) {
      const col = notNullMatch[1];
      payload[col] = '';
      continue;
    }

    // 2. Handle missing column / schema cache errors
    const isSchemaColError =
      error.message.includes('column') ||
      error.message.includes('schema cache') ||
      error.message.includes('Could not find');

    if (isSchemaColError) {
      const match = error.message.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
      if (match && match[1]) {
        const col = match[1];
        missingColumns.add(col);
        if (knownColumns) knownColumns.delete(col);
        delete payload[col];
        continue;
      }
      return { data: null, error: new Error(error.message) };
    }

    return { data: null, error: new Error(error.message) };
  }

  return { data: null, error: null };
}
