import React, { useState, useEffect } from 'react';
import { 
  Users, 
  FileText, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Percent, 
  Clock, 
  Database,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import config from '../config';
import { apiClient } from '../apiClient';
import './MetricsDashboardPage.css';

export default function MetricsDashboardPage() {
  const [stats, setStats] = useState({
    totalCandidates: 0,
    uploadedToday: 0,
    processing: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    successRate: 100,
    avgProcessingTime: 0.0,
    storageUsedMB: 0.0,
    uploadsTrend: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('This Week');

  useEffect(() => {
    let active = true;
    async function fetchStats() {
      try {
        const res = await apiClient(`${config.apiBaseUrl}/api/dashboard/stats`);
        if (res.ok && active) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    fetchStats();
    
    // Poll stats every 5 seconds
    const interval = setInterval(fetchStats, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // 1. Doughnut Chart Calculations (Processing Status)
  const total = stats.completed + stats.processing + stats.failed + stats.queued;
  
  const completedPercent = total > 0 ? stats.completed / total : 0;
  const processingPercent = total > 0 ? stats.processing / total : 0;
  const queuedPercent = total > 0 ? stats.queued / total : 0;
  const failedPercent = total > 0 ? stats.failed / total : 0;

  const circumference = 377; // 2 * Math.PI * 60 approx
  
  const completedOffset = circumference - (circumference * completedPercent);
  const processingOffset = circumference - (circumference * processingPercent);
  const queuedOffset = circumference - (circumference * queuedPercent);
  const failedOffset = circumference - (circumference * failedPercent);

  // Rotation offsets: starts at -90 degrees (12 o'clock)
  const completedRotation = -90;
  const processingRotation = -90 + (completedPercent * 360);
  const queuedRotation = -90 + ((completedPercent + processingPercent) * 360);
  const failedRotation = -90 + ((completedPercent + processingPercent + queuedPercent) * 360);

  // 2. Line Chart Calculations (Uploads Trend)
  const trendData = stats.uploadsTrend || [];
  const maxCount = Math.max(...trendData.map(d => d.count), 5); // minimum scale size of 5
  
  const points = trendData.map((d, idx) => {
    const x = 40 + (idx * 70); // 7 points spaced by 70px: 40, 110, 180, 250, 320, 390, 460
    const y = 170 - ((d.count / maxCount) * 150); // y fits between 170 (count 0) and 20 (max count)
    return { x, y, date: d.date, count: d.count };
  });

  let linePath = '';
  let areaPath = '';
  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaPath = `${linePath} L ${points[points.length - 1].x} 170 L ${points[0].x} 170 Z`;
  }

  if (isLoading) {
    return (
      <div className="metrics-dashboard-wrapper">
        <div className="metrics-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="metric-card">
              <div className="metric-card-header">
                <div className="skeleton-block" style={{ width: 40, height: 40, borderRadius: 10 }} />
                <div className="skeleton-block" style={{ width: '60%', height: 12 }} />
              </div>
              <div className="metric-card-body">
                <div className="skeleton-block" style={{ width: '45%', height: 26, marginBottom: 8 }} />
                <div className="skeleton-block" style={{ width: '70%', height: 12 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="charts-row">
          <div className="chart-card flex-double">
            <div className="skeleton-block" style={{ width: '30%', height: 16, marginBottom: 16 }} />
            <div className="skeleton-block" style={{ width: '100%', height: 200 }} />
          </div>
          <div className="chart-card flex-single">
            <div className="skeleton-block" style={{ width: '50%', height: 16, marginBottom: 16 }} />
            <div className="skeleton-block" style={{ width: 160, height: 160, borderRadius: '50%', margin: '0 auto' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="metrics-dashboard-wrapper">
      {/* 8 Metric Cards Grid */}
      <div className="metrics-grid">
        {/* 1. Total Candidates */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box purple">
              <Users size={20} />
            </div>
            <span className="metric-label">Total Candidates</span>
          </div>
          <div className="metric-card-body">
            <h2 className="metric-value">{stats.totalCandidates.toLocaleString()}</h2>
            <div className="metric-trend positive">
              <TrendingUp size={14} style={{ marginRight: '4px' }} />
              <span>Active directory profiles</span>
            </div>
          </div>
        </div>

        {/* 2. Uploaded Today */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box blue">
              <FileText size={20} />
            </div>
            <span className="metric-label">Uploaded Today</span>
          </div>
          <div className="metric-card-body">
            <h2 className="metric-value">{stats.uploadedToday}</h2>
            <div className="metric-trend positive">
              <TrendingUp size={14} style={{ marginRight: '4px' }} />
              <span>Resumes parsed today</span>
            </div>
          </div>
        </div>

        {/* 3. Processing */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box orange">
              <RefreshCw size={20} className={stats.processing > 0 ? "spinning-icon" : ""} />
            </div>
            <span className="metric-label">Processing</span>
          </div>
          <div className="metric-card-body">
            <h2 className="metric-value">{stats.processing}</h2>
            <div className="metric-trend neutral">
              <span>Extracting insights</span>
            </div>
          </div>
        </div>

        {/* 4. Completed */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box green">
              <CheckCircle2 size={20} />
            </div>
            <span className="metric-label">Completed</span>
          </div>
          <div className="metric-card-body">
            <h2 className="metric-value">{stats.completed}</h2>
            <div className="metric-trend positive">
              <TrendingUp size={14} style={{ marginRight: '4px' }} />
              <span>Fully indexed resumes</span>
            </div>
          </div>
        </div>

        {/* 5. Failed */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box red">
              <XCircle size={20} />
            </div>
            <span className="metric-label">Failed</span>
          </div>
          <div className="metric-card-body">
            <h2 className="metric-value">{stats.failed}</h2>
            <div className={`metric-trend ${stats.failed > 0 ? 'negative' : 'neutral'}`}>
              <span>{stats.failed > 0 ? 'Needs attention (in DLQ)' : 'No upload failures'}</span>
            </div>
          </div>
        </div>

        {/* 6. Success Rate */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box teal">
              <Percent size={20} />
            </div>
            <span className="metric-label">Success Rate</span>
          </div>
          <div className="metric-card-body">
            <h2 className="metric-value">{stats.successRate}%</h2>
            <div className="metric-trend positive">
              <TrendingUp size={14} style={{ marginRight: '4px' }} />
              <span>Processing accuracy</span>
            </div>
          </div>
        </div>

        {/* 7. Avg. Processing Time */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box clock-blue">
              <Clock size={20} />
            </div>
            <span className="metric-label">Avg. Processing Time</span>
          </div>
          <div className="metric-card-body">
            <h2 className="metric-value">{stats.avgProcessingTime} sec</h2>
            <div className="metric-trend positive-down">
              <TrendingDown size={14} style={{ marginRight: '4px' }} />
              <span>Queue processing speed</span>
            </div>
          </div>
        </div>

        {/* 8. Storage Used */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box storage-purple">
              <Database size={20} />
            </div>
            <span className="metric-label">Storage Used</span>
          </div>
          <div className="metric-card-body">
            <h2 className="metric-value">{stats.storageUsedMB} MB</h2>
            <div className="metric-trend neutral">
              <span>Shared uploads store size</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Columns Chart Row */}
      <div className="charts-row">
        {/* Left Card: Uploads Overview line chart */}
        <div className="chart-card flex-double">
          <div className="chart-card-header">
            <h3>Uploads Overview</h3>
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(e.target.value)}
              className="chart-timeframe-select"
            >
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
            </select>
          </div>
          <div className="chart-canvas-container">
            {/* SVG Line Chart */}
            <svg viewBox="0 0 500 220" className="uploads-chart-svg">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(99, 102, 241, 0.25)" />
                  <stop offset="100%" stopColor="rgba(99, 102, 241, 0.0)" />
                </linearGradient>
              </defs>
              {/* Horizontal helper lines */}
              <line x1="40" y1="20" x2="480" y2="20" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="40" y1="70" x2="480" y2="70" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="40" y1="120" x2="480" y2="120" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="40" y1="170" x2="480" y2="170" stroke="#f1f5f9" strokeWidth="1" />
              
              {points.length > 0 && (
                <>
                  {/* Chart Line Path */}
                  <path
                    d={areaPath}
                    fill="url(#chartGradient)"
                  />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Data points */}
                  {points.map((p, idx) => (
                    <circle key={idx} cx={p.x} cy={p.y} r="5" fill="#6366f1" stroke="#ffffff" strokeWidth="2" />
                  ))}
                </>
              )}

              {/* X Axis Labels */}
              {points.map((p, idx) => (
                <text key={idx} x={p.x} y={195} textAnchor="middle" className="axis-label">{p.date}</text>
              ))}

              {/* Y Axis Labels */}
              <text x="25" y="24" textAnchor="end" className="axis-label">{Math.round(maxCount)}</text>
              <text x="25" y="74" textAnchor="end" className="axis-label">{Math.round(maxCount * 0.75)}</text>
              <text x="25" y="124" textAnchor="end" className="axis-label">{Math.round(maxCount * 0.5)}</text>
              <text x="25" y="174" textAnchor="end" className="axis-label">{Math.round(maxCount * 0.25)}</text>
              <text x="25" y="195" textAnchor="end" className="axis-label">0</text>
            </svg>
          </div>
        </div>

        {/* Right Card: Processing Status doughnut chart */}
        <div className="chart-card flex-single">
          <div className="chart-card-header">
            <h3>Processing Status</h3>
          </div>
          <div className="chart-doughnut-container">
            {/* SVG Doughnut Chart */}
            <div className="doughnut-canvas-wrapper">
              <svg viewBox="0 0 160 160" className="doughnut-svg">
                {total === 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    fill="transparent"
                    stroke="#f1f5f9"
                    strokeWidth="16"
                  />
                )}
                {total > 0 && completedPercent > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    fill="transparent"
                    stroke="#22c55e"
                    strokeWidth="16"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${completedOffset}`}
                    transform={`rotate(${completedRotation} 80 80)`}
                  />
                )}
                {total > 0 && processingPercent > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    fill="transparent"
                    stroke="#3b82f6"
                    strokeWidth="16"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${processingOffset}`}
                    transform={`rotate(${processingRotation} 80 80)`}
                  />
                )}
                {total > 0 && queuedPercent > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    fill="transparent"
                    stroke="#a855f7"
                    strokeWidth="16"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${queuedOffset}`}
                    transform={`rotate(${queuedRotation} 80 80)`}
                  />
                )}
                {total > 0 && failedPercent > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    fill="transparent"
                    stroke="#ef4444"
                    strokeWidth="16"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${failedOffset}`}
                    transform={`rotate(${failedRotation} 80 80)`}
                  />
                )}
              </svg>
              {/* Centered label */}
              <div className="doughnut-center-label">
                <span className="total-title">Total</span>
                <span className="total-val">{total.toLocaleString()}</span>
              </div>
            </div>

            {/* Legends list */}
            <div className="doughnut-legends">
              <div className="legend-item">
                <span className="legend-dot green" />
                <span className="legend-name">Completed</span>
                <span className="legend-count">{stats.completed}</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot blue" />
                <span className="legend-name">Processing</span>
                <span className="legend-count">{stats.processing}</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot orange" />
                <span className="legend-name">Failed</span>
                <span className="legend-count">{stats.failed}</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot purple" />
                <span className="legend-name">Queued</span>
                <span className="legend-count">{stats.queued}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
