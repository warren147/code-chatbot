import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ClipLoader } from 'react-spinners';
import { toast } from 'react-toastify';
import client from '../api/client';
import Modal from './Modal';
import './FileList.css';

const FileList = ({ refresh }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDeletion, setPendingDeletion] = useState(null);
  const pollingRef = useRef(null);

  const fetchFiles = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const response = await client.get('/files');
      setFiles(response.data.files || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError(err.response ? err.response.data.error : 'Network Error');
    }
    if (!silent) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles, refresh]);

  useEffect(() => {
    const asyncStatuses = new Set(['processing', 'queued']);
    const shouldPoll = files.some(file => asyncStatuses.has((file.status || '').toLowerCase()));

    if (shouldPoll && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        fetchFiles({ silent: true });
      }, 4000);
    }

    if (!shouldPoll && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [files, fetchFiles]);

  const confirmDelete = (file) => {
    setPendingDeletion(file);
  };

  const handleDelete = async () => {
    if (!pendingDeletion) return;

    try {
      setDeletingId(pendingDeletion.id);
      await client.delete(`/files/${pendingDeletion.id}`);
      toast.success('File deleted successfully.');
      setPendingDeletion(null);
      setDeletingId(null);
      fetchFiles();
    } catch (err) {
      console.error('Error deleting file:', err);
      const errorMessage =
        err.response && err.response.data && err.response.data.error
          ? err.response.data.error
          : 'Failed to delete the file.';
      toast.error(errorMessage);
      setDeletingId(null);
    }
  };

  const closeModal = () => setPendingDeletion(null);

  if (loading) return <ClipLoader color="#5b8def" />;
  if (error) return (
    <div>
      <p>Error: {error}</p>
      <button onClick={fetchFiles}>Retry</button>
    </div>
  );

  const fileCount = files.length;

  return (
    <div className="file-list-container">
      <div className="file-list-header">
        <h2>Knowledge queue</h2>
        <span className="file-count">{fileCount} file{fileCount === 1 ? '' : 's'}</span>
      </div>
      {fileCount === 0 ? (
        <div className="file-empty-state">
          Drop files to start ingesting your knowledge base. We'll show processing status here.
        </div>
      ) : (
        <ul className="file-list">
          {files.map((file) => {
            const statusRaw = (file.status || 'unknown').toLowerCase();
            const statusClass = statusRaw.replace(/\s+/g, '-');
            const statusLabel = statusRaw
              .split(/[\s_-]+/)
              .map((part) => part ? part[0].toUpperCase() + part.slice(1) : '')
              .join(' ')
              || 'Unknown';
            return (
              <li key={file.id} className="file-item">
                <div className="file-info">
                  <span className="file-name">{file.fileName}</span>
                  <span className="upload-date">{new Date(file.uploadDate).toLocaleString()}</span>
                  <div className="file-meta">
                    <span className={`status-badge status-${statusClass}`}>
                      {statusLabel}
                    </span>
                    <span className="chunk-count">
                      {file.chunkCount} chunk{file.chunkCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {file.error && (
                    <div className="file-error">
                      Last error: {file.error}
                    </div>
                  )}
                </div>
                <button
                  className="delete-button"
                  onClick={() => confirmDelete(file)}
                  disabled={deletingId === file.id}
                  title="Delete file"
                  aria-label={`Delete ${file.fileName}`}
                >
                  {deletingId === file.id ? 'Working...' : 'Delete'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        isOpen={Boolean(pendingDeletion)}
        onClose={closeModal}
        onConfirm={handleDelete}
        title="Delete File"
        confirmLabel="Delete"
      >
        <p>
          Delete <strong>{pendingDeletion?.fileName}</strong> and its embeddings?
        </p>
      </Modal>
    </div>
  );
};

export default FileList;
