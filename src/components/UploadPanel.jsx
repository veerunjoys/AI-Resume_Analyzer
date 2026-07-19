import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, AlertTriangle } from 'lucide-react';
import { createResumableUpload } from '../utils/resumableUpload';
import './UploadPanel.css';

export default function UploadPanel({ candidateId, onUploadComplete }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // 'idle' | 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled'
  const [failedChunks, setFailedChunks] = useState([]);
  const [uploadController, setUploadController] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Cancel any active upload if candidateId changes (user clicked another candidate)
  useEffect(() => {
    if (uploadController) {
      uploadController.cancel();
    }
    setFile(null);
    setUploadProgress(0);
    setUploadStatus('idle');
    setFailedChunks([]);
    setUploadController(null);
    setErrorMessage('');
  }, [candidateId]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      startUploadFlow(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      startUploadFlow(e.target.files[0]);
    }
  };

  const startUploadFlow = (selectedFile) => {
    setFile(selectedFile);
    setUploadProgress(0);
    setFailedChunks([]);
    setErrorMessage('');
    
    // Create new resumable upload controller
    const controller = createResumableUpload(selectedFile, candidateId, {
      onProgress: (progress, meta) => {
        setUploadProgress(progress);
        if (meta && meta.failedChunks) {
          setFailedChunks(meta.failedChunks);
        }
      },
      onComplete: (result) => {
        setUploadStatus('completed');
        if (onUploadComplete) onUploadComplete(result);
      },
      onError: (err) => {
        setUploadStatus('failed');
        setErrorMessage(err.message || 'An error occurred during upload.');
      },
    });

    setUploadController(controller);
    setUploadStatus('uploading');
    controller.start();
  };

  const handlePause = () => {
    if (uploadController) {
      uploadController.pause();
      setUploadStatus('paused');
    }
  };

  const handleResume = () => {
    if (uploadController) {
      setUploadStatus('uploading');
      setErrorMessage('');
      uploadController.resume();
    }
  };

  const handleCancel = () => {
    if (uploadController) {
      uploadController.cancel();
    }
    setFile(null);
    setUploadProgress(0);
    setUploadStatus('idle');
    setFailedChunks([]);
    setUploadController(null);
    setErrorMessage('');
  };

  const handleRetryChunk = (chunkIndex) => {
    if (uploadController) {
      setUploadStatus('uploading');
      uploadController.retryChunk(chunkIndex);
    }
  };

  // Render Drag & Drop Area
  if (uploadStatus === 'idle') {
    return (
      <div className="upload-panel-wrapper">
        <div
          className={`drag-drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <span className="upload-icon-main">
            <UploadCloud className="css-icon svg-upload" size={36} style={{ stroke: 'var(--text)' }} />
          </span>
          <p className="drag-instructions">
            Drag & Drop candidate resume here, or{' '}
            <label className="file-input-label">
              browse files
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="hidden-file-input"
                onChange={handleFileChange}
              />
            </label>
          </p>
          <span className="supported-formats-text">Supported formats: PDF, DOC, DOCX, TXT (Max 50MB)</span>
        </div>
      </div>
    );
  }

  // Render Upload Progress Area
  return (
    <div className="upload-panel-wrapper">
      <div className="upload-progress-card">
        <div className="progress-card-header">
          <span className="file-info-label" title={file.name}>
            <FileText className="css-icon svg-file" style={{ marginRight: '6px' }} />
            {file.name}
          </span>
          <span className={`upload-status-pill status-${uploadStatus}`}>
            {uploadStatus}
          </span>
        </div>

        <div className="progress-bar-container">
          <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
          <span className="progress-percentage-label">{uploadProgress}%</span>
        </div>

        {errorMessage && (
          <div className="upload-error-msg">
            <AlertTriangle className="css-icon svg-alert" style={{ flexShrink: 0 }} />
            {errorMessage}
          </div>
        )}

        {/* Failed Chunks retry UI */}
        {failedChunks.length > 0 && (
          <div className="failed-chunks-section">
            <span className="failed-title">Failed Parts:</span>
            <div className="failed-chips-container">
              {failedChunks.map((idx) => (
                <div key={idx} className="failed-chunk-chip">
                  <span>Part #{idx + 1}</span>
                  <button
                    type="button"
                    className="retry-chunk-btn"
                    onClick={() => handleRetryChunk(idx)}
                  >
                    Retry
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controller buttons */}
        <div className="progress-card-actions">
          {uploadStatus === 'uploading' && (
            <button type="button" className="action-btn pause" onClick={handlePause}>
              Pause
            </button>
          )}
          {uploadStatus === 'paused' && (
            <button type="button" className="action-btn resume" onClick={handleResume}>
              Resume
            </button>
          )}
          {uploadStatus === 'failed' && (
            <button type="button" className="action-btn resume" onClick={handleResume}>
              Retry All
            </button>
          )}
          
          {uploadStatus !== 'completed' && (
            <button type="button" className="action-btn cancel" onClick={handleCancel}>
              Cancel
            </button>
          )}

          {uploadStatus === 'completed' && (
            <button type="button" className="action-btn new-upload" onClick={handleCancel}>
              Upload New
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
