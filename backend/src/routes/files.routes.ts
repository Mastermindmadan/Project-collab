/**
 * files.routes.ts
 *
 * Architecture:
 * - File metadata lives in the database (DriveFile / Document rows). The
 *   `fileUrl` column points at the actual bytes, which are stored in one of two
 *   places:
 *     1. Remote object storage (Cloudinary CDN) — a full https:// URL.
 *     2. Local ephemeral disk — a `/uploads/<name>` path.
 * - Preview/Download resolve the record, verify the caller is a member of the
 *   owning project's team, then stream the bytes back to the browser.
 *   Server-to-server fetches avoid browser CORS and any CDN credential issues.
 *
 * This module owns ONLY preview/download. Uploads are handled in
 * upload.routes.ts / drive.routes.ts and must write a durable `fileUrl`.
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
  source: 'driveFile' | 'document';
}

/**
 * Looks up a file across every table that stores user files. This guarantees
 * that a valid UUID from any part of the app (Drive, Documents, messages) is
 * found as long as the row exists in the database.
 */
async function findFileById(id: string): Promise<FileRecord | null> {
  const drive = await prisma.driveFile.findUnique({ where: { id } });
  if (drive) {
    return {
      id: drive.id,
      fileUrl: drive.fileUrl,
      name: drive.name,
      mimeType: drive.mimeType,
      projectId: drive.projectId,
      source: 'driveFile',
    };
  }

  const doc = await prisma.document.findUnique({ where: { id } });
  if (doc) {
    return {
      id: doc.id,
      fileUrl: doc.fileUrl,
      name: doc.name,
      mimeType: doc.mimeType,
      projectId: doc.projectId,
      source: 'document',
    };
  }

  return null;
}

/**
 * Verifies that the authenticated user is a member of the team that owns the
 * project referenced by `projectId`. Returns the teamId on success, or null
 * when the project is missing or the user is not a member.
 *
 * A null result means "not authorized to access this file" — callers map it to
 * 403. We deliberately do NOT distinguish "project missing" from "not a
 * member" here: in both cases the requester must not learn whether the file
 * exists, so 403 (not 404) is returned.
 */
