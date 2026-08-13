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
 * Checks whether Cloudinary environment variables are configured.
 */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Uploads a file from local disk to Cloudinary and deletes the temp file.
 */
export async function uploadLocalFileToCloudinary(
  filePath: string,
  folder: string = 'projectcollab',
  mimeType: string = 'application/octet-stream'
): Promise<{ url: string; publicId: string; bytes: number }> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary credentials are not configured in environment');
  }

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
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }
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
