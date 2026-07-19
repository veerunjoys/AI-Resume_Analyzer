import React, { useState, useEffect, useCallback } from 'react';
import { Briefcase, MapPin, Layers, X, Sparkles, Loader2 } from 'lucide-react';
import config from '../config';
import { apiClient } from '../apiClient';
import './JobsPage.css';

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];
const JOB_STATUSES = ['draft', 'open', 'closed'];
const APPLICATION_STATUSES = ['applied', 'screening', 'interview', 'offer', 'rejected'];

function scoreTier(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(null);

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/jobs`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  return (
    <div className="jobs-page-container">
      <div className="jobs-page-header">
        <div>
          <h2>Job Postings</h2>
          <p className="jobs-subtitle">Manage open roles and rank matching candidates.</p>
        </div>
        <button className="add-candidate-trigger-btn" onClick={() => setShowAddModal(true)}>
          + Post Job
        </button>
      </div>

      {isLoading ? (
        <div className="jobs-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="job-card job-card-skeleton">
              <div className="job-card-top">
                <div className="skeleton-block" style={{ width: 60, height: 18, borderRadius: 9999 }} />
                <div className="skeleton-block" style={{ width: 70, height: 12 }} />
              </div>
              <div className="skeleton-block" style={{ width: '75%', height: 18 }} />
              <div className="skeleton-block" style={{ width: '90%', height: 12 }} />
              <div className="job-card-skills">
                <div className="skeleton-block" style={{ width: 60, height: 22, borderRadius: 9999 }} />
                <div className="skeleton-block" style={{ width: 60, height: 22, borderRadius: 9999 }} />
                <div className="skeleton-block" style={{ width: 60, height: 22, borderRadius: 9999 }} />
              </div>
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="jobs-empty-state">
          <Briefcase size={36} />
          <p>No job postings yet. Create one to start matching candidates.</p>
        </div>
      ) : (
        <div className="jobs-grid">
          {jobs.map((job) => (
            <div key={job.id} className="job-card" onClick={() => setSelectedJobId(job.id)}>
              <div className="job-card-top">
                <span className={`job-status-pill status-${job.status}`}>{job.status}</span>
                <span className="job-app-count">{job.application_count || 0} applicants</span>
              </div>
              <h3 className="job-card-title">{job.title}</h3>
              <div className="job-card-meta">
                {job.department && <span>{job.department}</span>}
                {job.location && <span><MapPin size={11} /> {job.location}</span>}
                {job.employment_type && <span>{job.employment_type}</span>}
              </div>
              {job.required_skills?.length > 0 && (
                <div className="job-card-skills">
                  {job.required_skills.slice(0, 5).map((s) => (
                    <span key={s} className="job-skill-chip">{s}</span>
                  ))}
                  {job.required_skills.length > 5 && <span className="job-skill-chip more">+{job.required_skills.length - 5}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddJobModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); fetchJobs(); }}
        />
      )}

      {selectedJobId && (
        <JobDetailModal
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobChanged={fetchJobs}
        />
      )}
    </div>
  );
}

function AddJobModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('Full-time');
  const [minExperience, setMinExperience] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [requiredSkills, setRequiredSkills] = useState([]);
  const [status, setStatus] = useState('open');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleAddSkill = (e) => {
    e.preventDefault();
    const clean = skillInput.trim();
    if (clean && !requiredSkills.includes(clean)) {
      setRequiredSkills([...requiredSkills, clean]);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skill) => {
    setRequiredSkills(requiredSkills.filter((s) => s !== skill));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          department: department.trim() || null,
          location: location.trim() || null,
          employmentType,
          minExperience: minExperience === '' ? null : parseFloat(minExperience),
          requiredSkills,
          status,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create job.');
      }
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <h3>Post a New Job</h3>
          <button className="close-modal-btn" onClick={onClose} disabled={isSubmitting}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="job-form-body">
          {error && <div className="form-error-banner">{error}</div>}

          <div className="form-group">
            <label className="required-label">Job Title</label>
            <input type="text" placeholder="e.g. Senior Backend Engineer" value={title} onChange={(e) => setTitle(e.target.value)} disabled={isSubmitting} />
          </div>

          <div className="form-group">
            <label className="required-label">Job Description</label>
            <textarea
              rows={5}
              placeholder="Responsibilities, requirements, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Department</label>
              <input type="text" placeholder="e.g. Engineering" value={department} onChange={(e) => setDepartment(e.target.value)} disabled={isSubmitting} />
            </div>
            <div className="form-group flex-1">
              <label>Location</label>
              <input type="text" placeholder="e.g. Remote" value={location} onChange={(e) => setLocation(e.target.value)} disabled={isSubmitting} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Employment Type</label>
              <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} disabled={isSubmitting}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group flex-1">
              <label>Min. Experience (years)</label>
              <input type="number" min="0" step="0.5" placeholder="e.g. 3" value={minExperience} onChange={(e) => setMinExperience(e.target.value)} disabled={isSubmitting} />
            </div>
            <div className="form-group flex-1">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isSubmitting}>
                {JOB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Required Skills</label>
            <div className="skills-tag-input-container">
              <input
                type="text"
                placeholder="Type skill & press Enter"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSkill(e); }}
                disabled={isSubmitting}
              />
              <button type="button" className="add-skill-tag-btn" onClick={handleAddSkill} disabled={isSubmitting}>Add</button>
            </div>
            {requiredSkills.length > 0 && (
              <div className="form-skills-chips">
                {requiredSkills.map((s) => (
                  <span key={s} className="skill-chip">
                    {s}
                    <button type="button" className="chip-remove" onClick={() => handleRemoveSkill(s)} disabled={isSubmitting}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="job-form-actions">
            <button type="button" className="cancel-btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              {isSubmitting && <span className="btn-spinner" style={{ marginRight: '6px' }} />}
              {isSubmitting ? 'Posting…' : 'Post Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function JobDetailModal({ jobId, onClose, onJobChanged }) {
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);

  const fetchJob = useCallback(async () => {
    const res = await apiClient(`${config.apiBaseUrl}/api/jobs/${jobId}`);
    if (res.ok) setJob(await res.json());
  }, [jobId]);

  const fetchCandidates = useCallback(async () => {
    setIsLoadingCandidates(true);
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/jobs/${jobId}/candidates`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
      }
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [jobId]);

  useEffect(() => { fetchJob(); fetchCandidates(); }, [fetchJob, fetchCandidates]);

  const handleFindMatches = async () => {
    setIsMatching(true);
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/jobs/${jobId}/match`, { method: 'POST' });
      if (res.ok) {
        // Matching runs async in the background — poll a few times for results to land.
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          await fetchCandidates();
        }
      }
    } finally {
      setIsMatching(false);
    }
  };

  const handleApplicationStatusChange = async (applicationId, status) => {
    await apiClient(`${config.apiBaseUrl}/api/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchCandidates();
  };

  if (!job) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card job-detail-card">
        <div className="modal-header">
          <h3>{job.title}</h3>
          <button className="close-modal-btn" onClick={onClose}>✕</button>
        </div>

        <div className="job-detail-body">
          <div className="job-detail-meta">
            {job.department && <span>{job.department}</span>}
            {job.location && <span><MapPin size={12} /> {job.location}</span>}
            {job.employment_type && <span>{job.employment_type}</span>}
            {job.min_experience != null && <span>{job.min_experience}+ yrs experience</span>}
            <span className={`job-status-pill status-${job.status}`}>{job.status}</span>
          </div>

          <p className="job-detail-description">{job.description}</p>

          {job.required_skills?.length > 0 && (
            <div className="job-card-skills">
              {job.required_skills.map((s) => <span key={s} className="job-skill-chip">{s}</span>)}
            </div>
          )}

          <div className="job-applicants-header">
            <span className="section-title-text">Ranked Applicants ({candidates.length})</span>
            <button type="button" className="find-matches-btn" onClick={handleFindMatches} disabled={isMatching}>
              {isMatching ? <><Loader2 size={14} className="spin-icon" /> Matching…</> : <><Sparkles size={14} /> Find Matching Candidates</>}
            </button>
          </div>

          {isLoadingCandidates ? (
            <div className="applicants-list">
              {[1, 2, 3].map((i) => (
                <div key={i} className="applicant-row applicant-row-skeleton">
                  <div className="applicant-row-main">
                    <div className="skeleton-block" style={{ width: '70%', height: 14 }} />
                    <div className="skeleton-block" style={{ width: '90%', height: 11 }} />
                  </div>
                  <div className="skeleton-block" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                  <div className="skeleton-block" style={{ width: '100%', height: 22, borderRadius: 9999 }} />
                  <div className="skeleton-block" style={{ width: 90, height: 26 }} />
                </div>
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <div className="jobs-empty-state small">
              <Layers size={28} />
              <p>No applicants yet. Click "Find Matching Candidates" to rank the candidate pool against this job.</p>
            </div>
          ) : (
            <div className="applicants-list">
              {candidates.map((c) => (
                <div key={c.application_id} className="applicant-row">
                  <div className="applicant-row-main">
                    <span className="applicant-name">{c.name}</span>
                    <span className="applicant-email">{c.email}</span>
                  </div>
                  <div className="applicant-row-match">
                    {c.match_score != null ? (
                      <span className={`ai-score-badge small score-${scoreTier(c.match_score)}`}>
                        {Math.round(c.match_score)}
                      </span>
                    ) : (
                      <span className="applicant-no-score">Not matched</span>
                    )}
                  </div>
                  <div className="applicant-row-skills">
                    {c.matched_skills?.slice(0, 4).map((s) => (
                      <span key={s} className="job-skill-chip matched">{s}</span>
                    ))}
                    {c.missing_skills?.slice(0, 3).map((s) => (
                      <span key={s} className="job-skill-chip missing">{s}</span>
                    ))}
                  </div>
                  <select
                    className="applicant-status-select"
                    value={c.application_status}
                    onChange={(e) => handleApplicationStatusChange(c.application_id, e.target.value)}
                  >
                    {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
