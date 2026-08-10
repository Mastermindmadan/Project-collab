import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  isCloudinaryConfigured,
  uploadLocalFileToCloudinary,
  deleteFromCloudinary,
} from '../utils/cloudinary';

const router = Router();
const prisma = new PrismaClient();

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `drive-${unique}${path.extname(file.originalname)}`);
  },
});

const driveAllowedMimes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm',
];

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max limit
  fileFilter: (_req, file, cb) => {
    if (driveAllowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed for Drive: ${file.mimetype}`));
    }
  },
});

const handleDriveUploadSingle = (fieldName: string) => (req: Request, res: Response, next: any) => {
  upload.single(fieldName)(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'File upload error' });
    }
    next();
  });
};

function getFileType(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('word')) return 'docx';
  if (mime.includes('powerpoint') || mime.includes('presentation')) return 'ppt';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('zip')) return 'zip';
  if (mime.includes('excel') || mime.includes('spreadsheet') || mime === 'text/csv') return 'excel';
  return 'other';
}

// GET /api/drive/:projectId — list folders and root-level files
router.get('/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { folderId } = req.query;

    const folders = await prisma.driveFolder.findMany({
      where: { projectId, parentId: folderId ? String(folderId) : null },
      include: { _count: { select: { files: true, children: true } } },
      orderBy: { name: 'asc' },
    });

    const files = await prisma.driveFile.findMany({
      where: { projectId, folderId: folderId ? String(folderId) : null },
      include: { uploadedBy: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Breadcrumb path
    let breadcrumb: Array<{ id: string; name: string }> = [];
    if (folderId) {
      let current = await prisma.driveFolder.findUnique({ where: { id: String(folderId) } });
      while (current) {
        breadcrumb.unshift({ id: current.id, name: current.name });
        if (!current.parentId) break;
        current = await prisma.driveFolder.findUnique({ where: { id: current.parentId } });
      }
    }

    res.json({ success: true, folders, files, breadcrumb });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/drive/:projectId/search?q= — search files
router.get('/:projectId/search', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const q = String(req.query.q || '');
    const files = await prisma.driveFile.findMany({
      where: { projectId, OR: [{ name: { contains: q } }, { description: { contains: q } }] },
      include: { uploadedBy: { select: { name: true } }, folder: { select: { name: true } } },
      take: 20,
    });
    res.json({ success: true, files });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/:projectId/folders — create folder
router.post('/:projectId/folders', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, parentId } = req.body;
    const folder = await prisma.driveFolder.create({
      data: { name, projectId, parentId: parentId || null },
    });
    res.json({ success: true, folder });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/drive/folders/:id — delete folder
router.delete('/folders/:id', async (req: Request, res: Response) => {
  try {
    await prisma.driveFolder.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Folder deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/:projectId/files — upload file to drive (Cloudinary primary, local fallback)
router.post('/:projectId/files', handleDriveUploadSingle('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const { projectId } = req.params;
    const { folderId, uploadedById, description } = req.body;

    let fileUrl = `/uploads/${req.file.filename}`;
    let storageProvider = 'local';

    if (isCloudinaryConfigured()) {
      try {
        const cloudRes = await uploadLocalFileToCloudinary(
          req.file.path,
          'projectcollab/drive',
          req.file.mimetype
        );
        fileUrl = cloudRes.url;
        storageProvider = 'cloudinary';
      } catch (cloudErr: any) {
        console.warn('[Drive Upload] Cloudinary upload failed, falling back to local file:', cloudErr.message);
      }
    }

    const file = await prisma.driveFile.create({
      data: {
        name: req.file.originalname,
        fileUrl,
        fileType: getFileType(req.file.mimetype),
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        projectId,
        folderId: folderId || null,
        uploadedById,
        description: description || null,
      },
      include: { uploadedBy: { select: { name: true, avatarUrl: true } } },
    });

    res.json({ success: true, storageProvider, file });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/drive/files/:id — delete drive file
router.delete('/files/:id', async (req: Request, res: Response) => {
  try {
    const file = await prisma.driveFile.findUnique({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
      await deleteFromCloudinary(file.fileUrl);
    } else {
      const filePath = path.join(uploadsDir, path.basename(file.fileUrl));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.driveFile.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'File deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/drive/files/:id/download — download file (redirects to Cloudinary if remote)
router.get('/files/:id/download', async (req: Request, res: Response) => {
  try {
    const file = await prisma.driveFile.findUnique({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
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

