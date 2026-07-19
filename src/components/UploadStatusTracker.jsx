import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import config from '../config';
import { apiClient } from '../apiClient';
import { useWebSocket } from '../contexts/WebSocketContext.jsx';
import './UploadStatusTracker.css';

const STAGES = ['received', 'validated', 'queued', 'processing', 'indexed', 'completed'];

function getStageProgress(status, stage) {
  if (status === 'failed') return 100;
  const idx = STAGES.indexOf(stage?.toLowerCase());
  if (idx === -1) return 0;
  return Math.round(((idx + 1) / STAGES.length) * 100);
}

export default function UploadStatusTracker() {
  const [uploads, setUploads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedUploadId, setExpandedUploadId] = useState(null);
  const wsClient = useWebSocket();

  const fetchUploads = useCallback(async () => {
    try {
      const res = await apiClient(`${config.orchestratorUrl}/orchestrator/uploads/recent`);
      if (res.ok) {
        const data = await res.json();
        setUploads(data.uploads || []);
      }
    } catch (err) {
      console.error('Failed to fetch recent uploads:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount, and whenever the page becomes visible again
  useEffect(() => { fetchUploads(); }, [fetchUploads]);

  // Live updates: the server pings on every pipeline stage transition —
  // just re-fetch the current list rather than trying to patch it locally.
  useEffect(() => {
    if (!wsClient) return;
    const unsubscribe = wsClient.onPing((msg) => {
      if (msg.type === 'upload_status_ping') fetchUploads();
    });
    return () => unsubscribe();
  }, [wsClient, fetchUploads]);

  if (isLoading) {
    return (
      <div className="tracker-list">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="tracker-item tracker-item-skeleton">
            <div className="item-row">
              <div className="skeleton-block" style={{ width: 140, height: 13 }} />
              <div className="skeleton-block" style={{ width: 90, height: 12 }} />
              <div className="skeleton-block" style={{ width: 70, height: 18, borderRadius: 9999 }} />
            </div>
            <div className="skeleton-block" style={{ width: '100%', height: 6 }} />
          </div>
        ))}
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="tracker-empty-state">
        <RefreshCw size={28} />
        <p>No uploads yet. Resumes you upload will show up here with live progress.</p>
      </div>
    );
  }

  return (
    <div className="upload-status-tracker-container">
      <div className="tracker-list">
        {uploads.map((u) => {
          const isFailed = u.status === 'failed';
          const isCompleted = u.status === 'completed';
          const isExpanded = expandedUploadId === u.upload_id;
          const progress = getStageProgress(u.status, u.current_stage);

          return (
            <div
              key={u.upload_id}
              className={`tracker-item ${isFailed ? 'failed' : ''} ${isCompleted ? 'completed' : ''}`}
              onClick={() => isFailed && setExpandedUploadId(isExpanded ? null : u.upload_id)}
              style={{ cursor: isFailed ? 'pointer' : 'default' }}
            >
              <div className="item-row">
                <span className="file-name" title={u.file_name}>
                  {u.file_name.length > 28 ? `${u.file_name.slice(0, 25)}...` : u.file_name}
                </span>
                <span className="candidate-name-hint" title={u.candidate_name}>
                  {u.candidate_name || '—'}
                </span>
                <span className={`stage-pill stage-${u.status}`}>
                  {u.current_stage || u.status}
                </span>
              </div>
              <div className="progress-bar-container">
                <div
                  className={`progress-fill ${isFailed ? 'failed' : ''} ${isCompleted ? 'completed' : ''}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {isExpanded && isFailed && (
                <div className="error-details">
                  <strong>Error:</strong> {u.error_message || 'Auto-extraction failed.'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
