/**
 * verify-storage-upload.ts
 *
 * Live happy-path verification that file uploads are persisted to Cloudinary
 * and produce a remote https:// fileUrl (requirement #5 of the storage-fallback
 * fix). This requires REAL Cloudinary credentials — the app intentionally
 * rejects placeholder values like `your-cloud-name`.
 *
 * Run from the backend/ directory (uses backend/.env OR any CLOUDINARY_* env
 * vars already set in the shell):
 *   npx ts-node scripts/verify-storage-upload.ts
 *
 * Exit code 0  -> upload succeeded and fileUrl is a remote http(s) URL.
 * Exit code !=0 -> upload failed (or no valid credentials configured).
 *
 * The uploaded asset is cleaned up from Cloudinary automatically at the end.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config as loadEnv } from 'dotenv';
import { persistUpload } from '../src/utils/storage';
import { isCloudinaryConfigured, deleteFromCloudinary } from '../src/utils/cloudinary';

loadEnv({ path: path.join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  if (!isCloudinaryConfigured()) {
    console.error(
      '[verify] FAIL: Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, ' +
        'CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend/.env (real values, ' +
        'not placeholders) or in the environment, then re-run.'
    );
    process.exitCode = 1;
    return;
  }

  const tmpFile = path.join(os.tmpdir(), `pc-verify-upload-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, 'ProjectCollab AI storage verification payload');

  console.log('=== UPLOAD STORAGE VERIFICATION (happy path) ===');
  console.log(`Cloudinary configured: ${isCloudinaryConfigured()}`);

  let uploadedUrl: string | undefined;
  try {
    const result = await persistUpload(tmpFile, 'projectcollab/verification-upload', 'text/plain');
    console.log('persistUpload resolved:');
    console.log('  storageProvider =', result.storageProvider);
    console.log('  fileUrl         =', result.fileUrl);

    const isRemote = /^https?:\/\//.test(result.fileUrl);
    if (result.storageProvider !== 'cloudinary' || !isRemote) {
      console.error('[verify] FAIL: expected a Cloudinary (remote http(s)) fileUrl.');
      process.exitCode = 1;
      return;
    }
    if (fs.existsSync(tmpFile)) {
      console.warn('[verify] NOTE: temp file still exists on disk (expected removed after success).');
    }
    uploadedUrl = result.fileUrl;
    console.log(`PASS: file stored on Cloudinary -> ${uploadedUrl}`);
  } catch (err: any) {
    console.error('[verify] FAIL: persistUpload threw:', err?.message || err);
    process.exitCode = 1;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }

  if (uploadedUrl) {
    try {
      console.log('cleaning up Cloudinary test asset ...', await deleteFromCloudinary(uploadedUrl, 'text/plain'));
    } catch (e: any) {
      console.warn('[verify] Cloudinary cleanup skipped:', e?.message || e);
    }
  }
}

main().catch((e) => {
  console.error('[verify] unexpected error:', e);
  process.exitCode = 1;
});