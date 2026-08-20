/**
 * storage.ts
 *
 * Single source of truth for *where* an uploaded file's bytes are persisted.
 *
 * Storage model:
 * - Production: bytes MUST live in durable remote object storage (Cloudinary,
 *   configured via env). We never fall back to the platform's ephemeral local
 *   disk in production, because a `/uploads/<name>` reference would 404 after
 *   the next deploy/restart. If the remote upload fails we throw so the caller
 *   can reject the request instead of creating a broken database row.
 * - Development / tests: Cloudinary is normally not configured, so we fall back
 *   to local disk. This keeps the local flow working without secrets.
 */
import path from 'path';
import { isCloudinaryConfigured, uploadLocalFileToCloudinary } from './cloudinary';

export interface PersistResult {
  fileUrl: string;
  storageProvider: 'cloudinary' | 'local';
}

export async function persistUpload(
  localPath: string,
  cloudFolder: string,
  mimeType: string
): Promise<PersistResult> {
  if (isCloudinaryConfigured()) {
    try {
      const cloudRes = await uploadLocalFileToCloudinary(localPath, cloudFolder, mimeType);
      return { fileUrl: cloudRes.url, storageProvider: 'cloudinary' };
    } catch (cloudErr: any) {
      if (process.env.NODE_ENV === 'production') {
        // Do NOT create a record that points at ephemeral local disk.
        throw new Error(`Remote storage upload failed: ${cloudErr.message}`);
      }
      console.warn('[storage] Cloudinary upload failed, falling back to local file:', cloudErr.message);
    }
  }

  return { fileUrl: `/uploads/${path.basename(localPath)}`, storageProvider: 'local' };
}
