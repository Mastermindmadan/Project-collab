/**
 * files.routes.ts
 *
 * Architecture:
 * - Preview/Download → the backend streams remote files (Cloudinary CDN URLs)
 *   back to the browser. Server-to-server fetches are NOT subject to browser
 *   CORS or to a CDN redirect that would need valid api.cloudinary.com
 *   credentials (a `private_download_url` signed with placeholder API secrets
 *   returns 401). A signed private URL is used only as a fallback when the
 *   public CDN stream fails.
 * - Local files are served directly from disk via sendFile / download.
 */
import { Router, Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs';
import prisma from '../utils/prisma';
import { isCloudinaryConfigured } from '../utils/cloudinary';
import { streamRemoteUrl } from '../utils/fileStream';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();
const uploadsDir = path.join(__dirname, '../../uploads');

// All file routes require authentication
router.use(authenticateJWT);

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FileRecord {
  id: string;
  fileUrl: string;
  name: string;
  mimeType: string | null;
  projectId: string;
}

async function findFileById(id: string): Promise<FileRecord | null> {
  const drive = await prisma.driveFile.findUnique({ where: { id } });
  if (drive) return { id: drive.id, fileUrl: drive.fileUrl, name: drive.name, mimeType: drive.mimeType, projectId: drive.projectId };

  const doc = await prisma.document.findUnique({ where: { id } });
  if (doc) return { id: doc.id, fileUrl: doc.fileUrl, name: doc.name, mimeType: doc.mimeType, projectId: doc.projectId };

  return null;
}

/**
 * Verifies that the authenticated user is a member of the team that owns the
 * project referenced by `projectId`. Returns the teamId on success.
 */
async function verifyProjectAccess(authReq: AuthenticatedRequest, projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { teamId: true },
  });
  if (!project) return null;
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: authReq.user!.id, teamId: project.teamId } },
  });
  if (!membership) return null;
  return project.teamId;
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
 * - Remote file → stream the stored CDN URL server-side. Public resources on
 *   res.cloudinary.com are served without credentials; server-to-server
 *   requests avoid browser CORS completely. Falls back to a signed private
 *   download URL only if the CDN stream fails AND Cloudinary is configured.
 * - Local file → sendFile with the correct Content-Type header.
 */
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    const file = await findFileById(req.params.id);
    console.log(`[files/preview] reqId=${req.params.id} found=${!!file} fileUrl=${file?.fileUrl ?? 'N/A'} projectId=${file?.projectId ?? 'N/A'} userId=${authReq.user?.id}`);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    if (!(await verifyProjectAccess(authReq, file.projectId))) return res.status(403).json({ success: false, message: 'Access denied' });

    const isRemote = file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://');
    if (isRemote) {
      const mime = resolveMime(file.mimeType, file.fileUrl);
      try {
        await streamRemoteUrl(file.fileUrl, res, { attachment: false, filename: file.name, mimeType: mime });
        return;
      } catch (remoteErr: any) {
        console.warn('[files/preview] Remote stream failed:', remoteErr.message);
        // Fallback: try a signed private download URL for authenticated/private assets.
        if (isCloudinaryConfigured()) {
          const parsed = parseCloudinaryUrl(file.fileUrl);
          if (parsed) {
            try {
              const signedUrl = buildPrivateDownloadUrl(parsed.resourceType, parsed.publicId, false);
              await streamRemoteUrl(signedUrl, res, { attachment: false, filename: file.name, mimeType: mime });
              return;
            } catch (signedErr: any) {
              console.warn('[files/preview] Signed fallback failed:', signedErr.message);
            }
          }
        }
        return res.status(502).json({ success: false, message: 'Preview failed to load. Please use Download instead.' });
      }
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
 * - Remote file → stream the stored CDN URL server-side and set
 *   Content-Disposition: attachment. This avoids browser CORS and does not
 *   depend on a signed api.cloudinary.com URL (which 401s with bad credentials).
 *   Falls back to a signed private URL only when Cloudinary is configured.
 * - Local file → res.download() (sets Content-Disposition: attachment).
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    const file = await findFileById(req.params.id);
    console.log(`[files/download] reqId=${req.params.id} found=${!!file} fileUrl=${file?.fileUrl ?? 'N/A'} projectId=${file?.projectId ?? 'N/A'} userId=${authReq.user?.id}`);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    if (!(await verifyProjectAccess(authReq, file.projectId))) return res.status(403).json({ success: false, message: 'Access denied' });

    const isRemote = file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://');
    if (isRemote) {
      const mime = resolveMime(file.mimeType, file.fileUrl);
      try {
        await streamRemoteUrl(file.fileUrl, res, { attachment: true, filename: file.name, mimeType: mime });
        return;
      } catch (remoteErr: any) {
        console.warn('[files/download] Remote stream failed:', remoteErr.message);
        if (isCloudinaryConfigured()) {
          const parsed = parseCloudinaryUrl(file.fileUrl);
          if (parsed) {
            try {
              const signedUrl = buildPrivateDownloadUrl(parsed.resourceType, parsed.publicId, true);
              await streamRemoteUrl(signedUrl, res, { attachment: true, filename: file.name, mimeType: mime });
              return;
            } catch (signedErr: any) {
              console.warn('[files/download] Signed fallback failed:', signedErr.message);
            }
          }
        }
        return res.status(502).json({ success: false, message: 'File download failed. Please try again.' });
      }
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
