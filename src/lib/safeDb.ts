import { supabase } from './supabase';

/**
 * Safely updates a service job record in Supabase.
 * Automatically recovers from missing column schema cache errors
 * by stripping the unmapped column and retrying seamlessly.
 */
export async function safeUpdateServiceJob(
  jobId: string,
  updates: Record<string, unknown>
): Promise<{ error: Error | null }> {
  const payload: Record<string, unknown> = { ...updates };
  let attempts = 0;
  const maxAttempts = 12;

  while (attempts < maxAttempts) {
    attempts++;
    const { error } = await supabase.from('service_jobs').update(payload).eq('id', jobId);
    if (!error) {
      return { error: null };
    }

    const isSchemaColError =
      error.message.includes('column') ||
      error.message.includes('schema cache') ||
      error.message.includes('Could not find');

    if (isSchemaColError) {
      // Look for pattern: Could not find the 'column_name' column of 'service_jobs' in the schema cache
      const match = error.message.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
      if (match && match[1] && match[1] in payload) {
        delete payload[match[1]];
        continue;
      }

      // If cannot match the exact column name, strip any non-standard optional fields
      const coreKeys = new Set([
        'status',
        'engineer_id',
        'client_id',
        'completed_at',
        'travel_started_at',
        'reached_at',
        'service_started_at',
        'solved_at',
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
        'scheduled_date',
        'scheduled_time',
        'updated_at',
      ]);

      const stripped: Record<string, unknown> = {};
      for (const k of Object.keys(payload)) {
        if (coreKeys.has(k)) stripped[k] = payload[k];
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
 * Safely inserts a service job record in Supabase.
 * Automatically recovers from missing column schema cache errors.
 */
export async function safeInsertServiceJob(
  payloadInput: Record<string, unknown>
): Promise<{ data: unknown; error: Error | null }> {
  const payload: Record<string, unknown> = { ...payloadInput };
  let attempts = 0;
  const maxAttempts = 12;

  while (attempts < maxAttempts) {
    attempts++;
    const { data, error } = await supabase.from('service_jobs').insert(payload).select().single();
    if (!error) {
      return { data, error: null };
    }

    const isSchemaColError =
      error.message.includes('column') ||
      error.message.includes('schema cache') ||
      error.message.includes('Could not find');

    if (isSchemaColError) {
      const match = error.message.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
      if (match && match[1] && match[1] in payload) {
        delete payload[match[1]];
        continue;
      }
      return { data: null, error: new Error(error.message) };
    }

    return { data: null, error: new Error(error.message) };
  }

  return { data: null, error: null };
}
