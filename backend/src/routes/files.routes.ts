import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs';
import { extractPublicIdFromUrl, isCloudinaryConfigured } from '../utils/cloudinary';

const router = Router();
const prisma = new PrismaClient();
const uploadsDir = path.join(__dirname, '../../uploads');

async function findFileById(idOrFilename: string) {
  // First try by ID in Document
  let doc = await prisma.document.findUnique({ where: { id: idOrFilename } });
  if (!doc) {
    // Try by ID in DriveFile
    const driveFile = await prisma.driveFile.findUnique({ where: { id: idOrFilename } });
    if (driveFile) {
      return { id: driveFile.id, fileUrl: driveFile.fileUrl, name: driveFile.name, mimeType: driveFile.mimeType };
    }
    // Try by filename or url match
    doc = await prisma.document.findFirst({
      where: { OR: [{ fileUrl: { contains: idOrFilename } }, { name: idOrFilename }] },
    });
  }

  if (doc) {
    return { id: doc.id, fileUrl: doc.fileUrl, name: doc.name, mimeType: doc.mimeType };
  }

  return null;
}

// GET /api/files/:id/preview — Preview file inline in browser
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const file = await findFileById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
      // Public Cloudinary URL — redirect directly to open in browser
      return res.redirect(file.fileUrl);
    }

    const filePath = path.join(uploadsDir, path.basename(file.fileUrl));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Physical file not found' });

    res.setHeader('Content-Type', file.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/files/:id/download — Force browser download using Cloudinary flags: "attachment"
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const file = await findFileById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
      if (isCloudinaryConfigured()) {
        const publicId = extractPublicIdFromUrl(file.fileUrl);
        if (publicId) {
          const isPdfOrImage = file.mimeType?.includes('pdf') || file.mimeType?.startsWith('image/') || file.fileUrl.includes('/image/upload/');
          const downloadUrl = cloudinary.url(publicId, {
            resource_type: isPdfOrImage ? 'image' : 'raw',
            type: 'upload',
            flags: 'attachment',
            secure: true,
          });
          return res.redirect(downloadUrl);
        }
      }
      return res.redirect(file.fileUrl);
    }

    const filePath = path.join(uploadsDir, path.basename(file.fileUrl));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Physical file not found' });

    res.download(filePath, file.name);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
