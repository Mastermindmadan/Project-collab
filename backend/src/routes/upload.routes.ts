import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../utils/prisma';
import {
  isCloudinaryConfigured,
  uploadLocalFileToCloudinary,
  deleteFromCloudinary,
} from '../utils/cloudinary';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// All upload routes require authentication
router.use(authenticateJWT);

// Ensure uploads directory exists for temp local storage
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer storage config (temporary local storage before optional Cloudinary sync)
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max limit
  fileFilter: (_req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

const handleUploadSingle = (fieldName: string) => (req: Request, res: Response, next: any) => {
  upload.single(fieldName)(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'File upload error' });
    }
    next();
  });
};

function getFileType(mimetype: string): string {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('word')) return 'docx';
  if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'ppt';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.includes('zip')) return 'zip';
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet') || mimetype === 'text/csv') return 'excel';
  return 'other';
}

  // POST /api/upload — Upload a file (Cloudinary primary, local disk fallback)
router.post('/', handleUploadSingle('file'), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { projectId, category, description } = req.body;
    if (!projectId) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    // Verify the user is a member of the target project's team before allowing upload
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });
    if (!membership) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // ALWAYS record the authenticated user as the uploader (ignore any client-supplied uploadedById)
    const uploadedById = authReq.user.id;

    let fileUrl = `/uploads/${req.file.filename}`;
    let storageProvider = 'local';

    if (isCloudinaryConfigured()) {
      try {
        const cloudRes = await uploadLocalFileToCloudinary(
          req.file.path,
          'projectcollab/documents',
          req.file.mimetype
        );
        fileUrl = cloudRes.url;
        storageProvider = 'cloudinary';
      } catch (cloudErr: any) {
        console.warn('[Upload] Cloudinary upload failed, falling back to local file:', cloudErr.message);
      }
    }

    const document = await prisma.document.create({
      data: {
        name: req.file.originalname,
        fileUrl,
        category: category || 'other',
        projectId,
        uploadedById,
        fileType: getFileType(req.file.mimetype),
        fileSize: Number.isFinite(req.file.size) ? req.file.size : null,
        mimeType: req.file.mimetype,
        description: description || null,
        version: 1,
      },
    });

    res.json({ success: true, storageProvider, document });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/upload/file/:filename — Serve/download file (redirects to Cloudinary if remote)
router.get('/file/:filename', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    const doc = await prisma.document.findFirst({
      where: {
        OR: [
          { fileUrl: { contains: req.params.filename } },
          { name: req.params.filename },
        ],
      },
      include: { project: { select: { teamId: true } } },
    });

    if (!doc) return res.status(404).json({ success: false, message: 'File not found' });

    // Verify membership on the document's project
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: doc.project.teamId } },
    });
    if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });

    if (doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://')) {
      return res.redirect(doc.fileUrl);
    }

    const filePath = path.join(uploadsDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
    res.download(filePath);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/upload/:id — Delete document record and underlying storage
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { teamId: true } } },
    });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    // Verify membership on the document's project
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: doc.project.teamId } },
    });
    if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });

    if (doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://')) {
      await deleteFromCloudinary(doc.fileUrl, doc.mimeType);
    } else {
      const filePath = path.join(uploadsDir, path.basename(doc.fileUrl));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Document deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/upload/:id/version — Upload new version of existing doc
router.post('/:id/version', handleUploadSingle('file'), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const { notes } = req.body;
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    // Verify membership on the document's project
    const proj = await prisma.project.findUnique({
      where: { id: doc.projectId },
      select: { teamId: true },
    });
    if (proj) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: authReq.user.id, teamId: proj.teamId } },
      });
      if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const newVersion = doc.version + 1;
    let fileUrl = `/uploads/${req.file.filename}`;
    let storageProvider = 'local';

    if (isCloudinaryConfigured()) {
      try {
        const cloudRes = await uploadLocalFileToCloudinary(
          req.file.path,
          'projectcollab/documents',
          req.file.mimetype
        );
        fileUrl = cloudRes.url;
        storageProvider = 'cloudinary';
      } catch (cloudErr: any) {
        console.warn('[Upload Version] Cloudinary failed, fallback to local:', cloudErr.message);
      }
    }

    await prisma.docVersion.create({
      data: { documentId: doc.id, version: doc.version, fileUrl: doc.fileUrl, uploadedById: authReq.user.id, notes },
    });

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        fileUrl,
        version: newVersion,
        fileSize: Number.isFinite(req.file.size) ? req.file.size : doc.fileSize,
        mimeType: req.file.mimetype,
        updatedAt: new Date(),
      },
    });

    res.json({ success: true, storageProvider, document: updated });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/upload/:id/versions — Get version history
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    // Verify membership on the document's project before returning versions
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      select: { projectId: true },
    });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    const proj = await prisma.project.findUnique({
      where: { id: doc.projectId },
      select: { teamId: true },
    });
    if (proj) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: authReq.user.id, teamId: proj.teamId } },
      });
      if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });
    }

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
