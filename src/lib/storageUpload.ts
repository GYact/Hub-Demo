import { offlineDb } from "./offlineDb";
import { isOnlineNow, supabase } from "./offlineSync";

interface UploadTableInfo {
  tableName: string;
  recordId: string;
  fieldName: string;
}

export const uploadToStorage = async (
  bucket: string,
  path: string,
  data: ArrayBuffer,
  mimeType: string,
  tableInfo: UploadTableInfo,
): Promise<boolean> => {
  if (isOnlineNow() && supabase) {
    try {
      const { error } = await supabase.storage.from(bucket).upload(path, data, {
        upsert: true,
        contentType: mimeType,
      });
      if (!error) return true;
      console.warn("Storage upload failed, queuing for later:", error.message);
    } catch (err) {
      console.warn("Storage upload error, queuing for later:", err);
    }
  }

  // Offline or upload failed — queue for later
  const userId = (await offlineDb.meta.get("current_user_id"))?.value ?? "";
  await offlineDb.pending_uploads.add({
    user_id: userId,
    bucket,
    storage_path: path,
    table_name: tableInfo.tableName,
    record_id: tableInfo.recordId,
    field_name: tableInfo.fieldName,
    file_data: data,
    mime_type: mimeType,
    created_at: new Date().toISOString(),
  });
  return false;
};

export const processPendingUploads = async (): Promise<number> => {
  if (!isOnlineNow() || !supabase) return 0;

  const pending = await offlineDb.pending_uploads.toArray();
  if (pending.length === 0) return 0;

  let processed = 0;
  for (const entry of pending) {
    try {
      const { error } = await supabase.storage
        .from(entry.bucket)
        .upload(entry.storage_path, entry.file_data, {
          upsert: true,
          contentType: entry.mime_type,
        });
      if (error) {
        console.error(
          `Pending upload failed for ${entry.storage_path}:`,
          error.message,
        );
        continue;
      }

      // Update the record's storage path field
      const { error: updateError } = await supabase
        .from(entry.table_name)
        .update({
          [entry.field_name]: entry.storage_path,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.record_id);

      if (updateError) {
        console.error(
          `Failed to update ${entry.table_name}.${entry.field_name}:`,
          updateError.message,
        );
      }

      // Also update local DB
      const localRow = await offlineDb
        .table(entry.table_name)
        .get(entry.record_id);
      if (localRow) {
        await offlineDb.table(entry.table_name).put({
          ...localRow,
          [entry.field_name]: entry.storage_path,
          updated_at: new Date().toISOString(),
        });
      }

      // Remove from pending queue
      if (entry.id != null) {
        await offlineDb.pending_uploads.delete(entry.id);
      }
      processed++;
    } catch (err) {
      console.error("Error processing pending upload:", err);
    }
  }
  return processed;
};
