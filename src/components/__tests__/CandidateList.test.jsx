import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CandidateList from '../CandidateList';
import * as offlineQueue from '../../utils/offlineQueue';

// Mock the WebSocketContext
jest.mock('../../contexts/WebSocketContext.jsx', () => ({
  useWebSocket: () => ({
    onEvent: jest.fn(() => jest.fn()) // returns unsubscribe mock
  })
}));

// Mock the offlineQueue
jest.mock('../../utils/offlineQueue', () => ({
  getAll: jest.fn(() => Promise.resolve([])),
  getAllConflicts: jest.fn(() => Promise.resolve([]))
}));

describe('CandidateList Virtualization & Pagination Unit Tests', () => {
  let mockFetchPage;
  let mockCandidates;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create 100 mock candidates
    mockCandidates = Array.from({ length: 100 }, (_, i) => ({
      id: `cand-uuid-${i}`,
      name: `Candidate Number ${i}`,
      email: `candidate.${i}@example.com`,
      phone: `555-00${i}`,
      status: 'Applied',
      skills: ['React', 'Jest']
    }));

    mockFetchPage = jest.fn(() => Promise.resolve({
      candidates: mockCandidates,
      nextCursor: 'next-cursor-token',
      totalCount: 100
    }));
  });

  test('should render headers and list containers correctly', async () => {
    await act(async () => {
      render(
        <CandidateList
          totalRows={100}
          fetchPage={mockFetchPage}
          onSelectCandidate={jest.fn()}
        />
      );
    });

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  test('should perform virtualization calculation and render correct visible overscan range', async () => {
    let container;
    await act(async () => {
      const rendered = render(
        <CandidateList
          totalRows={100}
          fetchPage={mockFetchPage}
          onSelectCandidate={jest.fn()}
        />
      );
      container = rendered.container;
    });

    // At scrollOffset = 0:
    // visibleCount = Math.ceil(500 / 56) = 9
    // startRow = 0, endRow = 9
    // bufferedStart = Math.max(0, 0 - 8) = 0
    // bufferedEnd = Math.min(100 - 1, 9 + 8) = 17
    // Verify that index 0 is rendered but index 18 is not.
    expect(screen.getByText('Candidate Number 0')).toBeInTheDocument();
    expect(screen.getByText('Candidate Number 17')).toBeInTheDocument();
    expect(screen.queryByText('Candidate Number 18')).not.toBeInTheDocument();
  });

  test('should update visible range dynamically when container scrollTop offset changes', async () => {
    let container;
    await act(async () => {
      const rendered = render(
        <CandidateList
          totalRows={100}
          fetchPage={mockFetchPage}
          onSelectCandidate={jest.fn()}
        />
      );
      container = rendered.container;
    });

    // Initially, Candidate Number 27 should NOT be in the document
    expect(screen.queryByText('Candidate Number 27')).not.toBeInTheDocument();

    const scrollContainer = container.querySelector('.candidate-list-container');
    
    // Simulate scroll down: set scrollTop to 2000
    // At scrollOffset = 2000:
    // startRow = Math.floor(2000 / 56) = 35
    // endRow = 35 + 9 = 44
    // bufferedStart = Math.max(0, 35 - 8) = 27
    // bufferedEnd = Math.min(100 - 1, 44 + 8) = 52
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 2000, writable: true });
    
    await act(async () => {
      fireEvent.scroll(scrollContainer);
      // Wait for requestAnimationFrame mock call
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Check that indices 27 and 52 are now in the document, but index 26 and 53 are not
    expect(screen.getByText('Candidate Number 27')).toBeInTheDocument();
    expect(screen.getByText('Candidate Number 52')).toBeInTheDocument();
    expect(screen.queryByText('Candidate Number 26')).not.toBeInTheDocument();
    expect(screen.queryByText('Candidate Number 53')).not.toBeInTheDocument();
  });

  test('should render pagination footer controls correctly', async () => {
    await act(async () => {
      render(
        <CandidateList
          totalRows={250}
          fetchPage={mockFetchPage}
          onSelectCandidate={jest.fn()}
        />
      );
    });

    expect(screen.getByText('‹ Prev')).toBeInTheDocument();
    expect(screen.getByText('Next ›')).toBeInTheDocument();
    expect(screen.getByText(/Page/)).toBeInTheDocument();
  });
});
