import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { extractPublicIdFromUrl } from '../utils/cloudinary';

const router = Router();
const prisma = new PrismaClient();
const uploadsDir = path.join(__dirname, '../../uploads');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Look up a file record by ID — checks DriveFile first, then Document */
async function findFileById(id: string) {
  const drive = await prisma.driveFile.findUnique({ where: { id } });
  if (drive) {
    return { id: drive.id, fileUrl: drive.fileUrl, name: drive.name, mimeType: drive.mimeType };
  }
  const doc = await prisma.document.findUnique({ where: { id } });
  if (doc) {
    return { id: doc.id, fileUrl: doc.fileUrl, name: doc.name, mimeType: doc.mimeType };
  }
  return null;
}

/**
 * Fetch a remote URL and pipe its bytes to the Express Response,
 * overriding Content-Type and Content-Disposition from our params.
 */
function proxyRemoteFile(
  remoteUrl: string,
  contentType: string,
  contentDisposition: string,
  res: Response
): void {
  const client = remoteUrl.startsWith('https') ? https : http;

  const request = client.get(remoteUrl, (upstream) => {
    const status = upstream.statusCode ?? 200;

    if (status >= 300 && status < 400 && upstream.headers.location) {
      // follow one redirect
      proxyRemoteFile(upstream.headers.location, contentType, contentDisposition, res);
      return;
    }

    if (status !== 200) {
      res.status(502).json({ success: false, message: `Cloudinary returned ${status}` });
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (upstream.headers['content-length']) {
      res.setHeader('Content-Length', upstream.headers['content-length']);
    }
    upstream.pipe(res);
  });

  request.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: `Failed to fetch file: ${err.message}` });
    }
  });
}

/** Resolve the correct MIME type to serve (fall back to octet-stream) */
function resolveMime(mimeType: string | null | undefined, fileUrl: string): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  // Guess from extension
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
 * Serves the file inline in the browser.
 * For Cloudinary URLs → proxies the raw bytes through the backend with the
 * correct Content-Type so the browser's PDF viewer (or image viewer) opens it.
 */
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const file = await findFileById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const mime = resolveMime(file.mimeType, file.fileUrl);
    const disposition = `inline; filename="${encodeURIComponent(file.name)}"`;

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
      // Proxy through backend — browser gets correct Content-Type regardless of
      // Cloudinary's resource_type (/raw/upload/, /image/upload/, etc.)
      proxyRemoteFile(file.fileUrl, mime, disposition, res);
      return;
    }

    // Local disk file
    const filePath = path.join(uploadsDir, path.basename(file.fileUrl));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Physical file not found' });
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', disposition);
    res.sendFile(filePath);
  } catch (err: any) {
    console.error('[files/preview]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/files/:id/download
 * Forces a browser Save-As dialog.
 * Same proxy approach as preview but with Content-Disposition: attachment.
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const file = await findFileById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const mime = resolveMime(file.mimeType, file.fileUrl);
    const disposition = `attachment; filename="${encodeURIComponent(file.name)}"`;

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
      proxyRemoteFile(file.fileUrl, mime, disposition, res);
      return;
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
