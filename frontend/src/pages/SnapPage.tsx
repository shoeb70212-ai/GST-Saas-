import { useState, useRef  } from "react";
import { useParams } from 'react-router-dom';
import { Upload, CheckCircle, AlertCircle, Loader2, Camera } from 'lucide-react';

const SnapPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 5 * 1024 * 1024) {
        setStatus('error');
        setErrorMessage('File is too large. Maximum size is 5MB.');
        return;
      }
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setStatus('idle');
      setErrorMessage('');
    }
  };

  const handleUpload = async () => {
    if (!file || !clientId) return;

    setStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', clientId);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');
      const response = await fetch(`${apiUrl}/api/public/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Duplicate file. This document has already been submitted.');
        }
        throw new Error(result.detail || 'Failed to upload invoice');
      }

      setStatus('success');
    } catch (err: any) {
      console.error('Upload error:', err);
      setStatus('error');
      setErrorMessage(err.message || 'An unexpected error occurred.');
    }
  };

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Invoice Submitted!</h2>
          <p className="text-gray-600 mb-8">
            Your document has been successfully securely uploaded for processing.
          </p>
          <button
            onClick={() => {
              setFile(null);
              setPreview(null);
              setStatus('idle');
            }}
            className="w-full bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700 transition-colors"
          >
            Submit Another Bill
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-sm w-full">
        <div className="bg-blue-600 p-6 text-center">
          <h1 className="text-2xl font-bold text-white mb-1">KhataLens Snap</h1>
          <p className="text-blue-100 text-sm">Secure Document Submission</p>
        </div>

        <div className="p-6">
          {!preview ? (
            <div 
              className="border-3 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-lg font-medium text-gray-900 mb-1">Take a Photo</p>
              <p className="text-sm text-gray-500">or select from gallery</p>
              <p className="text-xs text-gray-400 mt-4">Max size: 5MB</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden shadow-inner border border-gray-200">
                <img src={preview} alt="Preview" className="w-full h-64 object-cover" />
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="absolute top-2 right-2 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-medium hover:bg-black/70"
                >
                  Retake
                </button>
              </div>
              
              <button
                onClick={handleUpload}
                disabled={status === 'uploading'}
                className="w-full bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:bg-blue-400"
              >
                {status === 'uploading' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Submit Document
                  </>
                )}
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{errorMessage}</p>
            </div>
          )}
          
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={handleFileChange}
          />
        </div>
      </div>
      <p className="text-gray-400 text-xs mt-6">Powered by KhataLens AI</p>
    </div>
  );
};

export default SnapPage;
