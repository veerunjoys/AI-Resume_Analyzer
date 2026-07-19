import React, { useState, useEffect } from 'react';
import config from '../config';
import { apiClient } from '../apiClient';
import UploadPanel from './UploadPanel';
import * as connectivityStatus from '../utils/connectivityStatus';
import * as offlineQueue from '../utils/offlineQueue';
import { syncOfflineActions } from '../utils/syncManager';
import ConflictResolutionModal from './ConflictResolutionModal';
import wsClient from '../utils/webSocketClient';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Compass, 
  Award, 
  Calendar, 
  Layers, 
  Trash2, 
  Edit, 
  Save, 
  X, 
  Eye, 
  FileText, 
  ArrowLeft, 
  Check,
  AlertTriangle,
  Briefcase
} from 'lucide-react';
import './CandidateDetailPanel.css';

const STATUSES_POOL = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected'];
const SOURCES_POOL = ['Referral', 'Job board', 'Direct', 'Other'];

function scoreTier(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export default function CandidateDetailPanel({ candidateId, onSaveSuccess, lastUpdatedCandidate, onClose }) {
  const [candidate, setCandidate] = useState(null);
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  
  // Fields for Editing
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('Referral');
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState('');
  const [experience, setExperience] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [conflictRecord, setConflictRecord] = useState(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Resume Parsing States
  const [parsedData, setParsedData] = useState(null);
  const [isParsedSectionOpen, setIsParsedSectionOpen] = useState(true);

  // AI Analysis (resume-quality score) States
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAnalysisSectionOpen, setIsAnalysisSectionOpen] = useState(true);

  // Fetch parsed resume data for Draft candidates
  useEffect(() => {
    const fetchParsedData = async () => {
      if (candidate && candidate.status === 'Draft') {
        try {
          const res = await apiClient(`${config.apiBaseUrl}/api/candidates/${candidate.id}/parsed-resume`);
          if (res.ok) {
            const data = await res.json();
            setParsedData(data);
          } else {
            setParsedData(null);
          }
        } catch (err) {
          console.error('Error loading parsed data:', err);
          setParsedData(null);
        }
      } else {
        setParsedData(null);
      }
    };
    fetchParsedData();
  }, [candidate]);

  // Fetch AI resume-quality analysis (available for any candidate who has had a resume processed)
  useEffect(() => {
    const fetchAiAnalysis = async () => {
      if (!candidate) {
        setAiAnalysis(null);
        return;
      }
      try {
        const res = await apiClient(`${config.apiBaseUrl}/api/candidates/${candidate.id}/ai-analysis`);
        setAiAnalysis(res.ok ? await res.json() : null);
      } catch (err) {
        console.error('Error loading AI analysis:', err);
        setAiAnalysis(null);
      }
    };
    fetchAiAnalysis();
  }, [candidate]);

  // Handle WebSocket updates
  useEffect(() => {
    if (lastUpdatedCandidate && candidate && lastUpdatedCandidate.id === candidate.id) {
      if (lastUpdatedCandidate.version > candidate.version) {
        setCandidate(lastUpdatedCandidate);
        setStatus(lastUpdatedCandidate.status);
        setNotes(lastUpdatedCandidate.notes || '');
        setName(lastUpdatedCandidate.name || '');
        setEmail(lastUpdatedCandidate.email || '');
        setPhone(lastUpdatedCandidate.phone || '');
        setLocation(lastUpdatedCandidate.location || '');
        setSource(lastUpdatedCandidate.source || 'Referral');
        setSkills(lastUpdatedCandidate.skills || []);
        setExperience(lastUpdatedCandidate.experience !== null && lastUpdatedCandidate.experience !== undefined ? lastUpdatedCandidate.experience.toString() : '');
      }
    }
  }, [lastUpdatedCandidate, candidate]);

  // Sync on connectivity restore
  useEffect(() => {
    let prevStatus = connectivityStatus.getStatus();
    const unsubscribe = connectivityStatus.onChange((newStatus) => {
      if (prevStatus === 'offline' && newStatus === 'online') {
        console.log('[Candidate Detail] Network restored. Triggering sync...');
        syncOfflineActions();
      }
      prevStatus = newStatus;
    });
    return () => unsubscribe();
  }, []);

  const loadCandidateData = async (targetId) => {
    if (!targetId) {
      setCandidate(null);
      setConflictRecord(null);
      setIsResolutionModalOpen(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);
    setIsEditing(false); // reset edit state when loading new candidate
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/candidates/${targetId}`);
      if (!res.ok) {
        throw new Error('Failed to load candidate details.');
      }
      let data = await res.json();

      // Merge offline pending edits
      const pendingEdits = await offlineQueue.getAll();
      const pending = pendingEdits.find((p) => p.candidate_id === targetId);
      if (pending) {
        data = {
          ...data,
          ...pending.changes,
          pendingSync: true,
        };
      }

      setCandidate(data);
      setStatus(data.status);
      setNotes(data.notes || '');
      setName(data.name || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setLocation(data.location || '');
      setSource(data.source || 'Referral');
      setSkills(data.skills || []);
      setExperience(data.experience !== null && data.experience !== undefined ? data.experience.toString() : '');

      const conflict = await offlineQueue.getConflict(targetId);
      setConflictRecord(conflict);
      if (conflict) {
        setIsResolutionModalOpen(true);
      } else {
        setIsResolutionModalOpen(false);
      }
    } catch (err) {
      setError(err.message || 'Error fetching details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCandidateData(candidateId);
  }, [candidateId]);

  useEffect(() => {
    const handleSyncCompleted = () => {
      if (candidateId) {
        loadCandidateData(candidateId);
      }
    };
    window.addEventListener('sync-completed', handleSyncCompleted);
    return () => window.removeEventListener('sync-completed', handleSyncCompleted);
  }, [candidateId]);

  const handleSave = async () => {
    if (!candidate) return;

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    const changes = { status, notes, name, email, phone: phone || null, location: location || null, source, skills, experience: experience === '' ? null : parseFloat(experience) };

    if (connectivityStatus.getStatus() === 'online') {
      try {
        const headers = {
          'Content-Type': 'application/json',
        };
        if (wsClient.clientId) {
          headers['X-Client-Id'] = wsClient.clientId;
        }

        const res = await apiClient(`${config.apiBaseUrl}/api/candidates/${candidate.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            expectedVersion: candidate.version,
            ...changes,
          }),
        });

        if (res.status === 409) {
          setError('This candidate was changed elsewhere — please refresh');
          return;
        }

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update candidate.');
        }

        const updatedCandidate = await res.json();
        setCandidate(updatedCandidate);
        setStatus(updatedCandidate.status);
        setNotes(updatedCandidate.notes || '');
        setName(updatedCandidate.name || '');
        setEmail(updatedCandidate.email || '');
        setPhone(updatedCandidate.phone || '');
        setLocation(updatedCandidate.location || '');
        setSource(updatedCandidate.source || 'Referral');
        setSkills(updatedCandidate.skills || []);
        setExperience(updatedCandidate.experience !== null && updatedCandidate.experience !== undefined ? updatedCandidate.experience.toString() : '');
        setSuccessMsg('Profile updated successfully!');
        setIsEditing(false); // turn off editing mode
        
        if (onSaveSuccess) {
          onSaveSuccess(updatedCandidate);
        }
      } catch (err) {
        setError(err.message || 'Error occurred during save.');
      } finally {
        setIsSaving(false);
      }
    } else {
      try {
        await offlineQueue.enqueue({
          candidate_id: candidate.id,
          base_version: candidate.version,
          changes,
        });

        const optimisticCandidate = {
          ...candidate,
          ...changes,
          pendingSync: true,
        };

        setCandidate(optimisticCandidate);
        setStatus(optimisticCandidate.status);
        setNotes(optimisticCandidate.notes || '');
        setName(optimisticCandidate.name || '');
        setEmail(optimisticCandidate.email || '');
        setPhone(optimisticCandidate.phone || '');
        setLocation(optimisticCandidate.location || '');
        setSource(optimisticCandidate.source || 'Referral');
        setSkills(optimisticCandidate.skills || []);
        setExperience(optimisticCandidate.experience !== null && optimisticCandidate.experience !== undefined ? optimisticCandidate.experience.toString() : '');
        setIsEditing(false);

        if (onSaveSuccess) {
          onSaveSuccess(optimisticCandidate);
        }
        setSuccessMsg('Offline: Changes saved locally and queued for sync!');
      } catch (err) {
        setError('Failed to queue offline changes.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleConfirmProfile = async () => {
    if (!candidate) return;
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    const changes = {
      name,
      email,
      phone: phone || null,
      location: location || null,
      skills,
      notes,
      source,
      experience: experience === '' ? null : parseFloat(experience),
      status: 'Applied', // Promote to Applied
    };

    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/candidates/${candidate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: candidate.version,
          ...changes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to confirm candidate.');
      }

      const confirmedCandidate = await res.json();
      setCandidate(confirmedCandidate);
      setStatus(confirmedCandidate.status);
      setNotes(confirmedCandidate.notes || '');
      setName(confirmedCandidate.name || '');
      setEmail(confirmedCandidate.email || '');
      setPhone(confirmedCandidate.phone || '');
      setLocation(confirmedCandidate.location || '');
      setSource(confirmedCandidate.source || 'Referral');
      setSkills(confirmedCandidate.skills || []);
      setExperience(confirmedCandidate.experience !== null && confirmedCandidate.experience !== undefined ? confirmedCandidate.experience.toString() : '');
      setSuccessMsg('Profile confirmed and status updated to Applied!');

      if (onSaveSuccess) {
        onSaveSuccess(confirmedCandidate);
      }
    } catch (err) {
      setError(err.message || 'Error occurred during confirmation.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!candidate) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/candidates/${candidate.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to discard draft.');
      }

      // Notify parent to remove row and clear selection
      if (onSaveSuccess) {
        onSaveSuccess({ id: candidate.id, isDeleted: true });
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Error occurred discarding draft.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCandidate = async () => {
    if (!candidate) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/candidates/${candidate.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete candidate.');
      }

      // Notify parent to remove row in-place and clear panel
      if (onSaveSuccess) {
        onSaveSuccess({ id: candidate.id, isDeleted: true });
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Error occurred deleting candidate.');
    } finally {
      setIsSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDownloadResume = async (e) => {
    e.preventDefault();
    if (!candidate || !candidate.resume_s3_key) return;
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/files/resume/${candidate.id}`);
      if (!res.ok) {
        throw new Error('Resume file not found on server.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', candidate.resume_s3_key.split('/').pop());
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      alert(err.message || 'Failed to download resume.');
    }
  };

  const handleUploadComplete = (filePath) => {
    if (candidate) {
      const updated = {
        ...candidate,
        resume_s3_key: filePath,
      };
      setCandidate(updated);
      if (onSaveSuccess) {
        onSaveSuccess(updated);
      }
      // Let the progress bar visibly settle at 100% / "completed" before
      // swapping back to the resume-attachment view, instead of an instant cut.
      setTimeout(() => setShowUploadForm(false), 700);
    }
  };

  const handleResolveSuccess = (resolvedRecord) => {
    setConflictRecord(null);
    setIsResolutionModalOpen(false);
    setCandidate(resolvedRecord);
    setStatus(resolvedRecord.status);
    setNotes(resolvedRecord.notes || '');
    setName(resolvedRecord.name || '');
    setEmail(resolvedRecord.email || '');
    setPhone(resolvedRecord.phone || '');
    setLocation(resolvedRecord.location || '');
    setSource(resolvedRecord.source || 'Referral');
    setSkills(resolvedRecord.skills || []);

    if (onSaveSuccess) {
      onSaveSuccess(resolvedRecord);
    }
  };

  const handleEditManually = () => {
    setIsResolutionModalOpen(false);
  };

  const handleAddSkill = (e) => {
    e.preventDefault();
    const cleanSkill = skillInput.trim();
    if (cleanSkill && !skills.includes(cleanSkill)) {
      setSkills([...skills, cleanSkill]);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const applyField = (fieldKey, value) => {
    setIsEditing(true);
    switch (fieldKey) {
      case 'name': setName(value || ''); break;
      case 'email': setEmail(value || ''); break;
      case 'phone': setPhone(value || ''); break;
      case 'location': setLocation(value || ''); break;
      case 'experience': setExperience(value !== null && value !== undefined ? value.toString() : ''); break;
      case 'skills': setSkills(Array.isArray(value) ? value : []); break;
      default: break;
    }
  };

  const handleApplyAllHighConfidence = () => {
    if (!parsedData || !parsedData.parsed_data) return;
    Object.entries(parsedData.parsed_data).forEach(([fieldKey, data]) => {
      if (data && data.confidence === 'high') {
        applyField(fieldKey, data.value);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="details-modal-overlay">
        <div className="details-card">
          <div className="detail-skeleton">
            <div className="skeleton-block" style={{ width: '55%', height: 22 }} />
            <div className="skeleton-block" style={{ width: '100%', height: 42 }} />
            <div className="detail-skeleton-row">
              <div className="skeleton-block" style={{ width: '100%', height: 42 }} />
              <div className="skeleton-block" style={{ width: '100%', height: 42 }} />
            </div>
            <div className="detail-skeleton-row">
              <div className="skeleton-block" style={{ width: '100%', height: 42 }} />
              <div className="skeleton-block" style={{ width: '100%', height: 42 }} />
            </div>
            <div className="skeleton-block" style={{ width: '40%', height: 16 }} />
            <div className="skeleton-block" style={{ width: '100%', height: 80 }} />
          </div>
        </div>
      </div>
    );
  }

  if (error && !candidate) {
    return (
      <div className="details-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="details-card empty-state">
          <span className="empty-icon">⚠️</span>
          <h3>Error loading profile</h3>
          <p>{error}</p>
          <button className="cancel-form-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (!candidate) {
    return null;
  }

  // Get field extraction confidence helper
  const getFieldConfidence = (field) => {
    if (!candidate.extraction_metadata || !candidate.extraction_metadata.fields) return null;
    return candidate.extraction_metadata.fields[field]?.confidence || null;
  };

  // Low confidence helper mapping
  const hasLowConfidence = (field) => {
    return getFieldConfidence(field) === 'low';
  };

  const hasChanges = 
    status !== candidate.status || 
    notes !== (candidate.notes || '') ||
    name !== (candidate.name || '') ||
    email !== (candidate.email || '') ||
    phone !== (candidate.phone || '') ||
    location !== (candidate.location || '') ||
    source !== (candidate.source || 'Referral') ||
    experience !== (candidate.experience !== null && candidate.experience !== undefined ? candidate.experience.toString() : '') ||
    JSON.stringify(skills) !== JSON.stringify(candidate.skills || []);

  return (
    <div className="details-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="details-card animate-fade-in">
        {/* Profile Card Header */}
        <div className="details-header">
          <div className="details-header-info">
            {isEditing || candidate.status === 'Draft' ? (
              <div className="edit-name-group">
                <label className="edit-label">
                  Full Name 
                  {name !== (candidate.name || '') && <span className="unsaved-indicator"> (unsaved changes)</span>}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="details-name-input"
                />
              </div>
            ) : (
              <>
                <h2>{candidate.name}</h2>
                <div className="details-location-sub">
                  <MapPin size={13} />
                  <span>{candidate.location || 'No location provided'}</span>
                </div>
              </>
            )}
          </div>
          
          <div className="details-header-actions">
            <span className={`status-badge badge-${status.toLowerCase()}`}>
              {status}
            </span>
            <button className="close-details-btn" onClick={onClose} title="Close Panel">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable details content container */}
        <div className="details-body-scrollable">
          <div className="details-body">
            {candidate.pendingSync && (
              <div className="sync-banner">
                <AlertTriangle size={15} />
                <span>Offline: updates pending synchronization.</span>
              </div>
            )}

            {candidate.status === 'Draft' && (
              <div className="draft-alert-banner">
                <AlertTriangle size={16} />
                <div className="draft-alert-text">
                  <strong>Draft Profile Review</strong>
                  <span>Verify parsed resume parameters before confirming.</span>
                </div>
              </div>
            )}

            {error && <div className="details-error-banner">{error}</div>}
            {successMsg && <div className="details-success-banner">{successMsg}</div>}

            {/* Editable Fields layout vs view mode */}
            {isEditing || candidate.status === 'Draft' ? (
              <div className="fields-grid-editable">
                {/* Email Edit */}
                <div className="info-item-editable">
                  <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={12} /> Email Address 
                    {email !== (candidate.email || '') && <span className="unsaved-indicator"> (unsaved)</span>}
                    {hasLowConfidence('email') && <span title="Low confidence extraction">⚠️</span>}
                  </span>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="details-edit-input"
                  />
                  {hasLowConfidence('email') && (
                    <span className="field-helper-msg orange">
                      Auto-extracted — please verify
                    </span>
                  )}
                </div>

                {/* Phone Edit */}
                <div className="info-item-editable">
                  <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} /> Phone Number 
                    {phone !== (candidate.phone || '') && <span className="unsaved-indicator"> (unsaved)</span>}
                    {hasLowConfidence('phone') && <span title="Low confidence extraction">⚠️</span>}
                  </span>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="details-edit-input"
                  />
                  {hasLowConfidence('phone') && (
                    <span className="field-helper-msg orange">
                      Auto-extracted — please verify
                    </span>
                  )}
                </div>

                {/* Location Edit */}
                <div className="info-item-editable">
                  <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} /> Location (City)
                    {location !== (candidate.location || '') && <span className="unsaved-indicator"> (unsaved)</span>}
                  </span>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="details-edit-input"
                  />
                </div>

                {/* Source Edit */}
                <div className="info-item-editable">
                  <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Compass size={12} /> Source
                    {source !== (candidate.source || 'Referral') && <span className="unsaved-indicator"> (unsaved)</span>}
                  </span>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="details-edit-select"
                  >
                    {SOURCES_POOL.map((src) => (
                      <option key={src} value={src}>{src}</option>
                    ))}
                  </select>
                </div>

                {/* Experience Edit */}
                <div className="info-item-editable">
                  <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Briefcase size={12} /> Experience (Years)
                    {experience !== (candidate.experience !== null && candidate.experience !== undefined ? candidate.experience.toString() : '') && <span className="unsaved-indicator"> (unsaved)</span>}
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    placeholder="e.g. 5"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    className="details-edit-input"
                  />
                </div>

                {/* Status Edit */}
                {candidate.status !== 'Draft' && (
                  <div className="info-item-editable">
                    <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Layers size={12} /> Application Status
                      {status !== candidate.status && <span className="unsaved-indicator"> (unsaved)</span>}
                    </span>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="details-edit-select"
                    >
                      {STATUSES_POOL.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="info-grid">
                <div className="info-item">
                  <span className="label"><Mail size={12} style={{ marginRight: '6px' }} /> Email</span>
                  <span className="val">{candidate.email}</span>
                </div>
                <div className="info-item">
                  <span className="label"><Phone size={12} style={{ marginRight: '6px' }} /> Phone</span>
                  <span className="val">{candidate.phone || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="label"><Compass size={12} style={{ marginRight: '6px' }} /> Source</span>
                  <span className="val">{candidate.source || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="label"><Briefcase size={12} style={{ marginRight: '6px' }} /> Experience</span>
                  <span className="val">
                    {candidate.experience !== null && candidate.experience !== undefined
                      ? `${candidate.experience} Year${candidate.experience === 1 ? '' : 's'}`
                      : '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Skills Segment */}
            <div className="skills-section">
              <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Award size={12} /> Expertise {hasLowConfidence('skills') && <span title="Low confidence extraction">⚠️</span>}
              </span>
              
              {/* If editing: render tag adder controls */}
              {(isEditing || candidate.status === 'Draft') ? (
                <div className="skills-edit-container">
                  <div className="skills-edit-input-row">
                    <input
                      type="text"
                      placeholder="Type skill & press Enter"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddSkill(e);
                        }
                      }}
                      className="details-skill-textbox"
                    />
                    <button type="button" className="details-skill-add-btn" onClick={handleAddSkill}>
                      Add
                    </button>
                  </div>
                  <div className="form-skills-chips" style={{ marginTop: '10px' }}>
                    {skills && skills.length > 0 ? (
                      skills.map((s) => (
                        <span key={s} className="skill-chip">
                          {s}
                          <button type="button" className="chip-remove" onClick={() => handleRemoveSkill(s)}>✕</button>
                        </span>
                      ))
                    ) : (
                      <span className="text-muted" style={{ fontSize: '12px' }}>No skills added.</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="skills-container">
                  {skills && skills.length > 0 ? (
                    skills.map((s) => (
                      <span key={s} className="skill-tag large">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted">No skills declared.</span>
                  )}
                </div>
              )}
              {hasLowConfidence('skills') && (
                <span className="field-helper-msg orange" style={{ marginTop: '4px', display: 'block' }}>
                  Auto-extracted — please verify
                </span>
              )}
            </div>

            {/* Recruiter Notes Segment */}
            <div className="info-item-editable">
              <span className="label"><Calendar size={12} style={{ marginRight: '6px' }} /> Recruiter Notes</span>
              {isEditing || candidate.status === 'Draft' ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSaving}
                  placeholder="Add notes about candidate experience, interview feedback..."
                  rows={4}
                  className="details-edit-textarea"
                />
              ) : (
                <div className="notes-box">
                  <p>{candidate.notes || 'No recruiter notes compiled yet.'}</p>
                </div>
              )}
            </div>

            {/* Parsed from Resume Collapsible Section */}
            {candidate.status === 'Draft' && parsedData && parsedData.parsed_data && (
              <div className="parsed-resume-collapsible-section">
                <button
                  type="button"
                  className="parsed-resume-header-toggle"
                  onClick={() => setIsParsedSectionOpen(!isParsedSectionOpen)}
                >
                  <span className="section-title-text">📋 Parsed from Resume</span>
                  <span className="toggle-arrow">{isParsedSectionOpen ? '▼' : '►'}</span>
                </button>

                {isParsedSectionOpen && (
                  <div className="parsed-resume-details-table">
                    {[
                      { key: 'name', label: 'Name', applicable: true },
                      { key: 'email', label: 'Email', applicable: true },
                      { key: 'phone', label: 'Phone', applicable: true },
                      { key: 'location', label: 'Location', applicable: true },
                      { key: 'experience', label: 'Experience', applicable: true, format: (v) => `${v.value} years` },
                      { key: 'jobTitle', label: 'Job Title', applicable: false },
                      { key: 'education', label: 'Education', applicable: false, format: (v) => `${v.value} ${v.institution ? `— ${v.institution}` : ''}` },
                      { key: 'linkedin', label: 'LinkedIn', applicable: false },
                      { key: 'github', label: 'GitHub', applicable: false },
                      { key: 'skills', label: 'Skills', applicable: true, format: (v) => v.value.join(', ') },
                      { key: 'summary', label: 'Summary', applicable: false, format: (v) => v.value.length > 80 ? v.value.slice(0, 80) + '...' : v.value }
                    ].map(field => {
                      const data = parsedData.parsed_data[field.key];
                      if (!data) return null;

                      let displayVal = field.format ? field.format(data) : data.value;
                      let confidenceText = 'Please verify';
                      let confidenceClass = 'confidence-low';
                      if (data.confidence === 'high') {
                        confidenceText = 'High confidence';
                        confidenceClass = 'confidence-high';
                      } else if (data.confidence === 'medium') {
                        confidenceText = 'Review suggested';
                        confidenceClass = 'confidence-medium';
                      }

                      return (
                        <div key={field.key} className="parsed-field-row">
                          <span className="parsed-field-label">{field.label}</span>
                          <span className="parsed-field-val" title={typeof data.value === 'string' ? data.value : undefined}>
                            {displayVal}
                          </span>
                          <div className="parsed-field-badge-col">
                            <span className={`confidence-badge ${confidenceClass}`}>
                              ● {confidenceText}
                            </span>
                            {field.applicable && (
                              <button
                                type="button"
                                className="apply-field-single-btn"
                                onClick={() => applyField(field.key, data.value)}
                              >
                                Apply
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      className="apply-all-high-conf-btn"
                      onClick={handleApplyAllHighConfidence}
                    >
                      Apply all high confidence to profile
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AI Analysis Collapsible Section */}
            {aiAnalysis && (
              <div className="parsed-resume-collapsible-section ai-analysis-section">
                <button
                  type="button"
                  className="parsed-resume-header-toggle"
                  onClick={() => setIsAnalysisSectionOpen(!isAnalysisSectionOpen)}
                >
                  <span className="section-title-text">🧠 AI Analysis</span>
                  <span className="toggle-arrow">{isAnalysisSectionOpen ? '▼' : '►'}</span>
                </button>

                {isAnalysisSectionOpen && (
                  <div className="parsed-resume-details-table ai-analysis-body">
                    <div className="ai-score-row">
                      <div className={`ai-score-badge score-${scoreTier(aiAnalysis.overall_score)}`}>
                        {Math.round(aiAnalysis.overall_score)}
                        <span className="ai-score-max">/100</span>
                      </div>
                      {aiAnalysis.recommendation && (
                        <p className="ai-recommendation-text">{aiAnalysis.recommendation}</p>
                      )}
                    </div>

                    {aiAnalysis.category_scores && (
                      <div className="ai-category-list">
                        {Object.entries(aiAnalysis.category_scores).map(([category, score]) => (
                          <div key={category} className="ai-category-row">
                            <span className="ai-category-label">{category}</span>
                            <div className="ai-category-bar-track">
                              <div
                                className={`ai-category-bar-fill score-${scoreTier(score)}`}
                                style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                              />
                            </div>
                            <span className="ai-category-value">{Math.round(score)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {aiAnalysis.summary && (
                      <p className="ai-analysis-summary">{aiAnalysis.summary}</p>
                    )}

                    {aiAnalysis.strengths?.length > 0 && (
                      <div className="ai-list-block">
                        <span className="ai-list-title">Strengths</span>
                        <ul className="ai-strengths-list">
                          {aiAnalysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}

                    {aiAnalysis.weaknesses?.length > 0 && (
                      <div className="ai-list-block">
                        <span className="ai-list-title">Weaknesses</span>
                        <ul className="ai-weaknesses-list">
                          {aiAnalysis.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}

                    {aiAnalysis.missing_skills?.length > 0 && (
                      <div className="ai-list-block">
                        <span className="ai-list-title">Missing Skills</span>
                        <div className="ai-missing-skills-chips">
                          {aiAnalysis.missing_skills.map((skill, i) => (
                            <span key={i} className="missing-skill-chip">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Resume File Segment */}
            <div className="resume-section">
              <span className="label"><FileText size={12} style={{ marginRight: '6px' }} /> Resume Attachment</span>
              {candidate.resume_s3_key && !showUploadForm ? (
                <div className="resume-display-wrapper">
                  <div className="resume-box">
                    <span className="resume-filename">
                      <a
                        href="#"
                        onClick={handleDownloadResume}
                        className="resume-download-link"
                      >
                        Download Resume ({candidate.resume_s3_key.split('/').pop()})
                      </a>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="replace-resume-trigger"
                    onClick={() => setShowUploadForm(true)}
                  >
                    Replace Resume
                  </button>
                </div>
              ) : (
                <div className="resume-upload-wrapper animate-fade-in">
                  <UploadPanel
                    candidateId={candidate.id}
                    onUploadComplete={handleUploadComplete}
                  />
                  {candidate.resume_s3_key && (
                    <button
                      type="button"
                      className="cancel-replace-btn"
                      onClick={() => setShowUploadForm(false)}
                    >
                      Keep Current Resume
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Save/Action Buttons */}
            <div className="details-actions">
              {candidate.status === 'Draft' ? (
                <>
                  <button
                    className="discard-draft-btn"
                    onClick={() => setShowDiscardConfirm(true)}
                    disabled={isSaving}
                  >
                    <Trash2 size={14} style={{ marginRight: '6px' }} />
                    Discard draft
                  </button>
                  <button
                    className="confirm-profile-btn"
                    onClick={handleConfirmProfile}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <span className="btn-spinner" style={{ marginRight: '6px' }} />
                    ) : (
                      <Check size={14} style={{ marginRight: '6px' }} />
                    )}
                    {isSaving ? 'Confirming...' : 'Confirm profile'}
                  </button>
                </>
              ) : (
                <>
                  {isEditing ? (
                    <>
                      <button
                        className="cancel-edit-btn"
                        onClick={() => {
                          setIsEditing(false);
                          // reset states to original candidate values
                          setName(candidate.name || '');
                          setEmail(candidate.email || '');
                          setPhone(candidate.phone || '');
                          setLocation(candidate.location || '');
                          setSource(candidate.source || 'Referral');
                          setSkills(candidate.skills || []);
                          setExperience(candidate.experience !== null && candidate.experience !== undefined ? candidate.experience.toString() : '');
                          setStatus(candidate.status || 'Applied');
                          setNotes(candidate.notes || '');
                        }}
                        disabled={isSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className="save-profile-btn"
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                      >
                        {isSaving ? (
                          <span className="btn-spinner" style={{ marginRight: '6px' }} />
                        ) : (
                          <Save size={14} style={{ marginRight: '6px' }} />
                        )}
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="delete-profile-btn"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isSaving}
                      >
                        <Trash2 size={14} style={{ marginRight: '6px' }} />
                        Delete Candidate
                      </button>
                      <button
                        className="edit-profile-btn"
                        onClick={() => setIsEditing(true)}
                        disabled={isSaving}
                      >
                        <Edit size={14} style={{ marginRight: '6px' }} />
                        Edit Profile
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Meta Data */}
            <div className="metadata-section">
              <div className="meta-row">
                <span>Database ID</span>
                <code className="text-xs">{candidate.id}</code>
              </div>
              <div className="meta-row">
                <span>Record Version</span>
                <span>v{candidate.version}</span>
              </div>
              <div className="meta-row">
                <span>Created At</span>
                <span>{new Date(candidate.created_at).toLocaleString()}</span>
              </div>
              <div className="meta-row">
                <span>Updated At</span>
                <span>{new Date(candidate.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      {showDiscardConfirm && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card animate-scale-up" style={{ maxWidth: '400px', padding: '24px', gap: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Discard Draft</h4>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Are you sure you want to discard this draft? This action will permanently delete the candidate profile from the database.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                className="cancel-form-btn"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="submit-form-btn"
                style={{ background: '#ef4444' }}
                onClick={() => {
                  setShowDiscardConfirm(false);
                  handleDiscardDraft();
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Candidate Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card animate-scale-up" style={{ maxWidth: '400px', padding: '24px', gap: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Delete Candidate Profile</h4>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Are you sure you want to delete **{candidate.name}**? This action will permanently remove their profile, resume attachments, and logs from the database.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                className="cancel-form-btn"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="submit-form-btn"
                style={{ background: '#ef4444', boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.2)' }}
                onClick={handleDeleteCandidate}
              >
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}

      <ConflictResolutionModal
        isOpen={isResolutionModalOpen}
        conflictData={conflictRecord}
        candidate={candidate}
        onResolveSuccess={handleResolveSuccess}
        onEditManually={handleEditManually}
        onClose={() => setIsResolutionModalOpen(false)}
      />
    </div>
  );
}
