import React, { useState, useEffect, useRef } from 'react';
import config from '../config';
import { apiClient } from '../apiClient';
import { useWebSocket } from '../contexts/WebSocketContext.jsx';
import './FilterBar.css';

const SKILLS_POOL = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python',
  'Go', 'Java', 'C++', 'Ruby', 'PostgreSQL',
  'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'TailwindCSS'
];

const STATUSES_POOL = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Draft'];

const INITIAL_CITIES = [
  'New York', 'San Francisco', 'Seattle', 'Austin', 'Boston',
  'Chicago', 'Denver', 'Los Angeles', 'Miami', 'Atlanta'
];

export default function FilterBar({ onChange, isLoading }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [hasResume, setHasResume] = useState(false);
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [citiesPool, setCitiesPool] = useState(INITIAL_CITIES);
  const skillDropdownRef = useRef(null);
  const filterDropdownRef = useRef(null);

  const wsClient = useWebSocket();

  const fetchLocations = async () => {
    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/locations`);
      if (res.ok) {
        const data = await res.json();
        setCitiesPool(data);
      }
    } catch (err) {
      // Silently fall back to initial cities on auth or network errors
    }
  };

  // Fetch locations on mount and on dropdown toggle open
  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (showFilterDropdown) {
      fetchLocations();
    }
  }, [showFilterDropdown]);

  // Refetch locations on real-time candidate updates (websocket event)
  useEffect(() => {
    if (!wsClient) return;

    const unsubscribe = wsClient.onEvent((event) => {
      if (event.eventType === 'candidate_created' || event.eventType === 'candidate_updated') {
        fetchLocations();
      }
    });

    return () => unsubscribe();
  }, [wsClient]);

  // Debounced search query: 300ms delay
  useEffect(() => {
    const handler = setTimeout(() => {
      onChange({
        search: search.trim(),
        status,
        location,
        skills: selectedSkills,
        hasResume,
      });
    }, 300);

    return () => clearTimeout(handler);
  }, [search]);

  // Handle immediate dropdown/tag updates
  const handleFilterChange = (newStatus, newLocation, newSkills, newHasResume = hasResume) => {
    onChange({
      search: search.trim(),
      status: newStatus,
      location: newLocation,
      skills: newSkills,
      hasResume: newHasResume,
    });
  };

  const handleStatusChange = (e) => {
    const val = e.target.value;
    setStatus(val);
    handleFilterChange(val, location, selectedSkills);
  };

  const handleLocationChange = (e) => {
    const val = e.target.value;
    setLocation(val);
    handleFilterChange(status, val, selectedSkills);
  };

  const toggleSkill = (skill) => {
    let nextSkills;
    if (selectedSkills.includes(skill)) {
      nextSkills = selectedSkills.filter((s) => s !== skill);
    } else {
      nextSkills = [...selectedSkills, skill];
    }
    setSelectedSkills(nextSkills);
    handleFilterChange(status, location, nextSkills);
  };

  const clearAllFilters = () => {
    setSearch('');
    setStatus('');
    setLocation('');
    setSelectedSkills([]);
    setHasResume(false);
    onChange({
      search: '',
      status: '',
      location: '',
      skills: [],
      hasResume: false,
    });
  };

  // Close dropdown on clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (skillDropdownRef.current && !skillDropdownRef.current.contains(event.target)) {
        setShowSkillDropdown(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        const trigger = document.querySelector('.filter-toggle-btn');
        if (trigger && !trigger.contains(event.target)) {
          setShowFilterDropdown(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasActiveFilters = status || location || selectedSkills.length > 0 || hasResume;
  const activeFiltersCount = (status ? 1 : 0) + (location ? 1 : 0) + selectedSkills.length + (hasResume ? 1 : 0);

  const triggerImmediateSearch = () => {
    onChange({
      search: search.trim(),
      status,
      location,
      skills: selectedSkills,
      hasResume,
    });
  };

  return (
    <div className="filter-bar-container">
      <div className="filter-bar-controls">
        {/* Search input */}
        <div className="filter-input-search">
          <span className="search-icon-svg">
            <svg className="css-icon svg-search" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search candidates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear-btn" onClick={() => setSearch('')}>
              ✕
            </button>
          )}
        </div>

        {/* Search Button */}
        <button
          type="button"
          className="search-submit-btn"
          onClick={triggerImmediateSearch}
        >
          Search
        </button>

        {/* Filter Toggle Button */}
        <button
          type="button"
          className={`filter-toggle-btn ${showFilterDropdown ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
          onClick={() => setShowFilterDropdown(!showFilterDropdown)}
          title="Toggle Filters"
        >
          <svg className="css-icon svg-filter" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px' }}>
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          <span>Filters</span>
          {hasActiveFilters && (
            <span className="filter-count-badge">{activeFiltersCount}</span>
          )}
        </button>

        {/* Global Loading Spinner */}
        {isLoading && (
          <div className="filter-loader-mini">
            <div className="spinner-mini" />
          </div>
        )}
      </div>

      {/* Floating Filter Selectors Dropdown */}
      {showFilterDropdown && (
        <div className="filter-selectors-dropdown animate-slide-down" ref={filterDropdownRef}>
          <div className="dropdown-header">
            <h4>Filter Candidates</h4>
            {hasActiveFilters && (
              <button className="reset-filters-btn-text" onClick={clearAllFilters}>
                Clear All
              </button>
            )}
          </div>

          <div className="filter-selectors-grid">
            {/* Status Dropdown */}
            <div className="selector-group">
              <label>Status</label>
              <select value={status} onChange={handleStatusChange}>
                <option value="">All Statuses</option>
                {STATUSES_POOL.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Location Dropdown */}
            <div className="selector-group">
              <label>Location</label>
              <select value={location} onChange={handleLocationChange}>
                <option value="">All Locations</option>
                {citiesPool.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            {/* Skill Multi-select */}
            <div className="selector-group skill-multi-select" ref={skillDropdownRef}>
              <label>Skills Filters</label>
              <div
                className="skill-select-trigger"
                onClick={() => setShowSkillDropdown(!showSkillDropdown)}
              >
                Select Skills ({selectedSkills.length})
                <span className="arrow-icon">{showSkillDropdown ? '▲' : '▼'}</span>
              </div>

              {showSkillDropdown && (
                <div className="skills-dropdown-list">
                  {SKILLS_POOL.map((sk) => {
                    const isSelected = selectedSkills.includes(sk);
                    return (
                      <div
                        key={sk}
                        className={`skill-dropdown-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleSkill(sk)}
                      >
                        <input type="checkbox" checked={isSelected} readOnly />
                        <span>{sk}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Has Resume Toggle */}
            <div className="selector-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', height: '100%', marginTop: '16px' }}>
                <input
                  type="checkbox"
                  checked={hasResume}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHasResume(checked);
                    handleFilterChange(status, location, selectedSkills, checked);
                  }}
                  style={{ width: 'auto', margin: 0 }}
                />
                <span>Has Resume</span>
              </label>
            </div>
          </div>

          {/* Active Chips section inside dropdown */}
          {hasActiveFilters && (
            <div className="dropdown-active-chips-section">
              <label className="active-filters-label">Active Filters</label>
              <div className="active-skills-chips">
                {status && (
                  <span className="skill-chip">
                    Status: {status}
                    <button className="chip-remove" onClick={() => { setStatus(''); handleFilterChange('', location, selectedSkills); }}>✕</button>
                  </span>
                )}
                {location && (
                  <span className="skill-chip">
                    Location: {location}
                    <button className="chip-remove" onClick={() => { setLocation(''); handleFilterChange(status, '', selectedSkills); }}>✕</button>
                  </span>
                )}
                {hasResume && (
                  <span className="skill-chip">
                    Has Resume
                    <button className="chip-remove" onClick={() => { setHasResume(false); handleFilterChange(status, location, selectedSkills, false); }}>✕</button>
                  </span>
                )}
                {selectedSkills.map((sk) => (
                  <span key={sk} className="skill-chip">
                    {sk}
                    <button className="chip-remove" onClick={() => toggleSkill(sk)}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
