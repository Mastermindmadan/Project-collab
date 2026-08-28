import { useState, useEffect } from 'react';
import { HardDrive, FolderOpen, FolderPlus, Upload, Download, Trash2, Search, File, FileText, Image, Archive, ChevronRight, Loader2, X, FolderInput } from 'lucide-react';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';
import { toast } from 'sonner';
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

const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

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
    try {
      const res = await api.post(`/drive/${selectedProject}/folders`, { name: newFolderName, parentId: currentFolderId });
      if (res.data?.folder) {
        setFolders(prev => [...prev, res.data.folder]);
      }
      setNewFolderName('');
      setShowNewFolder(false);
      loadDrive(selectedProject, currentFolderId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create folder.');
    }
  };

  const deleteFile = async (id: string) => {
    if (!confirm('Delete this file?')) return;
    // Immediate optimistic update
    setFiles(prev => prev.filter(f => f.id !== id));
    setSearchResults(prev => prev ? prev.filter(f => f.id !== id) : null);
    try {
      await api.delete(`/drive/files/${id}`);
      toast.success('File deleted successfully.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete file. Please try again.');
    } finally {
      loadDrive(selectedProject, currentFolderId);
    }
  };

  const [movingFile, setMovingFile] = useState<DriveFile | null>(null);
  const [availableFolders, setAvailableFolders] = useState<Folder[]>([]);

  const loadAllFolders = async (projectId: string) => {
    if (!projectId) return;
    try {
      const res = await api.get(`/drive/${projectId}`);
      setAvailableFolders(res.data.folders || []);
    } catch {}
  };

  const moveFile = async (fileId: string, targetFolderId: string | null) => {
    // Immediate optimistic update
    if (targetFolderId !== currentFolderId) {
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setSearchResults(prev => prev ? prev.filter(f => f.id !== fileId) : null);
    }
    try {
      await api.patch(`/drive/files/${fileId}/move`, { folderId: targetFolderId });
      toast.success(targetFolderId ? 'File moved to folder successfully.' : 'File moved to root successfully.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to move file.');
    } finally {
      setMovingFile(null);
      loadDrive(selectedProject, currentFolderId);
    }
  };

  const deleteFolder = async (id: string) => {
    if (!confirm('Delete this folder and all its contents?')) return;
    // Immediate optimistic update
    setFolders(prev => prev.filter(f => f.id !== id));
    try {
      await api.delete(`/drive/folders/${id}`);
      toast.success('Folder deleted successfully.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete folder. Please try again.');
    } finally {
      loadDrive(selectedProject, currentFolderId);
    }
  };

  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'pdf' | 'image' | 'text' | 'video' | 'unsupported'>('unsupported');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewIframeError, setPreviewIframeError] = useState(false);

  const getPreviewType = (file: DriveFile): 'pdf' | 'image' | 'text' | 'video' | 'unsupported' => {
    const ft = (file.fileType || '').toLowerCase();
    const mt = (file.mimeType || '').toLowerCase();
    const ext = file.fileUrl ? file.fileUrl.split('.').pop()?.toLowerCase() || '' : '';

    if (ft === 'pdf' || mt === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (ft === 'image' || mt.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (ft === 'text' || ft === 'txt' || mt === 'text/plain' || ext === 'txt') return 'text';
    if (ft === 'video' || mt.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    return 'unsupported';
  };

  const openPreview = async (file: DriveFile) => {
    const type = getPreviewType(file);
    setPreviewFile(file);
    setPreviewType(type);
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewUrl(null);
    setPreviewIframeError(false);

    try {
      const res = await api.get(`/files/${file.id}/preview`, {
        responseType: type === 'text' ? 'text' : 'blob',
      });

      if (type === 'text') {
        setPreviewUrl(typeof res.data === 'string' ? res.data : String(res.data || ''));
      } else {
        const contentType = String(res.headers['content-type'] || '');
        const blob = new Blob([res.data as BlobPart], { type: contentType });
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch (err: any) {
      console.error('Preview failed:', err);
      setPreviewError(err.response?.data?.message || 'Unable to load preview. Please use download instead.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewFile(null);
    setPreviewUrl(null);
    setPreviewError('');
    setPreviewIframeError(false);
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const iOS = isIOS();

    if (iOS) {
      window.open(url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const downloadFile = async (file: DriveFile) => {
    try {
      const response = await api.get(`/files/${file.id}/download`, {
        responseType: 'blob',
        timeout: 120000,
      });

      const contentType = String(response.headers['content-type'] ?? 'application/octet-stream');
      const blob = new Blob([response.data as BlobPart], { type: contentType });
      triggerDownload(blob, file.name);
    } catch (err: any) {
      console.error('Download failed:', err);
      toast.error(err.response?.data?.message || 'Download failed. Please try again.');
    }
  };

  const displayFiles = searchResults !== null ? searchResults : files;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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

      {showUpload && user && selectedProject && (
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">Upload Files to {currentFolderId ? 'Folder' : 'Root'}</h3>
          <FileUpload
            projectId={selectedProject}
            uploadedById={user.id}
            driveMode={true}
            folderId={currentFolderId || undefined}
            onUploaded={(doc) => {
              if (doc) {
                setFiles(prev => [doc, ...prev]);
                setSearchResults(null);
              }
              loadDrive(selectedProject, currentFolderId);
              setShowUpload(false);
              toast.success('File uploaded successfully.');
            }}
          />
        </div>
      )}

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

      {loading ? (
        <div className="glass-panel rounded-2xl p-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="glass-panel rounded-3xl p-5">
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

          {displayFiles.length > 0 ? (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                {searchResults ? `Search Results (${searchResults.length})` : 'Files'}
              </p>
              <div className="space-y-2">
                {displayFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-4 p-3 glass-card rounded-xl hover:border-primary/30 transition-all group">
                    <div className="flex-shrink-0 cursor-pointer" onClick={() => openPreview(f)}>{fileIcon(f.fileType)}</div>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => openPreview(f)} className="text-sm font-bold text-foreground truncate hover:text-primary transition-colors text-left block w-full">
                        {f.name}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(f.fileSize)} · {f.uploadedBy?.name} · {dayjs(f.createdAt).format('MMM D, YYYY')}
                        {f.folder && <span> · in {f.folder.name}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openPreview(f)} title="Preview File" className="px-2 py-1 text-xs bg-secondary hover:bg-primary/20 hover:text-primary rounded-lg transition-colors font-medium">
                        Preview
                      </button>
                      <button onClick={() => downloadFile(f)} title="Download" className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
                        <Download className="w-4 h-4 text-primary" />
                      </button>
                      <button onClick={() => { setMovingFile(f); loadAllFolders(selectedProject); }} title="Move to Folder" className="p-1.5 hover:bg-amber-500/10 rounded-lg transition-colors">
                        <FolderInput className="w-4 h-4 text-amber-500" />
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

      {previewFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-full sm:max-w-5xl h-[92vh] sm:h-auto sm:max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border flex-shrink-0">
              <h3 className="text-sm font-bold text-foreground truncate pr-2">{previewFile.name}</h3>
              <button onClick={closePreview} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="Close preview">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3 sm:p-4">
              {previewLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : previewError ? (
                <div className="text-center py-12">
                  <File className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">{previewError}</p>
                  <button onClick={() => downloadFile(previewFile)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm mx-auto">
                    <Download className="w-4 h-4" /> Download {previewFile.name}
                  </button>
                </div>
              ) : (
                <>
                  {previewType === 'pdf' ? (
                    <div className="text-center py-6 sm:py-8">
                      <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                      {isIOS() ? (
                        <>
                          <p className="text-sm text-muted-foreground mb-4">PDF preview is not supported on this device. Please download the file to view it.</p>
                          <button onClick={() => downloadFile(previewFile)} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm mx-auto min-h-[44px]">
                            <Download className="w-4 h-4" /> Download PDF
                          </button>
                        </>
                      ) : previewUrl && !previewIframeError ? (
                        <>
                          <iframe
                            src={previewUrl}
                            className="w-full h-[55vh] sm:h-[60vh] rounded-xl border border-border mb-4"
                            title={previewFile.name}
                            onError={() => setPreviewIframeError(true)}
                          />
                          <button onClick={() => downloadFile(previewFile)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm mx-auto min-h-[44px]">
                            <Download className="w-4 h-4" /> Download {previewFile.name}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground mb-4">PDF preview failed to load. <button onClick={() => downloadFile(previewFile)} className="text-primary underline font-medium">Download PDF instead</button></p>
                          <button onClick={() => downloadFile(previewFile)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm mx-auto min-h-[44px]">
                            <Download className="w-4 h-4" /> Download {previewFile.name}
                          </button>
                        </>
                      )}
                    </div>
                  ) : previewType === 'image' ? (
                    <img
                      src={previewUrl || ''}
                      alt={previewFile.name}
                      className="max-w-full max-h-[70vh] mx-auto rounded-xl"
                    />
                  ) : previewType === 'text' ? (
                    <pre className="whitespace-pre-wrap text-xs text-foreground bg-slate-950/50 rounded-xl p-4 max-h-[70vh] overflow-auto leading-relaxed">{previewUrl}</pre>
                  ) : previewType === 'video' ? (
                    <video src={previewUrl || ''} controls className="w-full max-h-[70vh] rounded-xl" />
                  ) : (
                    <div className="text-center py-12">
                      <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-4">Preview not available for this file type.</p>
                      <button onClick={() => downloadFile(previewFile)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm mx-auto">
                        <Download className="w-4 h-4" /> Download {previewFile.name}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {movingFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="glass-panel border border-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FolderInput className="w-4 h-4 text-amber-500" /> Move "{movingFile.name}"
              </h3>
              <button onClick={() => setMovingFile(null)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Select destination folder:</p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              <button
                onClick={() => moveFile(movingFile.id, null)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                  !movingFile.folderId ? 'bg-primary/20 text-primary border border-primary/40' : 'glass-card hover:bg-secondary text-foreground'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" /> Root Folder
              </button>
              {availableFolders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => moveFile(movingFile.id, folder.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                    movingFile.folderId === folder.id ? 'bg-primary/20 text-primary border border-primary/40' : 'glass-card hover:bg-secondary text-foreground'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-500" /> {folder.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setMovingFile(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
