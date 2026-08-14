import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, FileText, Image, Archive, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import api from '../utils/api';

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  result?: any;
}

interface FileUploadProps {
  projectId: string;
  uploadedById: string;
  category?: string;
  onUploaded?: (doc: any) => void;
  folderId?: string; // for Drive uploads
  driveMode?: boolean; // true = upload to /api/drive/:projectId/files
}

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return <Image className="w-5 h-5 text-emerald-500" />;
  if (['zip'].includes(ext || '')) return <Archive className="w-5 h-5 text-amber-500" />;
  if (['pdf'].includes(ext || '')) return <FileText className="w-5 h-5 text-rose-500" />;
  return <File className="w-5 h-5 text-blue-500" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUpload({ projectId, uploadedById, category = 'other', onUploaded, folderId, driveMode = false }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: UploadedFile[] = accepted.map(f => ({ file: f, status: 'pending', progress: 0 }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT, maxSize: 50 * 1024 * 1024,
  });

  const uploadFile = async (idx: number) => {
    const item = files[idx];
    if (!item || item.status === 'uploading' || item.status === 'done') return;

    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'uploading', progress: 10 } : f));

    try {
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('projectId', projectId);
      formData.append('uploadedById', uploadedById);
      formData.append('category', category);
      if (folderId) formData.append('folderId', folderId);

      const endpoint = driveMode
        ? `/drive/${projectId}/files`
        : '/upload';

      const res = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
        onUploadProgress: (e) => {
          if (!e.total) return;
          const pct = Math.round(((e.loaded || 0) / e.total) * 90) + 10;
          setFiles(prev => prev.map((f, i) => i === idx ? { ...f, progress: Math.min(pct, 100) } : f));
        },
      });

      const doc = driveMode ? res.data.file : res.data.document;
      setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'done', progress: 100, result: doc } : f));
      onUploaded?.(doc);
    } catch (err: any) {
      setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'error', error: err.response?.data?.message || 'Upload failed' } : f));
    }
  };

  const uploadAll = () => files.forEach((_, i) => uploadFile(i));
  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragActive ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50 hover:bg-primary/3'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className={`w-10 h-10 mx-auto mb-3 transition-colors ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
        <p className="text-sm font-bold text-foreground mb-1">
          {isDragActive ? 'Drop files here' : 'Drag & drop files or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground">PDF, DOCX, PPT, Images (JPG/PNG), ZIP — Max 50MB each</p>
      </div>

      {/* File Queue */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 glass-card p-3 rounded-xl">
              <div className="flex-shrink-0">{fileIcon(item.file.name)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(item.file.size)}</p>
                {item.status === 'uploading' && (
                  <div className="mt-1.5 w-full bg-secondary rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-primary transition-all duration-300" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
                {item.status === 'error' && (
                  <p className="text-xs text-destructive mt-0.5">{item.error}</p>
                )}
              </div>
              <div className="flex-shrink-0">
                {item.status === 'pending' && (
                  <button onClick={() => uploadFile(idx)} className="px-3 py-1 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                    Upload
                  </button>
                )}
                {item.status === 'uploading' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                {item.status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {item.status === 'error' && <AlertCircle className="w-5 h-5 text-destructive" />}
                {item.status !== 'uploading' && (
                  <button onClick={() => removeFile(idx)} className="ml-2 text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {files.some(f => f.status === 'pending') && (
            <button
              onClick={uploadAll}
              className="w-full py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
            >
              Upload All ({files.filter(f => f.status === 'pending').length} files)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
