import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import fs from 'fs';

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

  let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto';
  if (mimeType.startsWith('image/')) {
    resourceType = 'image';
  } else if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
    resourceType = 'video';
  } else {
    resourceType = 'raw';
  }

  try {
    const result: UploadApiResponse = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: resourceType,
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
 * Deletes a resource from Cloudinary if given a Cloudinary URL or public_id.
 */
export async function deleteFromCloudinary(
  urlOrPublicId: string,
  resourceType: 'image' | 'raw' | 'video' = 'raw'
): Promise<boolean> {
  if (!isCloudinaryConfigured() || !urlOrPublicId) return false;

  try {
    let publicId = urlOrPublicId;
    if (urlOrPublicId.startsWith('http://') || urlOrPublicId.startsWith('https://')) {
      const parts = urlOrPublicId.split('/upload/');
      if (parts.length > 1) {
        publicId = parts[1].replace(/^v\d+\//, '');
      }
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return true;
  } catch (err) {
    console.warn('[Cloudinary] Delete failed:', err);
    return false;
  }
}
