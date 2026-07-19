import React, { useReducer, useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext.jsx';
import * as offlineQueue from '../utils/offlineQueue';
import './CandidateList.css';

import { Paperclip } from 'lucide-react';
import { Pagination } from './Pagination.jsx';

const OVERSCAN_BUFFER = 8;
const CONTAINER_HEIGHT = 500;

// Optimized Memoized Row Component for Candidates Directory
const CandidateRowItem = React.memo(function CandidateRowItem({
  index,
  candidate,
  isHighlighted,
  onClick,
  searchQuery,
  rowHeight
}) {
  const transformValue = `translateY(${index * rowHeight}px)`;

  const isMatchedInResume = React.useMemo(() => {
    if (!searchQuery || !candidate.resume_snippet) return false;
    const q = searchQuery.toLowerCase();
    // Resume match: snippet exists AND query doesn't match name/email/skills directly
    const matchInName = candidate.name?.toLowerCase().includes(q);
    const matchInEmail = candidate.email?.toLowerCase().includes(q);
    const matchInSkills = candidate.skills?.some(s => s.toLowerCase().includes(q));
    return !matchInName && !matchInEmail && !matchInSkills;
  }, [candidate, searchQuery]);

  return (
    <div
      className={`candidate-row-item${isHighlighted ? ' highlight-updated' : ''}`}
      style={{
        height: rowHeight,
        transform: transformValue,
      }}
      onClick={() => onClick && onClick(candidate.id)}
    >
      <span className="col-num">{index + 1}</span>
      <span className="col-name font-medium">
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', width: '100%', overflow: 'hidden' }}>
            <span 
              style={{ 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                maxWidth: '240px',
                color: '#0f172a',
                fontWeight: '600'
              }} 
              title={candidate.name}
            >
              {candidate.name}
            </span>
            {candidate.pendingSync && (
              <span className="pending-sync-badge-list" title="Pending Sync" style={{ flexShrink: 0 }}>
                Pending Sync
              </span>
            )}
            {candidate.conflict && (
              <span className="conflict-badge-list" title="Sync Conflict" style={{ flexShrink: 0 }}>
                Conflict
              </span>
            )}
            {candidate.resume_s3_key && (
              <Paperclip size={12} style={{ color: '#64748b', flexShrink: 0 }} title="Resume attached" />
            )}
            {isMatchedInResume && (
              <span className="match-tag" style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#2563eb',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: '600',
                textTransform: 'uppercase',
                flexShrink: 0
              }}>
                Matched in resume
              </span>
            )}
            {candidate.search_rank !== undefined && parseFloat(candidate.search_rank) > 0 && (
              <span className="rank-tag" style={{
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#059669',
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: '600',
                flexShrink: 0
              }}>
                Rank: {parseFloat(candidate.search_rank).toFixed(2)}
              </span>
            )}
          </div>
          {candidate.resume_snippet && (
            <div className="resume-snippet text-xs text-muted" style={{
              fontSize: '11px',
              opacity: 0.7,
              marginTop: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '350px'
            }}>
              ...{candidate.resume_snippet}...
            </div>
          )}
        </div>
      </span>
      <span className="col-email">{candidate.email}</span>
      <span className="col-phone">{candidate.phone || '—'}</span>
      <span className="col-experience">
        {candidate.experience !== null && candidate.experience !== undefined
          ? `${candidate.experience} yr${candidate.experience === 1 ? '' : 's'}`
          : '—'}
      </span>
      <span className="col-status">
        <span className={`status-badge badge-${candidate.status.toLowerCase()}`}>
          {candidate.status === 'Draft' ? 'Draft' : candidate.status}
        </span>
      </span>
      <span className="col-skills">
        {candidate.skills && candidate.skills.length > 0 ? (
          <span className="skills-wrap">
            {candidate.skills.map((s) => (
              <span key={s} className="skill-tag">
                {s}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </span>
    </div>
  );
});

// Optimized Memoized Skeleton Placeholder Row Component
const SkeletonRowItem = React.memo(function SkeletonRowItem({ index, rowHeight }) {
  const transformValue = `translateY(${index * rowHeight}px)`;
  return (
    <div
      className="candidate-row-item skeleton"
      style={{
        height: rowHeight,
        transform: transformValue,
      }}
    >
      <span className="col-num">{index + 1}</span>
      <span className="col-name">
        <div className="skeleton-line w-40" />
      </span>
      <span className="col-email">
        <div className="skeleton-line w-40" />
      </span>
      <span className="col-phone">
        <div className="skeleton-line w-20" />
      </span>
      <span className="col-experience">
        <div className="skeleton-line w-10" />
      </span>
      <span className="col-status">
        <div className="skeleton-line w-20" />
      </span>
      <span className="col-skills">
        <div className="skeleton-line w-60" />
      </span>
    </div>
  );
});

const initialState = {
  byId: {},
  ids: [],
  scrollOffset: 0,
  isLoading: false,
  nextCursor: null,
  error: null,
};

function listReducer(state, action) {
  switch (action.type) {
    case 'SET_SCROLL':
      if (state.scrollOffset === action.payload) return state;
      return { ...state, scrollOffset: action.payload };
    case 'FETCH_START':
      return { ...state, isLoading: true, error: null };
    case 'UPDATE_CANDIDATE': {
      const candidate = action.payload;
      if (state.byId[candidate.id]) {
        const existing = state.byId[candidate.id];
        const hasChanges = Object.keys(candidate).some(
          (key) => candidate[key] !== existing[key]
        );
        if (!hasChanges) return state;

        return {
          ...state,
          byId: {
            ...state.byId,
            [candidate.id]: {
              ...existing,
              ...candidate,
            },
          },
        };
      }
      return state;
    }
    case 'FETCH_SUCCESS': {
      const { candidates, nextCursor } = action.payload;
      const newById = {};
      const newIds = [];

      candidates.forEach((c) => {
        newById[c.id] = c;
        newIds.push(c.id);
      });

      return {
        ...state,
        byId: newById,
        ids: newIds,
        nextCursor,
        isLoading: false,
      };
    }
    case 'PREPEND_CANDIDATE': {
      const candidate = action.payload;
      if (state.byId[candidate.id]) return state;
      return {
        ...state,
        byId: {
          ...state.byId,
          [candidate.id]: candidate,
        },
        ids: [candidate.id, ...state.ids],
      };
    }
    case 'REMOVE_CANDIDATE': {
      const candidateId = action.payload;
      const { [candidateId]: _, ...newById } = state.byId;
      return {
        ...state,
        byId: newById,
        ids: state.ids.filter((id) => id !== candidateId),
      };
    }
    case 'FETCH_ERROR':
      return { ...state, isLoading: false, error: action.payload };
    default:
      return state;
  }
}

export default function CandidateList({ totalRows, fetchPage, onSelectCandidate, updatedCandidate, newCandidate, searchQuery }) {
  const [state, dispatch] = useReducer(listReducer, initialState);
  const { byId, ids, scrollOffset, isLoading, nextCursor, error } = state;

  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState({ 1: null });

  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const wsClient = useWebSocket();
  const highlightTimersRef = useRef(new Set());

  // Stable selection click handler to prevent row component re-render
  const handleSelectCandidate = React.useCallback((id) => {
    if (onSelectCandidate) {
      onSelectCandidate(id);
    }
  }, [onSelectCandidate]);

  // Listen for real-time candidate update events to trigger visual highlighting
  useEffect(() => {
    if (!wsClient) return;

    const unsubscribe = wsClient.onEvent((event) => {
      if (event.eventType === 'candidate_updated') {
        const candidateId = event.payload.id;

        setHighlightedIds((prev) => {
          const next = new Set(prev);
          next.add(candidateId);
          return next;
        });

        const timerId = setTimeout(() => {
          setHighlightedIds((prev) => {
            const next = new Set(prev);
            next.delete(candidateId);
            return next;
          });
          highlightTimersRef.current.delete(timerId);
        }, 2000);

        highlightTimersRef.current.add(timerId);
      }
    });

    return () => {
      unsubscribe();
      highlightTimersRef.current.forEach(clearTimeout);
      highlightTimersRef.current.clear();
    };
  }, [wsClient]);

  // Listen for external candidate updates to apply in-place
  useEffect(() => {
    if (updatedCandidate) {
      if (updatedCandidate.isDeleted) {
        dispatch({
          type: 'REMOVE_CANDIDATE',
          payload: updatedCandidate.id,
        });
      } else {
        dispatch({
          type: 'UPDATE_CANDIDATE',
          payload: updatedCandidate,
        });
      }
    }
  }, [updatedCandidate]);

  // Listen for newly added candidate records to prepend to the list
  useEffect(() => {
    if (newCandidate) {
      dispatch({
        type: 'PREPEND_CANDIDATE',
        payload: newCandidate,
      });
    }
  }, [newCandidate]);

  const containerRef = useRef(null);
  const tickingRef = useRef(false);

  // Throttled scroll handler using requestAnimationFrame
  const handleScroll = () => {
    if (!tickingRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          dispatch({
            type: 'SET_SCROLL',
            payload: containerRef.current.scrollTop,
          });
        }
        tickingRef.current = false;
      });
      tickingRef.current = true;
    }
  };

  // Trigger page loading
  const loadPage = async (pageNumber) => {
    dispatch({ type: 'FETCH_START' });
    try {
      const cursorToUse = pageCursors[pageNumber] || null;
      const data = await fetchPage(cursorToUse);

      // Load pending edits to overlay them
      const pendingEdits = await offlineQueue.getAll();
      const pendingMap = {};
      pendingEdits.forEach((p) => {
        pendingMap[p.candidate_id] = p.changes;
      });

      // Load conflicts to flag candidates
      const conflicts = await offlineQueue.getAllConflicts();
      const conflictMap = {};
      conflicts.forEach((c) => {
        conflictMap[c.candidate_id] = c;
      });

      const processedCandidates = (data.candidates || []).map((c) => {
        let cand = { ...c };
        if (pendingMap[c.id]) {
          cand = {
            ...cand,
            ...pendingMap[c.id],
            pendingSync: true,
          };
        }
        if (conflictMap[c.id]) {
          cand = {
            ...cand,
            conflict: true,
          };
        }
        return cand;
      });

      dispatch({
        type: 'FETCH_SUCCESS',
        payload: {
          candidates: processedCandidates,
          nextCursor: data.nextCursor,
        },
      });

      // Store the cursor for the NEXT page
      if (data.nextCursor) {
        setPageCursors((prev) => ({
          ...prev,
          [pageNumber + 1]: data.nextCursor,
        }));
      }

      // Reset scroll position to top on page change
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    } catch (err) {
      dispatch({
        type: 'FETCH_ERROR',
        payload: err.message || 'Failed to load page.',
      });
    }
  };

  // Monitor currentPage to load candidates
  useEffect(() => {
    loadPage(currentPage);
  }, [currentPage]);

  // Listen for sync-completed event to reload current page and clear badges
  useEffect(() => {
    const handleSyncCompleted = () => {
      console.log('[Candidate List] Sync completed event received, reloading page...');
      loadPage(currentPage);
    };
    window.addEventListener('sync-completed', handleSyncCompleted);
    return () => window.removeEventListener('sync-completed', handleSyncCompleted);
  }, [currentPage]);

  // Compute virtualization ranges based on current page size (max 100)
  const rowHeight = searchQuery ? 72 : 56;
  // Before the first page of real rows has loaded, fall back to the known
  // total so skeleton placeholder rows have something to size against —
  // otherwise ids.length is 0 and nothing (not even a skeleton) renders on
  // first visit to this page.
  const listLength = ids.length > 0 ? ids.length : (isLoading ? Math.min(totalRows, 100) : 0);
  const startRow = Math.floor(scrollOffset / rowHeight);
  const visibleCount = Math.ceil(CONTAINER_HEIGHT / rowHeight);
  const endRow = startRow + visibleCount;

  const bufferedStart = Math.max(0, startRow - OVERSCAN_BUFFER);
  const bufferedEnd = Math.min(listLength - 1, endRow + OVERSCAN_BUFFER);

  // Prepare list of virtual rows to render
  const renderedRows = [];
  for (let i = bufferedStart; i <= bufferedEnd; i++) {
    const isLoaded = i < ids.length;
    const candidateId = isLoaded ? ids[i] : null;
    const candidate = candidateId ? byId[candidateId] : null;

    renderedRows.push({
      index: i,
      isLoaded,
      candidate,
    });
  }

  const totalHeight = listLength * rowHeight;

  return (
    <div className="candidate-list-wrapper">
      <div className="candidate-list-header">
        <span className="col-num">#</span>
        <span className="col-name">Name</span>
        <span className="col-email">Email</span>
        <span className="col-phone">Phone</span>
        <span className="col-experience">Experience</span>
        <span className="col-status">Status</span>
        <span className="col-skills">Skills</span>
      </div>

      <div
        className="candidate-list-container"
        ref={containerRef}
        onScroll={handleScroll}
        style={{ height: CONTAINER_HEIGHT }}
      >
        {/* Absolute spacer to give the container correct scroll height */}
        <div className="candidate-list-spacer" style={{ height: totalHeight }} />

        {/* Rendered virtual row nodes */}
        <div className="candidate-list-items">
          {renderedRows.map(({ index, isLoaded, candidate }) => {
            if (isLoaded && candidate) {
              const isHighlighted = highlightedIds.has(candidate.id);
              return (
                <CandidateRowItem
                  key={candidate.id}
                  index={index}
                  candidate={candidate}
                  isHighlighted={isHighlighted}
                  onClick={handleSelectCandidate}
                  searchQuery={searchQuery}
                  rowHeight={rowHeight}
                />
              );
            }

            // Skeleton Placeholder Row
            return (
              <SkeletonRowItem
                key={`placeholder-${index}`}
                index={index}
                rowHeight={rowHeight}
              />
            );
          })}
        </div>

        {/* Empty State — shown when not loading and no candidates returned */}
        {!isLoading && listLength === 0 && (
          <div className="candidate-list-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="empty-state-icon">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <p className="empty-state-title">No candidates found</p>
            <p className="empty-state-subtitle">Try adjusting your search query or filters to see results.</p>
          </div>
        )}
      </div>

      <div className="candidate-list-footer">
        {isLoading && (
          <div className="loading-spinner-wrap">
            <div className="spinner" />
            <span>Loading...</span>
          </div>
        )}
        {error && <div className="error-message">Error: {error}</div>}

        {/* Pagination Controls */}
        <Pagination className="justify-center">
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous isDisabled={currentPage === 1 || isLoading} onPress={() => setCurrentPage((p) => p - 1)}>
                <Pagination.PreviousIcon />
                <span>Previous</span>
              </Pagination.Previous>
            </Pagination.Item>
            {Array.from({length: Math.ceil(totalRows / 100) || 1}, (_, i) => i + 1).map((p) => (
              <Pagination.Item key={p}>
                <Pagination.Link isActive={p === currentPage} onPress={() => setCurrentPage(p)}>
                  {p}
                </Pagination.Link>
              </Pagination.Item>
            ))}
            <Pagination.Item>
              <Pagination.Next isDisabled={currentPage === (Math.ceil(totalRows / 100) || 1) || isLoading} onPress={() => setCurrentPage((p) => p + 1)}>
                <span>Next</span>
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>

        <div className="loaded-summary">
          Showing <strong>{ids.length}</strong> of <strong>{totalRows.toLocaleString()}</strong> candidates
        </div>
      </div>
    </div>
  );
}
