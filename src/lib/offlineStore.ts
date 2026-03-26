import { offlineDb } from './offlineDb';
import { getSyncUserId, scheduleSync, isOnlineNow, supabase } from './offlineSync';
import { requestBackgroundSync } from './pwaFeatures';

const nowIso = () => new Date().toISOString();

// Tables that use different conflict resolution
const TABLE_ON_CONFLICT: Record<string, string> = {
  user_preferences: 'user_id',
  user_settings: 'user_id,key',
};

const normalizeUndefinedToNull = (payload: Record<string, unknown>) => {
  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) {
      next[key] = null;
    }
  }
  return next;
};

// Sanitize payload for certain tables
const sanitizePayload = (table: string, payload: Record<string, unknown>) => {
  let sanitized = { ...payload };
  if (table === 'user_settings' || table === 'user_preferences') {
    delete sanitized.id;
  }
  if (table === 'tasks') {
    sanitized = normalizeUndefinedToNull(sanitized);
  }
  return sanitized;
};

// Immediate upsert to Supabase (returns true if successful)
const upsertToSupabase = async (table: string, payload: Record<string, unknown>): Promise<boolean> => {
  if (!supabase) return false;
  const sanitized = sanitizePayload(table, payload);
  const { error } = await supabase
    .from(table)
    .upsert(sanitized, { onConflict: TABLE_ON_CONFLICT[table] ?? 'id' });
  if (error) {
    console.error(`Immediate sync error for ${table}:`, error.message, error.details);
    return false;
  }
  return true;
};

// Immediate delete from Supabase (returns true if successful)
const deleteFromSupabase = async (table: string, id: string, payload?: Record<string, unknown>): Promise<boolean> => {
  if (!supabase) return false;
  const userId = getSyncUserId();
  
  if (table === 'user_settings' && payload?.key) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)
      .eq('key', payload.key as string);
    return !error;
  }
  if (table === 'user_preferences') {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    return !error;
  }
  if (table === 'profiles') {
    const { error } = await supabase.from(table).delete().eq('id', userId);
    return !error;
  }
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    console.error(`Immediate delete error for ${table}:`, error.message);
    return false;
  }
  return true;
};

export const getLocalRows = async <T extends object>(table: string, userId?: string): Promise<T[]> => {
  const resolvedUserId = userId ?? getSyncUserId();
  const tableRef = offlineDb.table(table);
  if (resolvedUserId) {
    return (await tableRef.where('user_id').equals(resolvedUserId).toArray()) as T[];
  }
  return (await tableRef.toArray()) as T[];
};

export const upsertLocalRow = async <T extends object>(table: string, row: T): Promise<T> => {
  const resolvedUserId = getSyncUserId();
  const timestamp = nowIso();
  const rowRecord = row as Record<string, unknown>;
  const nextRow = {
    ...rowRecord,
    user_id: rowRecord.user_id ?? resolvedUserId ?? rowRecord.user_id,
    created_at: rowRecord.created_at ?? timestamp,
    updated_at: timestamp,
  } as Record<string, unknown>;

  // Save to local DB first
  await offlineDb.table(table).put(nextRow);

  // If online, sync immediately to Supabase and wait for confirmation
  if (isOnlineNow() && supabase && resolvedUserId) {
    const success = await upsertToSupabase(table, nextRow);
    if (success) {
      // Successfully synced - no need for outbox
      return nextRow as T;
    }
    // If immediate sync failed, fall back to outbox for later sync
    console.warn(`Immediate sync failed for ${table}, queuing for later`);
  }

  // Offline or immediate sync failed - add to outbox for later sync
  await offlineDb.outbox.add({
    table,
    operation: 'upsert',
    record_id: String((nextRow as Record<string, unknown>).id),
    payload: nextRow,
    created_at: timestamp,
  });
  scheduleSync();
  // Request background sync for when device comes online
  requestBackgroundSync().catch(() => {});
  return nextRow as T;
};

