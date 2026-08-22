/**
 * storage.ts
 *
 * Single source of truth for *where* an uploaded file's bytes are persisted.
 *
 * Storage model:
 * - ALL uploads (dev and production) MUST be persisted to durable remote object
 *   storage (Cloudinary, configured via env). We NEVER fall back to the
 *   platform's ephemeral local disk: a `/uploads/<name>` reference would work
 *   today but 404 after the next deploy/restart wipes the disk, silently
 *   losing the file for users.
 * - If Cloudinary env vars are missing/invalid, or the remote upload call
 *   fails, `persistUpload` THROWS immediately so the caller can reject the
 *   request (drive.routes.ts / upload.routes.ts surface this as a 502) instead
 *   of creating a database row that pretends success.
 */
import { uploadLocalFileToCloudinary } from './cloudinary';

export interface PersistResult {
  fileUrl: string;
  storageProvider: 'cloudinary' | 'local';
}

export async function persistUpload(
  localPath: string,
  cloudFolder: string,
  mimeType: string
): Promise<PersistResult> {
  try {
    const cloudRes = await uploadLocalFileToCloudinary(localPath, cloudFolder, mimeType);
    return { fileUrl: cloudRes.url, storageProvider: 'cloudinary' };
  } catch (cloudErr: any) {
    // NEVER fall back to the ephemeral local disk. A `/uploads/<name>` URL
    // would render fine today and 404 tomorrow (Render's disk is wiped on every
    // deploy/restart) with zero warning to the user. Throw immediately so the
    // caller can reject the request with a 502 instead of recording a broken
    // database row that pretends the upload succeeded.
    throw new Error(`Remote storage upload failed: ${cloudErr?.message || cloudErr}`);
  }
}
