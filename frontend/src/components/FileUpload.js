
import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import './FileUpload.css'; 

const FileUpload = ({ onUploadSuccess }) => { 
  const onDrop = useCallback((acceptedFiles) => {
    const formData = new FormData();
    acceptedFiles.forEach(file => {
      formData.append('files', file);
    });

    axios.post('http://localhost:5001/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    .then(response => {
      alert('Files uploaded successfully!');
      if (onUploadSuccess) onUploadSuccess(); 
    })
    .catch(error => {
      console.error('Error uploading files:', error);
      alert('Failed to upload files.');
    });
  }, [onUploadSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  return (
    <div {...getRootProps()} className="dropzone">
      <input {...getInputProps()} />
      {
        isDragActive ?
          <p>Drop the files here...</p> :
          <p>Drag & drop some files here, or click to select files</p>
      }
    </div>
  );
};

export default FileUpload;