// Local-only upsert without syncing to Supabase (for initialization/defaults)
export const upsertLocalRowWithoutSync = async <T extends object>(table: string, row: T): Promise<T> => {
  const resolvedUserId = getSyncUserId();
  const timestamp = nowIso();
  const rowRecord = row as Record<string, unknown>;
  const nextRow = {
    ...rowRecord,
    user_id: rowRecord.user_id ?? resolvedUserId ?? rowRecord.user_id,
    created_at: rowRecord.created_at ?? timestamp,
    updated_at: timestamp,
  } as Record<string, unknown>;

  await offlineDb.table(table).put(nextRow);
  // Don't add to outbox - this is local-only
  return nextRow as T;
};

export const deleteLocalRow = async (table: string, id: string, payload?: Record<string, unknown>) => {
  const timestamp = nowIso();
  const resolvedUserId = getSyncUserId();
  
  // Delete from local DB first
  await offlineDb.table(table).delete(id);
  
  const payloadWithTimestamp = {
    ...(payload ?? {}),
    updated_at: timestamp,
  };

  // If online, sync immediately to Supabase and wait for confirmation
  if (isOnlineNow() && supabase && resolvedUserId) {
    const success = await deleteFromSupabase(table, id, payloadWithTimestamp);
    if (success) {
      // Successfully synced - no need for outbox
      return;
    }
    // If immediate sync failed, fall back to outbox for later sync
    console.warn(`Immediate delete failed for ${table}, queuing for later`);
  }

  // Offline or immediate sync failed - add to outbox for later sync
  await offlineDb.outbox.add({
    table,
    operation: 'delete',
    record_id: id,
    payload: payloadWithTimestamp,
    created_at: timestamp,
  });
  scheduleSync();
  // Request background sync for when device comes online
  requestBackgroundSync().catch(() => {});
};

export const bulkPutLocalRows = async (table: string, rows: any[]) => {
  if (rows.length === 0) return;
  await offlineDb.table(table).bulkPut(rows);
};

// Clear all local rows for a user in a table (used before syncing from remote)
export const clearLocalRowsForUser = async (table: string, userId?: string): Promise<void> => {
  const resolvedUserId = userId ?? getSyncUserId();
  if (!resolvedUserId) return;
  const tableRef = offlineDb.table(table);
  await tableRef.where('user_id').equals(resolvedUserId).delete();
};

// Smart merge that respects updated_at - only overwrites if remote is newer
export const mergeRemoteRows = async (
  table: string, 
  remoteRows: Record<string, unknown>[],
  idField: string = 'id'
): Promise<Record<string, unknown>[]> => {
  if (remoteRows.length === 0) return [];
  
  const tableRef = offlineDb.table(table);
  const mergedRows: Record<string, unknown>[] = [];
  
  for (const remoteRow of remoteRows) {
    const id = remoteRow[idField] as string;
    if (!id) {
      // No ID, just add it
      mergedRows.push(remoteRow);
      continue;
    }
    
    // Get local row
    const localRow = await tableRef.get(id) as Record<string, unknown> | undefined;
    
    if (!localRow) {
      // No local row, use remote
      mergedRows.push(remoteRow);
      continue;
    }
    
    // Compare updated_at timestamps
    const localUpdatedAt = localRow.updated_at ? new Date(String(localRow.updated_at)).getTime() : 0;
    const remoteUpdatedAt = remoteRow.updated_at ? new Date(String(remoteRow.updated_at)).getTime() : 0;
    
    if (remoteUpdatedAt >= localUpdatedAt) {
      // Remote is newer or same, use remote
      mergedRows.push(remoteRow);
    }
    // Local is newer - keep local (don't add to mergedRows for put)
  }
  
  // Put merged rows
  if (mergedRows.length > 0) {
    await tableRef.bulkPut(mergedRows);
  }
  
  return mergedRows;
};
