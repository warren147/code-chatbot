import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './FileList.css';
import { ClipLoader } from 'react-spinners'; 
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const FileList = ({ refresh }) => { 
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:5001/files');
      setFiles(response.data.files);
      setError(null);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError(err.response ? err.response.data.error : 'Network Error');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFiles();
  }, [refresh]);

  const handleDelete = async (fileId) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this file?');
    if (!confirmDelete) return;

    try {
      setDeletingId(fileId); 
      await axios.delete(`http://localhost:5001/files/${fileId}`);
      toast.success('File deleted successfully.');
      setDeletingId(null);
      fetchFiles();
    } catch (err) {
      console.error('Error deleting file:', err);
      toast.error(err.response && err.response.data && err.response.data.error 
        ? `Error: ${err.response.data.error}`
        : 'Failed to delete the file.');
      setDeletingId(null);
    }
  };

  if (loading) return <ClipLoader color="#36d7b7" />; 
  if (error) return (
    <div>
      <p>Error: {error}</p>
      <button onClick={fetchFiles}>Retry</button>
    </div>
  );

  return (
    <div className="file-list-container">
      <h2>Uploaded Files</h2>
      {files.length === 0 ? (
        <p>No files uploaded yet.</p>
      ) : (
        <ul className="file-list">
          {files.map(file => (
            <li key={file.id} className="file-item">
              <div className="file-info">
                <span className="file-name">{file.fileName}</span>
                <span className="upload-date">{new Date(file.uploadDate).toLocaleString()}</span>
              </div>
              <button 
                className="delete-button" 
                onClick={() => handleDelete(file.id)}
                disabled={deletingId === file.id}
                title="Delete File"
              >
                {deletingId === file.id ? 'Deleting...' : '✖'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileList;