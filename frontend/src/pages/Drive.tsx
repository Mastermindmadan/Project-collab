import { useState, useEffect } from 'react';
import { HardDrive, FolderOpen, FolderPlus, Upload, Download, Trash2, Search, File, FileText, Image, Archive, ChevronRight, Loader2 } from 'lucide-react';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';
import FileUpload from '../components/FileUpload';
import dayjs from 'dayjs';

interface Folder { id: string; name: string; _count?: { files: number; children: number } }
interface DriveFile { id: string; name: string; fileType: string; fileSize: number; mimeType: string; folderId?: string; folder?: { name: string }; uploadedBy?: { name: string }; createdAt: string; fileUrl: string }
interface Breadcrumb { id: string; name: string }

function fileIcon(type: string) {
  switch (type) {
    case 'pdf': return <FileText className="w-5 h-5 text-rose-500" />;
    case 'image': return <Image className="w-5 h-5 text-emerald-500" />;
    case 'zip': return <Archive className="w-5 h-5 text-amber-500" />;
    case 'docx': case 'ppt': return <FileText className="w-5 h-5 text-blue-500" />;
    default: return <File className="w-5 h-5 text-muted-foreground" />;
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Drive() {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DriveFile[] | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Load projects
  useEffect(() => {
    api.get('/teams/my-teams').then(res => {
      const projs: any[] = [];
      (res.data.teams || []).forEach((t: any) => (t.projects || []).forEach((p: any) => projs.push(p)));
      setProjects(projs);
      if (projs.length > 0) setSelectedProject(projs[0].id);
    }).catch(() => {});
  }, []);

  const loadDrive = async (projectId: string, folderId: string | null = null) => {
    if (!projectId) return;
    setLoading(true);
    setSearchResults(null);
    try {
      const params = folderId ? `?folderId=${folderId}` : '';
      const res = await api.get(`/drive/${projectId}${params}`);
      setFolders(res.data.folders);
      setFiles(res.data.files);
      setBreadcrumb(res.data.breadcrumb || []);
      setCurrentFolderId(folderId);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { if (selectedProject) loadDrive(selectedProject, null); }, [selectedProject]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedProject) return;
    const res = await api.get(`/drive/${selectedProject}/search?q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(res.data.files);
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !selectedProject) return;
    await api.post(`/drive/${selectedProject}/folders`, { name: newFolderName, parentId: currentFolderId });
    setNewFolderName('');
    setShowNewFolder(false);
    loadDrive(selectedProject, currentFolderId);
  };

  const deleteFile = async (id: string) => {
    if (!confirm('Delete this file?')) return;
    await api.delete(`/drive/files/${id}`);
    loadDrive(selectedProject, currentFolderId);
  };

  const deleteFolder = async (id: string) => {
    if (!confirm('Delete this folder and all its contents?')) return;
    await api.delete(`/drive/folders/${id}`);
    loadDrive(selectedProject, currentFolderId);
  };

  /**
   * Preview:
   * - PDFs → Google Docs Viewer (reliable PDF rendering, avoids Edge/Cloudinary quirks)
   * - Other files → open Cloudinary URL directly (images, videos work natively)
   * Google Docs Viewer fetches the PDF from Cloudinary's image/upload URL (publicly accessible).
   */
  const previewFile = (file: DriveFile) => {
    const url = file.fileUrl;
    if (!url) return;

    const isPdf =
      file.mimeType === 'application/pdf' ||
      file.fileType === 'pdf' ||
      url.toLowerCase().endsWith('.pdf');

    if (isPdf && (url.startsWith('http://') || url.startsWith('https://'))) {
      // Google Docs Viewer renders the PDF — bypasses Edge PDF viewer and Cloudinary content-type quirks
      const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
      window.open(viewerUrl, '_blank');
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank');
    } else {
      // Local/legacy file
      const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '');
      if (!apiBase) return;
      window.open(`${apiBase}/files/${file.id}/preview`, '_blank');
    }
  };

  /**
   * Download: fetch + Blob → forces Save As dialog with the correct filename.
   * Browser fetch() carries Origin/browser headers → Cloudinary image/upload allows it.
   * Falls back to window.open if fetch fails (CORS or network error).
   */
  const downloadFile = async (file: DriveFile) => {
    const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '');
    if (!apiBase) return;

    const url = `${apiBase}/files/${file.id}/download`;

    try {
      const response = await api.get(url, {
        responseType: 'blob',
        timeout: 120000,
      });

      const contentType = String(response.headers['content-type'] ?? 'application/octet-stream');
      const blob = new Blob([response.data as BlobPart], { type: contentType });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (err) {
      console.warn('Authenticated download failed, falling back to window.open:', err);
      window.open(url, '_blank');
    }
  };

  const displayFiles = searchResults !== null ? searchResults : files;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-primary" /> Project Drive</p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Documentation Workspace</h1>
          <p className="text-muted-foreground text-sm mt-1">Upload, organise & share project files — like Google Drive</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="glass-input text-sm rounded-xl outline-none text-foreground">
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button onClick={() => setShowNewFolder(true)} className="flex items-center gap-1.5 px-3 py-2 glass-card text-sm font-semibold text-foreground rounded-xl hover:bg-secondary transition-colors">
            <FolderPlus className="w-4 h-4" /> New Folder
          </button>
          <button onClick={() => setShowUpload(!showUpload)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors">
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search files..." className="glass-input w-full !pl-9 text-sm text-foreground" />
        </div>
        <button onClick={handleSearch} className="px-3 py-1.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl">Search</button>
        {searchResults !== null && (
          <button onClick={() => { setSearchResults(null); setSearchQuery(''); }} className="text-xs text-muted-foreground hover:text-destructive">Clear</button>
        )}
      </div>

      {/* Upload Panel */}
      {showUpload && user && selectedProject && (
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">Upload Files to {currentFolderId ? 'Folder' : 'Root'}</h3>
          <FileUpload
            projectId={selectedProject}
            uploadedById={user.id}
            driveMode={true}
            folderId={currentFolderId || undefined}
            onUploaded={() => { loadDrive(selectedProject, currentFolderId); setShowUpload(false); }}
          />
        </div>
      )}

      {/* New Folder Input */}
      {showNewFolder && (
        <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-amber-500" />
          <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
            placeholder="Folder name..." className="flex-1 bg-transparent outline-none text-foreground text-sm" />
          <button onClick={createFolder} className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-lg">Create</button>
          <button onClick={() => setShowNewFolder(false)} className="text-muted-foreground text-xs">Cancel</button>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm">
        <button onClick={() => loadDrive(selectedProject, null)} className="text-primary hover:underline font-semibold flex items-center gap-1">
          <HardDrive className="w-3.5 h-3.5" /> Root
        </button>
        {breadcrumb.map(bc => (
          <span key={bc.id} className="flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <button onClick={() => loadDrive(selectedProject, bc.id)} className="text-primary hover:underline">{bc.name}</button>
          </span>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="glass-panel rounded-2xl p-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="glass-panel rounded-3xl p-5">
          {/* Folders */}
          {!searchResults && folders.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Folders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {folders.map(f => (
                  <div key={f.id} className="glass-card p-4 rounded-xl hover:border-primary/40 transition-all cursor-pointer group relative">
                    <button onClick={() => loadDrive(selectedProject, f.id)} className="w-full text-left">
                      <FolderOpen className="w-8 h-8 text-amber-500 mb-2" />
                      <p className="text-sm font-bold text-foreground truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f._count?.files || 0} files</p>
                    </button>
                    <button onClick={() => deleteFolder(f.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {displayFiles.length > 0 ? (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                {searchResults ? `Search Results (${searchResults.length})` : 'Files'}
              </p>
              <div className="space-y-2">
                {displayFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-4 p-3 glass-card rounded-xl hover:border-primary/30 transition-all group">
                    <div className="flex-shrink-0 cursor-pointer" onClick={() => previewFile(f)}>{fileIcon(f.fileType)}</div>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => previewFile(f)} className="text-sm font-bold text-foreground truncate hover:text-primary transition-colors text-left block w-full">
                        {f.name}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(f.fileSize)} · {f.uploadedBy?.name} · {dayjs(f.createdAt).format('MMM D, YYYY')}
                        {f.folder && <span> · in {f.folder.name}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => previewFile(f)} title="Preview File" className="px-2 py-1 text-xs bg-secondary hover:bg-primary/20 hover:text-primary rounded-lg transition-colors font-medium">
                        Preview
                      </button>
                      <button onClick={() => downloadFile(f)} title="Download" className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
                        <Download className="w-4 h-4 text-primary" />
                      </button>
                      <button onClick={() => deleteFile(f.id)} title="Delete" className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-secondary rounded-full text-muted-foreground font-mono uppercase">{f.fileType}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : !folders.length ? (
            <div className="text-center py-16">
              <HardDrive className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-base font-bold text-foreground">This drive is empty</p>
              <p className="text-sm text-muted-foreground">Upload files or create a folder to get started</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
