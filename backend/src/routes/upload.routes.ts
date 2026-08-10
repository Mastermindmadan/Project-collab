import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const allowedMimes = [
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
];

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (_req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

function getFileType(mimetype: string): string {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('word')) return 'docx';
  if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'ppt';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.includes('zip')) return 'zip';
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet') || mimetype === 'text/csv') return 'excel';
  return 'other';
}

// POST /api/upload — Upload a file
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const { projectId, category, description, uploadedById } = req.body;
    if (!projectId || !uploadedById) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'projectId and uploadedById are required' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const document = await prisma.document.create({
      data: {
        name: req.file.originalname,
        fileUrl,
        category: category || 'other',
        projectId,
        uploadedById,
        fileType: getFileType(req.file.mimetype),
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        description: description || null,
        version: 1,
      },
    });

    res.json({ success: true, document });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/upload/file/:filename — Serve/download file
router.get('/file/:filename', (req: Request, res: Response) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
  res.download(filePath);
});

// DELETE /api/upload/:id — Delete document record
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    // Delete physical file
    const filePath = path.join(uploadsDir, path.basename(doc.fileUrl));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Document deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/upload/:id/version — Upload new version of existing doc
router.post('/:id/version', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const { uploadedById, notes } = req.body;
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    const newVersion = doc.version + 1;
    const fileUrl = `/uploads/${req.file.filename}`;

    await prisma.docVersion.create({
      data: { documentId: doc.id, version: doc.version, fileUrl: doc.fileUrl, uploadedById, notes },
    });

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: { fileUrl, version: newVersion, fileSize: req.file.size, mimeType: req.file.mimetype, updatedAt: new Date() },
    });

    res.json({ success: true, document: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/upload/:id/versions — Get version history
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const versions = await prisma.docVersion.findMany({
      where: { documentId: req.params.id },
      orderBy: { version: 'desc' },
    });
    res.json({ success: true, versions });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
