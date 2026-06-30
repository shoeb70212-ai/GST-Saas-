import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { UploadCloud, CheckCircle2, Loader2, X, Building2, FileText, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CollaborationPortal() {
  const { clientId } = useParams();
  const [files, setFiles] = useState<{id: string, file: File, preview: string|null}[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [clientName, setClientName] = useState<string>('Your CA');

  useEffect(() => {
    if (clientId) {
      // Try to fetch client name to personalize the portal
      supabase.from('clients').select('name').eq('id', clientId).single()
        .then(({data}) => {
          if (data) setClientName(data.name);
        });
    }
  }, [clientId]);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    let totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
    
    if (fileRejections.length > 0) {
       toast.error("Some files were rejected. Ensure they are under 10MB.");
    }

    const validFiles = acceptedFiles.filter(file => {
       if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 10MB limit.`);
          return false;
       }
       if (totalSize + file.size > 50 * 1024 * 1024) {
          toast.error(`Session limit of 50MB exceeded.`);
          return false;
       }
       totalSize += file.size;
       return true;
    });

    const newFiles = validFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf'],
      'application/zip': ['.zip']
    },
    maxFiles: 50,
    maxSize: 10 * 1024 * 1024,
  });

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUpload = async () => {
    if (!clientId) {
      toast.error("Invalid portal link.");
      return;
    }
    
    setIsUploading(true);
    toast.loading("Uploading documents to your accountant...", { id: "collab-upload" });
    
    // Simulate upload delay for MVP
    await new Promise(r => setTimeout(r, 2000));
    
    // In a real implementation, this would call a public backend endpoint like /api/public-upload 
    // which validates the clientId and queues background extraction on behalf of the CA.
    
    toast.success("Documents successfully sent!", { id: "collab-upload" });
    setIsUploading(false);
    setIsSuccess(true);
    setFiles([]);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-4 selection:bg-accent-subtle">
        <div className="max-w-md w-full bg-bg-surface border border-border rounded-2xl p-8 text-center shadow-xl">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Documents Sent!</h2>
          <p className="text-text-secondary mb-8">
            Your accountant has received the documents in their LedgerLens inbox and will process them shortly.
          </p>
          <button onClick={() => setIsSuccess(false)} className="btn-primary w-full justify-center">
            Upload More Documents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col font-sans selection:bg-accent-subtle relative overflow-hidden">
      {/* Abstract Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px] mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] mix-blend-screen"></div>
      </div>

      <nav className="w-full px-6 py-4 flex justify-between items-center bg-bg-surface/50 backdrop-blur-md border-b border-white/5 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-text-primary">LedgerLens Portal</span>
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10 py-12">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-subtle border border-accent/20 text-accent text-sm font-medium mb-4">
              <Building2 className="w-4 h-4" /> Secure Client Upload
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-3">Send documents to {clientName}</h1>
            <p className="text-text-secondary max-w-lg mx-auto">
              Securely upload your invoices, bills, or a ZIP folder. They will be instantly digitized and sent to your accountant's inbox.
            </p>
          </div>

          <div className="card p-1 shadow-2xl border-white/10 bg-bg-surface/80 backdrop-blur-sm">
            <div
              {...getRootProps()}
              className={`p-10 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 text-center ${
                isDragActive ? "border-accent bg-accent-subtle" : "border-border hover:border-accent hover:bg-bg-sunken bg-bg-base/50"
              }`}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 rounded-full bg-bg-sunken flex items-center justify-center mb-4 transition-transform hover:scale-110">
                <UploadCloud className={`w-8 h-8 ${isDragActive ? "text-accent" : "text-text-secondary"}`} />
              </div>
              <p className="font-semibold text-lg text-text-primary mb-1">Drag & drop your files here</p>
              <p className="text-sm text-text-secondary">Supports JPG, PNG, PDF, or ZIP (Max 50 files)</p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="mt-8 bg-bg-surface border border-border rounded-xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-border bg-bg-sunken/50 flex justify-between items-center">
                <h3 className="font-semibold text-sm text-text-primary flex items-center gap-2">
                  <FileText className="w-4 h-4 text-text-secondary"/> Selected Files ({files.length})
                </h3>
              </div>
              <div className="max-h-60 overflow-y-auto p-2 custom-scrollbar">
                {files.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 hover:bg-bg-sunken rounded-lg group transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {f.preview ? (
                         <img src={f.preview} alt="preview" className="w-10 h-10 object-cover rounded border border-border" />
                      ) : (
                        <div className="w-10 h-10 bg-bg-sunken rounded flex items-center justify-center border border-border">
                          <FileText className="w-5 h-5 text-text-secondary" />
                        </div>
                      )}
                      <span className="text-sm text-text-primary truncate">{f.file.name}</span>
                    </div>
                    <button 
                      onClick={() => removeFile(f.id)}
                      className="p-2 text-text-secondary hover:text-error hover:bg-error-subtle rounded-md transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-border bg-bg-sunken/30">
                <button 
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="btn-primary w-full justify-center py-3 text-base"
                >
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                  {isUploading ? 'Sending...' : 'Send to Accountant'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
