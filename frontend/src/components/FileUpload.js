import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-toastify';
import client from '../api/client';
import './FileUpload.css';

const FileUpload = ({ onUploadSuccess }) => {
  const onDrop = useCallback((acceptedFiles) => {
    const formData = new FormData();
    acceptedFiles.forEach(file => {
      formData.append('files', file);
    });

    client.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    .then(response => {
      const { processed = [], skipped = [] } = response.data || {};
      const processedCount = processed.length;
      const skippedCount = skipped.length;
      const summary = [
        processedCount ? `${processedCount} file${processedCount > 1 ? 's' : ''} queued` : null,
        skippedCount ? `${skippedCount} duplicate${skippedCount > 1 ? 's' : ''} skipped` : null
      ].filter(Boolean).join(' | ');
      toast.success(summary || 'Files uploaded successfully.');
      if (onUploadSuccess) onUploadSuccess(response.data); 
    })
    .catch(error => {
      console.error('Error uploading files:', error);
      const errorMessage = error.response?.data?.error || 'Failed to upload files.';
      toast.error(errorMessage);
    });
  }, [onUploadSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  return (
    <div
      {...getRootProps()}
      className={`dropzone${isDragActive ? ' dropzone--active' : ''}`}
      aria-label="Upload files"
    >
      <input {...getInputProps()} />
      <div className="dropzone__content">
        <div className="dropzone__icon" aria-hidden="true">
          Upload
        </div>
        <div>
          {/* <p className="dropzone__title">
            {isDragActive ? 'Drop to queue ingestion' : 'Drag and drop files'}
          </p> */}
          {/* <p className="dropzone__subtitle">or click to browse from your computer.</p>
          <p className="dropzone__hint">Supports Markdown, plain text, and common source files.</p> */}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