async function verifyProjectAccess(
  authReq: AuthenticatedRequest,
  projectId: string
): Promise<string | null> {
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
 * These URLs are served by api.cloudinary.com (not the CDN), bypassing CDN ACL
 * restrictions. They are time-limited (expires_at) and work for both preview
 * and forced download.
 */
function buildPrivateDownloadUrl(
  resourceType: 'image' | 'video' | 'raw',
  publicId: string,
  attachment: boolean
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  if (resourceType === 'raw') {
    return cloudinary.utils.private_download_url(publicId, '', {
      resource_type: 'raw',
      attachment,
      expires_at: expiresAt,
    });
  }

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

/** Human-readable storage descriptor used purely for logging. */
function describeStorage(fileUrl: string): { kind: 'remote' | 'local'; bucket?: string } {
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    try {
      const host = new URL(fileUrl).host;
      // For Cloudinary the "bucket" is the cloud name segment.
      const cloudMatch = host.match(/res\.cloudinary\.com\/([^.]+)/);
      return { kind: 'remote', bucket: cloudMatch ? `cloudinary:${cloudMatch[1]}` : host };
    } catch {
      return { kind: 'remote' };
    }
  }
  return { kind: 'local' };
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
  const reqId = req.params.id;
  try {
    const authReq = req as AuthenticatedRequest;

    // 401 — unauthenticated
    if (!authReq.user) {
      console.warn(`[files/preview] 401 Unauthorized reqId=${reqId}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // DB lookup
    const file = await findFileById(reqId);
    console.log(
      `[files/preview] lookup reqId=${reqId} found=${!!file}` +
        (file ? ` source=${file.source} projectId=${file.projectId} storage=${describeStorage(file.fileUrl).kind}/${describeStorage(file.fileUrl).bucket ?? 'local'} userId=${authReq.user.id}` : '')
    );
    // 404 — the file genuinely does not exist in the database
    if (!file) {
      console.warn(`[files/preview] 404 file not found in DB reqId=${reqId} userId=${authReq.user.id}`);
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // 403 — not a member of the owning project's team
    const teamId = await verifyProjectAccess(authReq, file.projectId);
    if (!teamId) {
      console.warn(`[files/preview] 403 access denied reqId=${reqId} projectId=${file.projectId} userId=${authReq.user.id}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await serveFile(file, false, req, res);
  } catch (err: any) {
    console.error(`[files/preview] 500 unexpected error reqId=${reqId}:`, err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/files/:id/download
 *
 * Forces a browser Save-As dialog.
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  const reqId = req.params.id;
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      console.warn(`[files/download] 401 Unauthorized reqId=${reqId}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = await findFileById(reqId);
    console.log(
      `[files/download] lookup reqId=${reqId} found=${!!file}` +
        (file ? ` source=${file.source} projectId=${file.projectId} storage=${describeStorage(file.fileUrl).kind}/${describeStorage(file.fileUrl).bucket ?? 'local'} userId=${authReq.user.id}` : '')
    );
    if (!file) {
      console.warn(`[files/download] 404 file not found in DB reqId=${reqId} userId=${authReq.user.id}`);
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const teamId = await verifyProjectAccess(authReq, file.projectId);
    if (!teamId) {
      console.warn(`[files/download] 403 access denied reqId=${reqId} projectId=${file.projectId} userId=${authReq.user.id}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await serveFile(file, true, req, res);
  } catch (err: any) {
    console.error(`[files/download] 500 unexpected error reqId=${reqId}:`, err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Resolves a FileRecord to bytes and streams/serves them with the correct
 * Content-Type and Content-Disposition. Handles both remote (Cloudinary) and
 * local storage, and returns the appropriate status code when the underlying
 * storage cannot be reached.
 */
async function serveFile(
  file: FileRecord,
  attachment: boolean,
  _req: Request,
  res: Response
): Promise<void> {
  const storage = describeStorage(file.fileUrl);
  const mime = resolveMime(file.mimeType, file.fileUrl);

  if (storage.kind === 'remote') {
    console.log(
      `[files/serve] remote ${attachment ? 'download' : 'preview'} id=${file.id} url=${file.fileUrl} mime=${mime}`
    );
    try {
      await streamRemoteUrl(file.fileUrl, res, {
        attachment,
        filename: file.name,
        mimeType: mime,
      });
      return;
    } catch (remoteErr: any) {
      console.warn(`[files/serve] remote stream failed id=${file.id}:`, remoteErr.message);
      // Fallback: try a signed private download URL for authenticated/private
      // Cloudinary assets when Cloudinary is actually configured.
      if (isCloudinaryConfigured()) {
        const parsed = parseCloudinaryUrl(file.fileUrl);
        if (parsed) {
          try {
            const signedUrl = buildPrivateDownloadUrl(parsed.resourceType, parsed.publicId, attachment);
            console.log(`[files/serve] retrying with signed URL id=${file.id}`);
            await streamRemoteUrl(signedUrl, res, {
              attachment,
              filename: file.name,
              mimeType: mime,
            });
            return;
          } catch (signedErr: any) {
            console.warn(`[files/serve] signed fallback failed id=${file.id}:`, signedErr.message);
          }
        }
      }
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          message: attachment
            ? 'File download failed. Please try again.'
            : 'Preview failed to load. Please use Download instead.',
        });
      }
      return;
    }
  }

  // Local disk file
  const filePath = path.join(uploadsDir, path.basename(file.fileUrl));
  console.log(`[files/serve] local ${attachment ? 'download' : 'preview'} id=${file.id} path=${filePath}`);

  if (!fs.existsSync(filePath)) {
    // The database row exists but the physical bytes are gone (e.g. ephemeral
    // platform storage was wiped between writes). The file genuinely no longer
    // exists on storage, so 404 is the correct response — we never fabricate
    // bytes or fall back to a different user's file.
    console.error(
      `[files/serve] 404 physical file missing id=${file.id} expectedPath=${filePath} ` +
        `(the DB record references local storage but the bytes are not present)`
    );
    if (!res.headersSent) {
      res.status(404).json({
        success: false,
        message: 'File not found on storage. The uploaded file is no longer available.',
      });
    }
    return;
  }

  if (attachment) {
    res.download(filePath, file.name);
    return;
  }

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  res.sendFile(filePath);
}

export default router;
