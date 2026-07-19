import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Activity,
  Users,
  Settings,
  User,
  LogOut,
  Bell,
  Briefcase,
  ChevronDown
} from 'lucide-react';
import config from './config';
import CandidateList from './components/CandidateList';
import FilterBar from './components/FilterBar';
import CandidateDetailPanel from './components/CandidateDetailPanel';
import AddCandidateForm from './components/AddCandidateForm';
import MetricsDashboardPage from './components/MetricsDashboardPage';
import { useWebSocket } from './contexts/WebSocketContext.jsx';
import UploadStatusTracker from './components/UploadStatusTracker';
import ProtectedRoute from './components/ProtectedRoute';
import { LoginPage, RegisterPage } from './components/AuthPages';
import { clearToken, getCurrentUser } from './auth';
import { apiClient } from './apiClient';
import JobsPage from './components/JobsPage';
import './App.css';

// Candidates Directory view component
function DashboardPage({
  selectedCandidateId,
  setSelectedCandidateId,
  lastUpdatedCandidate,
  setLastUpdatedCandidate,
  newCandidate,
  setNewCandidate,
  isAddModalOpen,
  setIsAddModalOpen,
  totalRows,
  setTotalRows
}) {
  const [filters, setFilters] = useState({ search: '', status: '', location: '', skills: [], hasResume: false });
  const [isListLoading, setIsListLoading] = useState(false);

  const wsClient = useWebSocket();

  // Subscribe to real-time events via WebSocket
  useEffect(() => {
    if (!wsClient) return;

    const unsubscribe = wsClient.onEvent((event) => {
      if (event.eventType === 'candidate_created') {
        setNewCandidate(event.payload);
        setTotalRows((prev) => prev + 1);
      } else if (event.eventType === 'candidate_updated') {
        setLastUpdatedCandidate(event.payload);
      } else if (event.eventType === 'candidate_deleted') {
        if (selectedCandidateId === event.payload.id) {
          if (event.payload.mergedInto) {
            console.log(`[App] Current draft candidate ${event.payload.id} merged into existing candidate ${event.payload.mergedInto}. Switching view...`);
            setSelectedCandidateId(event.payload.mergedInto);
          } else {
            setSelectedCandidateId(null);
          }
        }
        setLastUpdatedCandidate({ id: event.payload.id, isDeleted: true });
        setTotalRows((prev) => Math.max(0, prev - 1));
      }
    });

    return () => unsubscribe();
  }, [wsClient]);

  // Fetch page callback passed to the virtualized list
  const fetchPage = async (cursor) => {
    setIsListLoading(true);
    try {
      // Unified endpoint: /api/candidates handles both search (via search_vector) and plain filters
      let url = `${config.apiBaseUrl}/api/candidates?limit=100`;

      if (filters.search) {
        url += `&search=${encodeURIComponent(filters.search)}`;
      }
      if (filters.status) {
        url += `&status=${encodeURIComponent(filters.status)}`;
      }
      if (filters.skills && filters.skills.length > 0) {
        url += `&skills=${encodeURIComponent(filters.skills.join(','))}`;
      }
      if (filters.location) {
        url += `&location=${encodeURIComponent(filters.location)}`;
      }
      if (filters.hasResume) {
        url += `&hasResume=true`;
      }
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }

      const res = await apiClient(url);
      if (!res.ok) {
        throw new Error('Failed to fetch candidates');
      }
      const data = await res.json();

      // Only update total row count on the initial (non-cursor) page load
      if (!cursor && data.totalCount !== undefined) {
        setTotalRows(data.totalCount);
      }
      return data;
    } catch (err) {
      console.error(err);
      return { candidates: [], nextCursor: null, totalCount: 0 };
    } finally {
      setIsListLoading(false);
    }
  };

  return (
    <div className="workspace-main">
      {/* Left Side: Controls & List */}
      <section className="list-section">
        {/* Section Title with Add CTA Button & Controls inline */}
        <div className="list-section-header">
          <div className="list-title-wrap">
            <h3>Candidates Directory</h3>
            <span className="count-badge">{totalRows.toLocaleString()} total</span>
          </div>
          <div className="list-header-actions">
            <FilterBar onChange={setFilters} isLoading={isListLoading} />
            <button className="add-candidate-trigger-btn" onClick={() => setIsAddModalOpen(true)}>
              + Add Candidate
            </button>
          </div>
        </div>

        {/* Keyset Virtualized Candidate List */}
        <CandidateList
          key={`list-${filters.status}-${filters.location}-${filters.skills.join(',')}-${filters.search}-${filters.hasResume}`}
          totalRows={totalRows}
          fetchPage={fetchPage}
          onSelectCandidate={setSelectedCandidateId}
          updatedCandidate={lastUpdatedCandidate}
          newCandidate={newCandidate}
          searchQuery={filters.search}
        />
      </section>

      {/* Detailed Profile Viewer & Editor Popup Modal */}
      {selectedCandidateId && (
        <CandidateDetailPanel
          candidateId={selectedCandidateId}
          onSaveSuccess={setLastUpdatedCandidate}
          lastUpdatedCandidate={lastUpdatedCandidate}
          onClose={() => setSelectedCandidateId(null)}
        />
      )}

      {/* Creation Modal Overlay */}
      <AddCandidateForm
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(cand) => {
          setNewCandidate(cand);
          setTotalRows((prev) => prev + 1);
        }}
        onSelectCandidate={setSelectedCandidateId}
      />
    </div>
  );
}

function DashboardLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Lifted States
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [lastUpdatedCandidate, setLastUpdatedCandidate] = useState(null);
  const [newCandidate, setNewCandidate] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [totalRows, setTotalRows] = useState(10000);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const userMenuRef = React.useRef(null);

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  // Close the user menu when clicking outside it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'upload', label: 'Upload Resume', icon: Upload, action: () => { setActiveTab('candidates'); setIsAddModalOpen(true); } },
    { id: 'queue', label: 'Upload Queue', icon: Activity },
    { id: 'candidates', label: 'Candidates', icon: Users },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
  ];

  return (
    <div className="app-workspace-split">
      {/* Sidebar Navigation */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-logo">
          <Users className="sidebar-logo-icon" size={26} />
          <h2>Recruiter Workspace</h2>
        </div>
        <nav className="sidebar-nav">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (item.action) {
                    item.action();
                  } else {
                    setActiveTab(item.id);
                  }
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User menu — bottom-left of the sidebar */}
        <div className="sidebar-footer user-menu-wrapper" ref={userMenuRef}>
          {isUserMenuOpen && (
            <div className="user-menu-dropdown sidebar-user-menu-dropdown">
              <div className="user-menu-header">
                <span className="user-menu-name">{currentUser?.name || 'Account'}</span>
                <span className="user-menu-email">{currentUser?.email}</span>
              </div>
              <button
                className="user-menu-item"
                onClick={() => { setActiveTab('settings'); setIsUserMenuOpen(false); }}
              >
                <Settings size={15} />
                <span>Settings</span>
              </button>
              <button className="user-menu-item logout" onClick={handleLogout}>
                <LogOut size={15} />
                <span>Logout</span>
              </button>
            </div>
          )}
          <button
            className="user-profile-avatar sidebar-user-profile-btn"
            title={currentUser?.name || 'User Profile'}
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          >
            <User size={18} />
            <span className="user-avatar-name">{currentUser?.name || 'Account'}</span>
            <ChevronDown size={14} className={`user-avatar-chevron ${isUserMenuOpen ? 'open' : ''}`} />
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="dashboard-main-container">
        {/* Top Header — hidden on the Candidates page */}
        {activeTab !== 'candidates' && (
          <header className="dashboard-top-header">
            <div className="top-header-left">
              <h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1>
            </div>
            <div className="top-header-right">
              <button className="notification-bell-btn" title="Notifications">
                <Bell size={18} />
                <span className="bell-badge" />
              </button>
            </div>
          </header>
        )}

        {/* Scrollable Content Body */}
        <main className="dashboard-content-body">
          {activeTab === 'dashboard' && <MetricsDashboardPage />}
          
          {activeTab === 'candidates' && (
            <DashboardPage 
              selectedCandidateId={selectedCandidateId}
              setSelectedCandidateId={setSelectedCandidateId}
              lastUpdatedCandidate={lastUpdatedCandidate}
              setLastUpdatedCandidate={setLastUpdatedCandidate}
              newCandidate={newCandidate}
              setNewCandidate={setNewCandidate}
              isAddModalOpen={isAddModalOpen}
              setIsAddModalOpen={setIsAddModalOpen}
              totalRows={totalRows}
              setTotalRows={setTotalRows}
            />
          )}

          {activeTab === 'queue' && (
            <div className="tracker-page-container">
              <div className="tracker-page-header">
                <h2>Upload Status Queue</h2>
                <p className="tracker-subtitle">Monitor real-time resume uploads and pipeline processing stages.</p>
              </div>
              <UploadStatusTracker />
            </div>
          )}

          {activeTab === 'jobs' && <JobsPage />}

          {activeTab === 'settings' && (
            <div className="mock-section-container">
              <h2>Settings Panel</h2>
              <p className="mock-subtitle">This panel is currently in draft. Real metrics are active under the **Dashboard** and **Candidates** tabs.</p>
              <div className="mock-illustration-card">
                <LayoutDashboard size={48} className="mock-icon" />
                <p>Data orchestration details will populate here in the next sprint.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
