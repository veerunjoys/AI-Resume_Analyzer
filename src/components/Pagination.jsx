import React from 'react';
import './Pagination.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ children, className }) {
  return (
    <div className={`custom-pagination-root ${className || ''}`}>
      {children}
    </div>
  );
}

Pagination.Content = function PaginationContent({ children }) {
  return <div className="custom-pagination-content">{children}</div>;
};

Pagination.Item = function PaginationItem({ children }) {
  return <div className="custom-pagination-item">{children}</div>;
};

Pagination.Previous = function PaginationPrevious({ isDisabled, onPress, children }) {
  return (
    <button
      type="button"
      className="custom-pagination-btn prev-btn"
      disabled={isDisabled}
      onClick={onPress}
    >
      {children}
    </button>
  );
};

Pagination.PreviousIcon = function PaginationPreviousIcon() {
  return <ChevronLeft size={14} style={{ color: 'inherit' }} />;
};

Pagination.Next = function PaginationNext({ isDisabled, onPress, children }) {
  return (
    <button
      type="button"
      className="custom-pagination-btn next-btn"
      disabled={isDisabled}
      onClick={onPress}
    >
      {children}
    </button>
  );
};

Pagination.NextIcon = function PaginationNextIcon() {
  return <ChevronRight size={14} style={{ color: 'inherit' }} />;
};

Pagination.Link = function PaginationLink({ isActive, onPress, children }) {
  return (
    <button
      type="button"
      className={`custom-pagination-link ${isActive ? 'active' : ''}`}
      onClick={onPress}
    >
      {children}
    </button>
  );
};
