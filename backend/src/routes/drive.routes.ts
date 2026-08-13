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

// All drive routes require authentication
router.use(authenticateJWT);

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
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    const { projectId } = req.params;
    const { folderId } = req.query;

        // Verify membership on the project's team
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Access denied' });

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
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId } = req.params;
    const q = String(req.query.q || '');

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Access denied' });

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
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId } = req.params;
    const { name, parentId } = req.body;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Access denied' });

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }

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
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const folder = await prisma.driveFolder.findUnique({
      where: { id: req.params.id },
      select: { projectId: true },
    });
    if (!folder) return res.status(404).json({ success: false, message: 'Folder not found' });

    const project = await prisma.project.findUnique({
      where: { id: folder.projectId },
      select: { teamId: true },
    });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });
    if (!member) return res.status(403).json({ success: false, message: 'Access denied' });

    await prisma.driveFolder.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Folder deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/:projectId/files — upload file to drive (Cloudinary primary, local fallback)
router.post('/:projectId/files', handleDriveUploadSingle('file'), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const { projectId } = req.params;
    const { folderId, description } = req.body;

    // Verify the user is a member of the target project's team
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) {
      if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });
    if (!member) {
      if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // ALWAYS use the authenticated user as uploader
    const uploadedById = authReq.user.id;

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
        fileSize: Number.isFinite(req.file.size) ? req.file.size : 0,
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
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    const file = await prisma.driveFile.findUnique({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    // Verify membership on the file's project
    const proj = await prisma.project.findUnique({
      where: { id: file.projectId },
      select: { teamId: true },
    });
    if (proj) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: authReq.user.id, teamId: proj.teamId } },
      });
      if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://')) {
      await deleteFromCloudinary(file.fileUrl, file.mimeType);
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
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
    const file = await prisma.driveFile.findUnique({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    // Verify membership on the file's project
    const proj = await prisma.project.findUnique({
      where: { id: file.projectId },
      select: { teamId: true },
    });
    if (proj) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: authReq.user.id, teamId: proj.teamId } },
      });
      if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });
    }

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
