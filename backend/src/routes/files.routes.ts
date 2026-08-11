/**
 * files.routes.ts
 * 
 * Architecture:
 * - Preview  → 302 redirect to Cloudinary URL (browser fetches directly; CDN allows browser origins)
 * - Download → redirect to Cloudinary private_download_url API endpoint (API-authenticated, not CDN ACL)
 *              The private_download_url uses signature-based auth served by api.cloudinary.com, 
 *              which is NOT subject to CDN ACL restrictions.
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs';
import { isCloudinaryConfigured } from '../utils/cloudinary';

const router = Router();
const prisma = new PrismaClient();
const uploadsDir = path.join(__dirname, '../../uploads');

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FileRecord {
  id: string;
  fileUrl: string;
  name: string;
  mimeType: string | null;
}

async function findFileById(id: string): Promise<FileRecord | null> {
  const drive = await prisma.driveFile.findUnique({ where: { id } });
  if (drive) return { id: drive.id, fileUrl: drive.fileUrl, name: drive.name, mimeType: drive.mimeType };

  const doc = await prisma.document.findUnique({ where: { id } });
  if (doc) return { id: doc.id, fileUrl: doc.fileUrl, name: doc.name, mimeType: doc.mimeType };

  return null;
}

/**
 * Parse a Cloudinary URL and return its parts.
 * Handles: /image/upload/, /raw/upload/, /video/upload/, /image/authenticated/, etc.
 */
function parseCloudinaryUrl(url: string): {
  resourceType: 'image' | 'video' | 'raw';
  deliveryType: string;
  publicId: string;
} | null {
  const match = url.match(
    /https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(upload|authenticated|private|fetch)(?:\/v\d+)?\/(.+?)(?:\?.*)?$/
  );
  if (!match) return null;
  return {
    resourceType: match[1] as 'image' | 'video' | 'raw',
    deliveryType: match[2],
    publicId: match[3],
  };
}

/**
 * Generate a Cloudinary private download URL using API-level authentication.
 * These URLs are served by api.cloudinary.com (not the CDN), bypassing CDN ACL restrictions.
 * They are time-limited (expires_at) and work for both preview and forced download.
 */
function buildPrivateDownloadUrl(
  resourceType: 'image' | 'video' | 'raw',
  publicId: string,
  attachment: boolean
): string {
  // cloudinary.utils.private_download_url generates:
  //   https://api.cloudinary.com/v1_1/<cloud>/<resource_type>/download?public_id=...&signature=...
  // This bypasses CDN ACL because it's an API endpoint, not a CDN URL.
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  if (resourceType === 'raw') {
    // For raw files, don't pass a format (the extension is part of the public_id)
    return cloudinary.utils.private_download_url(publicId, '', {
      resource_type: 'raw',
      attachment,
      expires_at: expiresAt,
    });
  }

  // For image/video: derive extension from publicId
  const ext = path.extname(publicId).slice(1).toLowerCase() || 'pdf';
  return cloudinary.utils.private_download_url(publicId, ext, {
    resource_type: resourceType,
    attachment,
    expires_at: expiresAt,
  });
}

function resolveMime(mimeType: string | null | undefined, fileUrl: string): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const ext = path.extname(fileUrl).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.txt': 'text/plain',
    '.zip': 'application/zip',
    '.csv': 'text/csv',
  };
  return map[ext] ?? 'application/octet-stream';
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /api/files/:id/preview
 *
 * Serves the file inline in the browser.
 *
 * Strategy:
 * - Cloudinary URL → redirect to Cloudinary's private_download_url API endpoint 
 *   with attachment=false. The browser fetches from api.cloudinary.com which is 
 *   NOT subject to CDN ACL restrictions.
 * - Local file → sendFile with correct Content-Type header.
 */
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const file = await findFileById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
      if (isCloudinaryConfigured()) {
        const parsed = parseCloudinaryUrl(file.fileUrl);
        if (parsed) {
          const previewUrl = buildPrivateDownloadUrl(parsed.resourceType, parsed.publicId, false);
          console.log('[files/preview] Redirecting to Cloudinary API URL (no CDN ACL):', previewUrl.substring(0, 100));
          return res.redirect(previewUrl);
        }
      }
      // Fallback: redirect directly to the stored URL (works if CDN ACL allows it)
      return res.redirect(file.fileUrl);
    }

    // Local disk file
    const filePath = path.join(uploadsDir, path.basename(file.fileUrl));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Physical file not found' });
    }
    const mime = resolveMime(file.mimeType, file.fileUrl);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    res.sendFile(filePath);
  } catch (err: any) {
    console.error('[files/preview]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/files/:id/download
 *
 * Forces a browser Save-As dialog.
 *
 * Strategy:
 * - Cloudinary URL → redirect to Cloudinary's private_download_url API endpoint
 *   with attachment=true. Cloudinary sets Content-Disposition: attachment on its end,
 *   causing the browser to save the file. Served from api.cloudinary.com (no CDN ACL).
 * - Local file → res.download() (sets Content-Disposition: attachment automatically).
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const file = await findFileById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
      if (isCloudinaryConfigured()) {
        const parsed = parseCloudinaryUrl(file.fileUrl);
        if (parsed) {
          const downloadUrl = buildPrivateDownloadUrl(parsed.resourceType, parsed.publicId, true);
          console.log('[files/download] Redirecting to Cloudinary API URL (attachment=true):', downloadUrl.substring(0, 100));
          return res.redirect(downloadUrl);
        }
      }
      // Fallback: redirect directly (browser may still open inline depending on content-type)
      return res.redirect(file.fileUrl);
    }

    // Local disk file
    const filePath = path.join(uploadsDir, path.basename(file.fileUrl));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Physical file not found' });
    }
    res.download(filePath, file.name);
  } catch (err: any) {
    console.error('[files/download]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
