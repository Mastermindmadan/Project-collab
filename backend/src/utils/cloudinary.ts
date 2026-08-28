import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import fs from 'fs';

type CloudinaryResourceType = 'image' | 'raw' | 'video';

function sanitizeEnv(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Returns cleaned Cloudinary environment variables.
 */
export function getCloudinaryCredentials() {
  return {
    cloud_name: sanitizeEnv(process.env.CLOUDINARY_CLOUD_NAME),
    api_key: sanitizeEnv(process.env.CLOUDINARY_API_KEY),
    api_secret: sanitizeEnv(process.env.CLOUDINARY_API_SECRET),
  };
}

// Initial configuration with sanitized credentials
const initialCreds = getCloudinaryCredentials();
cloudinary.config({
  cloud_name: initialCreds.cloud_name,
  api_key: initialCreds.api_key,
  api_secret: initialCreds.api_secret,
  secure: true,
});

/**
 * Re-applies the Cloudinary credentials from process.env.
 *
 * This guarantees the SDK uses the sanitized credentials that exist when
 * the upload request runs.
 */
export function applyEnvConfig(): void {
  const creds = getCloudinaryCredentials();
  cloudinary.config({
    cloud_name: creds.cloud_name,
    api_key: creds.api_key,
    api_secret: creds.api_secret,
    secure: true,
  });
}

/**
 * Rejects placeholder / example credential values so a project that has not
 * been wired to a real Cloudinary account does not silently attempt (and fail)
 * uploads.
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
 */
export function isCloudinaryConfigured(): boolean {
  const { cloud_name, api_key, api_secret } = getCloudinaryCredentials();
  return (
    isValidCredential(cloud_name) &&
    isValidCredential(api_key) &&
    isValidCredential(api_secret)
  );
}

/**
 * Safe diagnostic logging for Cloudinary configuration.
 * NEVER logs the API secret value.
 */
export function logCloudinaryDiagnostics(): void {
  const { cloud_name, api_key, api_secret } = getCloudinaryCredentials();
  console.log('[Cloudinary Diagnostics]', {
    cloud_name: cloud_name
      ? `Present (${cloud_name.length} chars, ends with '...${cloud_name.slice(-3)}')`
      : 'MISSING',
    api_key: api_key
      ? `Present (${api_key.length} chars, ends with '...${api_key.slice(-3)}')`
      : 'MISSING',
    api_secret: api_secret
      ? `Present (${api_secret.length} chars, masked)`
      : 'MISSING',
    isConfigured: isCloudinaryConfigured(),
  });
}

/**
 * Uploads a file from local disk to Cloudinary using official SDK signed upload.
 *
 * On SUCCESS the temporary local file is removed.
 * On FAILURE the temp file is left on disk for route cleanup.
 */
export async function uploadLocalFileToCloudinary(
  filePath: string,
  folder: string = 'projectcollab',
  mimeType: string = 'application/octet-stream'
): Promise<{ url: string; publicId: string; bytes: number }> {
  if (!isCloudinaryConfigured()) {
    logCloudinaryDiagnostics();
    throw new Error('Cloudinary credentials are missing or invalid in environment');
  }

  // Refresh the SDK config from env now that the process is fully booted.
  applyEnvConfig();

  let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'image';
  if (mimeType.startsWith('image/')) {
    // Real raster images (jpg/png/gif/webp/svg) → image type.
    resourceType = 'image';
  } else if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
    // Audio/video → video type.
    resourceType = 'video';
  } else {
    // PDFs, Word, Excel, PPT, zip, txt, CSV and anything else → 'raw'.
    // 'raw' stores the bytes verbatim with no Cloudinary processing, which is
    // REQUIRED for non-media files. Sending them as 'image' makes Cloudinary try
    // to process/convert them and fails (400 Invalid file / 499 timeout), which
    // the callers surface as a 502 to the client.
    resourceType = 'raw';
  }

  // Standard signed upload options — do NOT pass restricted ACL fields like
  // access_mode='public' which cause parameter signature mismatch on standard plans.
  const uploadOptions: Record<string, any> = {
    folder,
    resource_type: resourceType,
    use_filename: true,
    unique_filename: true,
    chunk_size: 6 * 1024 * 1024, // 6MB chunks for large files (>20MB like 26MB)
    timeout: 600000, // 10 minute timeout
  };

  try {
    // upload_large supports chunked uploads for files > 20MB while working seamlessly for small files
    const result = (await cloudinary.uploader.upload_large(filePath, uploadOptions)) as UploadApiResponse;

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
    console.error('[Cloudinary Error]', error);
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
        : mimeType?.startsWith('image/')
          ? 'image'
          : mimeType?.startsWith('video/') || mimeType?.startsWith('audio/')
            ? 'video'
            : 'raw';

    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result.result === 'ok';
  } catch (err) {
    console.warn('[Cloudinary] Delete failed:', err);
    return false;
  }
}
