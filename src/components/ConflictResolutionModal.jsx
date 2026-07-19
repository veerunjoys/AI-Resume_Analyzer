import React, { useState } from 'react';
import config from '../config.js';
import * as offlineQueue from '../utils/offlineQueue.js';
import wsClient from '../utils/webSocketClient.js';
import './ConflictResolutionModal.css';

export default function ConflictResolutionModal({
  isOpen,
  conflictData,
  candidate,
  onResolveSuccess,
  onEditManually,
  onClose
}) {
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !conflictData) return null;

  // Handler for Keep Mine
  const handleKeepMine = async () => {
    setIsResolving(true);
    setError(null);
    try {
      // Build body merging keep-mine values for conflicting fields
      const updateBody = {
        expectedVersion: conflictData.current_version,
      };

      // Set conflicting fields to client/yourValue
      conflictData.conflicts.forEach(c => {
        updateBody[c.field] = c.yourValue;
      });

      // Fetch the API endpoint
      const headers = {
        'Content-Type': 'application/json',
      };
      if (wsClient.clientId) {
        headers['X-Client-Id'] = wsClient.clientId;
      }

      const res = await fetch(`${config.apiBaseUrl}/api/candidates/${candidate.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateBody),
      });

      if (res.status === 409) {
        const data = await res.json();
        setError(`Another process modified this candidate again (v${data.currentVersion}). Please reload.`);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resolve with your changes.');
      }

      const resolvedCandidate = await res.json();
      
      // Delete the conflict from IndexedDB
      await offlineQueue.removeConflict(candidate.id);

      if (onResolveSuccess) {
        onResolveSuccess(resolvedCandidate);
      }
    } catch (err) {
      setError(err.message || 'Error occurred while resolving conflict.');
    } finally {
      setIsResolving(false);
    }
  };

  // Handler for Keep Theirs
  const handleKeepTheirs = async () => {
    setIsResolving(true);
    setError(null);
    try {
      // Build body merging keep-theirs values for conflicting fields
      const updateBody = {
        expectedVersion: conflictData.current_version,
      };

      // Set conflicting fields to server/theirValue
      conflictData.conflicts.forEach(c => {
        updateBody[c.field] = c.theirValue;
      });

      // Fetch the API endpoint
      const headers = {
        'Content-Type': 'application/json',
      };
      if (wsClient.clientId) {
        headers['X-Client-Id'] = wsClient.clientId;
      }

      const res = await fetch(`${config.apiBaseUrl}/api/candidates/${candidate.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateBody),
      });

      if (res.status === 409) {
        const data = await res.json();
        setError(`Another process modified this candidate again (v${data.currentVersion}). Please reload.`);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resolve with server values.');
      }

      const resolvedCandidate = await res.json();

      // Delete the conflict from IndexedDB
      await offlineQueue.removeConflict(candidate.id);

      if (onResolveSuccess) {
        onResolveSuccess(resolvedCandidate);
      }
    } catch (err) {
      setError(err.message || 'Error occurred while resolving conflict.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleEditManuallyClick = async () => {
    setError(null);
    try {
      // Remove conflict from IndexedDB conflicts store
      await offlineQueue.removeConflict(candidate.id);

      // Pre-fill fields: we want to extract theirValues (server values) from conflictData
      const prefillValues = {};
      conflictData.conflicts.forEach(c => {
        prefillValues[c.field] = c.theirValue;
      });

      if (onEditManually) {
        onEditManually(prefillValues);
      }
    } catch (err) {
      setError('Failed to transition to manual edit.');
    }
  };

  return (
    <div className="resolution-modal-backdrop">
      <div className="resolution-modal-container animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="resolution-header">
          <span className="warning-icon">
            <svg className="css-icon svg-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ef4444', width: '24px', height: '24px' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </span>
          <h2>Resolve Synchronization Conflict</h2>
        </div>

        <div className="resolution-body">
          <p className="resolution-desc">
            Offline modifications for <strong>{candidate.name}</strong> clashed with server updates. Please resolve the differences below.
          </p>

          {error && (
            <div className="resolution-error">
              <span>{error}</span>
            </div>
          )}

          <div className="diff-list">
            {conflictData.conflicts.map(c => (
              <div key={c.field} className="diff-item">
                <div className="diff-field-name">{c.field.toUpperCase()}</div>
                <div className="diff-side-by-side">
                  <div className="diff-panel diff-yours">
                    <span className="diff-panel-title">Your Offline Change</span>
                    <div className="diff-value">
                      {c.yourValue || <span className="diff-empty">empty</span>}
                    </div>
                  </div>
                  <div className="diff-panel diff-theirs">
                    <span className="diff-panel-title">Current Server Value</span>
                    <div className="diff-value">
                      {c.theirValue || <span className="diff-empty">empty</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="resolution-footer">
          <button
            className="resolution-btn keep-mine"
            onClick={handleKeepMine}
            disabled={isResolving}
          >
            {isResolving ? 'Resolving...' : 'Keep Mine'}
          </button>
          <button
            className="resolution-btn keep-theirs"
            onClick={handleKeepTheirs}
            disabled={isResolving}
          >
            {isResolving ? 'Resolving...' : 'Keep Theirs'}
          </button>
          <button
            className="resolution-btn edit-manually"
            onClick={handleEditManuallyClick}
            disabled={isResolving}
          >
            Edit Manually
          </button>
          <button
            className="resolution-btn close-btn"
            onClick={onClose}
            disabled={isResolving}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
