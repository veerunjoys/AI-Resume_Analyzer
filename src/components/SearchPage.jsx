import React, { useState, useEffect } from 'react';
import { Search, Loader2, Sparkles, User, FileText, ArrowRight, X } from 'lucide-react';
import config from '../config';
import { apiClient } from '../apiClient';
import CandidateDetailPanel from './CandidateDetailPanel';
import { Pagination } from './Pagination.jsx';
import './SearchPage.css';

export default function SearchPage({
  lastUpdatedCandidate,
  setLastUpdatedCandidate,
}) {
  const [hasSearched, setHasSearched] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Keyset Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState({ 1: null });
  const [nextCursor, setNextCursor] = useState(null);
  
  // Detail Panel State
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  // Trigger search on submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setSearchQuery(inputValue.trim());
    setHasSearched(true);
    setCurrentPage(1);
    setPageCursors({ 1: null });
  };

  // Fetch search results
  const fetchSearchResults = async (query, cursorVal = null) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${config.apiBaseUrl}/api/candidates?search=${encodeURIComponent(query)}&limit=15`;
      if (cursorVal) {
        url += `&cursor=${encodeURIComponent(cursorVal)}`;
      }
      
      const res = await apiClient(url);
      if (!res.ok) {
        throw new Error('Failed to fetch search results');
      }
      
      const data = await res.json();
      setCandidates(data.candidates || []);
      setNextCursor(data.nextCursor || null);
      
      if (!cursorVal && data.totalCount !== undefined) {
        setTotalCount(data.totalCount);
      }
      
      if (data.nextCursor) {
        setPageCursors(prev => ({
          ...prev,
          [currentPage + 1]: data.nextCursor
        }));
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong during search.');
    } finally {
      setLoading(false);
    }
  };

  // Run search when query or page changes
  useEffect(() => {
    if (searchQuery) {
      const cursorForPage = pageCursors[currentPage] || null;
      fetchSearchResults(searchQuery, cursorForPage);
    }
  }, [searchQuery, currentPage]);

  const handleClear = () => {
    setInputValue('');
    setSearchQuery('');
    setHasSearched(false);
    setCandidates([]);
    setTotalCount(0);
    setCurrentPage(1);
    setPageCursors({ 1: null });
    setNextCursor(null);
  };

  // Check if a candidate match was strictly from the resume content
  const isMatchInResume = (candidate) => {
    if (!searchQuery || !candidate.resume_snippet) return false;
    const q = searchQuery.toLowerCase();
    const inName = candidate.name?.toLowerCase().includes(q);
    const inEmail = candidate.email?.toLowerCase().includes(q);
    const inSkills = candidate.skills?.some(s => s.toLowerCase().includes(q));
    return !inName && !inEmail && !inSkills;
  };

  return (
    <div className={`search-page-container ${hasSearched ? 'results-view' : 'centered-view'}`}>
      <div className="search-header-zone">
        {!hasSearched && (
          <div className="search-hero-content">
            <div className="hero-badge">
              <Sparkles size={14} className="sparkle-icon" />
              <span>AI-Powered Full-Text Search</span>
            </div>
            <h1>Who are you looking for today?</h1>
            <p className="hero-sub">
              Search candidate names, emails, specific skill arrays, and indexing resume contents instantly.
            </p>
          </div>
        )}
        
        <form onSubmit={handleSearchSubmit} className="search-form-bar">
          <div className="search-input-wrapper">
            <Search className="search-bar-icon" size={20} />
            <input
              type="text"
              placeholder="Search by name, email, skills, or resume keywords..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
            />
            {inputValue && (
              <button type="button" className="search-clear-btn" onClick={handleClear}>
                <X size={16} />
              </button>
            )}
          </div>
          <button type="submit" className="search-action-btn">
            <span>Search</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>

      {hasSearched && (
        <div className="search-results-zone animate-fade-in">
          <div className="results-meta-header">
            <h3>
              Search results for "<strong>{searchQuery}</strong>"
            </h3>
            <span className="results-count-badge">
              {loading ? 'Searching...' : `${totalCount} records found`}
            </span>
          </div>

          {loading && candidates.length === 0 ? (
            <div className="search-loading-state">
              <Loader2 className="spinner" size={36} />
              <p>Scanning index and parsing resume vectors...</p>
            </div>
          ) : error ? (
            <div className="search-error-state">
              <p className="error-title">Search Failed</p>
              <p className="error-body">{error}</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="search-empty-state">
              <div className="empty-icon-wrap">
                <Search size={40} />
              </div>
              <h4>No matches found</h4>
              <p>We couldn't find any candidate matching "{searchQuery}". Try refining spelling or skills query.</p>
              <button onClick={handleClear} className="reset-search-btn">Reset Search</button>
            </div>
          ) : (
            <div className="search-results-layout">
              <div className="search-cards-list">
                {candidates.map((candidate) => {
                  const resumeMatch = isMatchInResume(candidate);
                  return (
                    <div 
                      key={candidate.id} 
                      className={`search-result-card ${selectedCandidateId === candidate.id ? 'active-card' : ''}`}
                      onClick={() => setSelectedCandidateId(candidate.id)}
                    >
                      <div className="card-top-row">
                        <div className="candidate-info-primary">
                          <div className="candidate-avatar">
                            <User size={18} />
                          </div>
                          <div>
                            <h4>{candidate.name}</h4>
                            <span className="candidate-email-txt">{candidate.email}</span>
                          </div>
                        </div>

                        <div className="card-badge-row">
                          {candidate.search_rank !== undefined && parseFloat(candidate.search_rank) > 0 && (
                            <span className="search-rank-pill">
                              Relevance: {parseFloat(candidate.search_rank).toFixed(2)}
                            </span>
                          )}
                          <span className={`status-pill status-${candidate.status.toLowerCase()}`}>
                            {candidate.status}
                          </span>
                        </div>
                      </div>

                      {candidate.resume_snippet && (
                        <div className="card-snippet-box">
                          <div className="snippet-header">
                            <FileText size={12} />
                            <span>Matched Fragment</span>
                            {resumeMatch && <span className="resume-match-badge">Matched in resume</span>}
                          </div>
                          <p className="snippet-text">
                            ...{candidate.resume_snippet}...
                          </p>
                        </div>
                      )}

                      {candidate.skills && candidate.skills.length > 0 && (
                        <div className="card-skills-row">
                          {candidate.skills.slice(0, 8).map(skill => (
                            <span key={skill} className="skill-tag-pill">{skill}</span>
                          ))}
                          {candidate.skills.length > 8 && (
                            <span className="skills-more-tag">+{candidate.skills.length - 8} more</span>
                          )}
                        </div>
                      )}

                      <div className="card-meta-footer">
                        <span>📍 {candidate.location || 'Unknown Location'}</span>
                        {candidate.experience !== null && (
                          <span>💼 {candidate.experience} Years Experience</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Keyset Pagination Controls */}
                <div className="search-pagination-footer">
                  <Pagination>
                    <Pagination.Content>
                      <Pagination.Item>
                        <Pagination.Previous 
                          isDisabled={currentPage === 1 || loading} 
                          onPress={() => setCurrentPage(p => p - 1)}
                        >
                          <Pagination.PreviousIcon />
                          <span>Previous</span>
                        </Pagination.Previous>
                      </Pagination.Item>
                      
                      <span className="page-indicator">
                        Page <strong>{currentPage}</strong> of <strong>{Math.ceil(totalCount / 15) || 1}</strong>
                      </span>

                      <Pagination.Item>
                        <Pagination.Next 
                          isDisabled={!nextCursor || loading} 
                          onPress={() => setCurrentPage(p => p + 1)}
                        >
                          <span>Next</span>
                          <Pagination.NextIcon />
                        </Pagination.Next>
                      </Pagination.Item>
                    </Pagination.Content>
                  </Pagination>
                </div>
              </div>
            </div>
          )}

          {selectedCandidateId && (
            <CandidateDetailPanel
              candidateId={selectedCandidateId}
              onSaveSuccess={setLastUpdatedCandidate}
              lastUpdatedCandidate={lastUpdatedCandidate}
              onClose={() => setSelectedCandidateId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
