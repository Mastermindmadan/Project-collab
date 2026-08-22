import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import fs from 'fs';

type CloudinaryResourceType = 'image' | 'raw' | 'video';

// Configure Cloudinary credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Re-applies the Cloudinary credentials from process.env.
 *
 * This module is reached very early by other modules and its import can be
 * evaluated BEFORE dotenv.config() runs, which would snapshot `undefined`
 * credentials into the SDK config and make every later upload fail with a 401
 * even though the .env / environment actually holds valid values. Re-applying
 * at call time guarantees the SDK uses the credentials that exist when the
 * request runs.
 */
function applyEnvConfig(): void {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Rejects placeholder / example credential values so a project that has not
 * been wired to a real Cloudinary account does not silently attempt (and fail)
 * uploads, corrupting local fallback storage.
 */
function isValidCredential(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 4) return false;
  return ![
    /^your[-_]/i, // "your-cloud-name", "your-api-key", ...
    /^change_?me/i,
    /^xxx/i,
    /^.+<.+>$/, // "<...>" style placeholders
  ].some((re) => re.test(v));
}

/**
 * Checks whether Cloudinary is actually configured with real credentials.
 * Returns false when the env vars hold examples, are empty, or too short.
 */
export function isCloudinaryConfigured(): boolean {
  return (
    isValidCredential(process.env.CLOUDINARY_CLOUD_NAME) &&
    isValidCredential(process.env.CLOUDINARY_API_KEY) &&
    isValidCredential(process.env.CLOUDINARY_API_SECRET)
  );
}

/**
 * Uploads a file from local disk to Cloudinary.
 *
 * On SUCCESS the temporary local file is removed (it is now redundant).
 * On FAILURE the temp file is LEFT ON DISK — there is intentionally NO
 * local-disk fallback. `persistUpload` throws, and the calling route unlinks
 * the temp file while rejecting the request with a 502. Leaving the file here
 * lets the route perform that cleanup.
 */
export async function uploadLocalFileToCloudinary(
  filePath: string,
  folder: string = 'projectcollab',
  mimeType: string = 'application/octet-stream'
): Promise<{ url: string; publicId: string; bytes: number }> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary credentials are not configured in environment');
  }

  // Refresh the SDK config from env now that the process is fully booted.
  applyEnvConfig();

  // raw/upload URLs are BLOCKED by Cloudinary's account-level ACL on free plans.
  // Use 'image' for PDFs and documents — image/upload URLs are publicly accessible.
  // Preview is handled via Google Docs Viewer (avoids Edge PDF viewer quirks).
  // Download is handled via browser fetch() + Blob.
  let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'image';
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
    resourceType = 'video';
  } else if (mimeType.startsWith('image/') && !mimeType.includes('pdf')) {
    resourceType = 'image';
  } else {
    // PDFs, Word, Excel, PPT, zip, txt, etc. → image type (publicly accessible)
    resourceType = 'image';
  }

  try {
    const result: UploadApiResponse = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: resourceType,
      type: 'upload',
      access_mode: 'public',
      use_filename: true,
      unique_filename: true,
    });

    // Unlink local temp file after successful upload
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('[Cloudinary] Failed to unlink temp file:', filePath, err);
      }
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
    };
  } catch (error: any) {
    // IMPORTANT: do NOT delete the temp file here — the route's error handler
    // needs it for cleanup while rejecting the request (502). There is
    // deliberately no fallback to local storage: Cloudinary is the only
    // persistence path for new uploads.
    throw new Error(`Cloudinary upload failed: ${error.message || error}`);
  }
}

/**
 * Extracts publicId from a Cloudinary URL string.
 */
export function extractPublicIdFromUrl(url: string): string | null {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return null;
  const parts = url.split('/upload/');
  if (parts.length < 2) return null;
  // Cloudinary URLs include the delivery format (for example, `.png`), but
  // `uploader.destroy` requires the public ID without that extension.
  return parts[1].replace(/^v\d+\//, '').replace(/\.[^/.]+$/, '');
}

/**
 * Deletes a resource from Cloudinary if given a Cloudinary URL or public_id.
 */
export async function deleteFromCloudinary(
  urlOrPublicId: string,
  mimeType?: string | null
): Promise<boolean> {
  if (!isCloudinaryConfigured() || !urlOrPublicId) return false;
  applyEnvConfig();

  try {
    let publicId = urlOrPublicId;
    if (urlOrPublicId.startsWith('http://') || urlOrPublicId.startsWith('https://')) {
      const extracted = extractPublicIdFromUrl(urlOrPublicId);
      if (extracted) publicId = extracted;
    }

    // A Cloudinary delivery URL contains the exact resource type used at
    // upload time. For a bare public ID, mirror this app's upload mapping.
    const urlResourceType = urlOrPublicId.match(/\/(image|video|raw)\/upload\//i)?.[1]?.toLowerCase();
    const resourceType: CloudinaryResourceType =
      urlResourceType === 'image' || urlResourceType === 'video' || urlResourceType === 'raw'
        ? urlResourceType
        : mimeType?.startsWith('video/') || mimeType?.startsWith('audio/')
          ? 'video'
          : 'image';

    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result.result === 'ok';
  } catch (err) {
    console.warn('[Cloudinary] Delete failed:', err);
    return false;
  }
}
