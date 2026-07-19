import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, FileText, Search, Sparkles } from 'lucide-react';
import config from '../config';
import { setToken } from '../auth';
import { apiClient } from '../apiClient';
import './AuthPages.css';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to sign in.');
      }

      const data = await res.json();
      setToken(data.token);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Server error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card-split animate-scale-up">
        {/* Left Side Form */}
        <div className="auth-left-panel">
          <div className="auth-header-centered">
            <Users className="auth-logo-icon" size={42} />
            <h1 className="auth-logo-title">Recruiter Workspace</h1>
            <p className="auth-logo-subtitle">Resume Management</p>
          </div>
          
          <p className="auth-welcome-text">Welcome back! Please login to your account.</p>

          <form onSubmit={handleSubmit} className="auth-form-custom">
            <div className="form-group-custom">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                required
                placeholder="recruiter@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="form-group-custom">
              <div className="label-row">
                <label htmlFor="login-password">Password</label>
                <a href="#forgot" className="forgot-link">Forgot password?</a>
              </div>
              <input
                id="login-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {error && <div className="auth-error-msg">{error}</div>}

            <button type="submit" className="auth-btn-purple" disabled={isLoading}>
              {isLoading && <span className="btn-spinner" style={{ marginRight: '8px' }} />}
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="auth-footer-prompt">
            Don't have an account? <Link to="/register">Sign up</Link>
          </div>
        </div>

        {/* Right Side Visual Panel */}
        <div className="auth-right-panel">
          <div className="graphic-container">
            <div className="resume-graphic-box">
              <FileText className="graphic-file-icon" size={100} />
              <Search className="graphic-search-icon" size={60} />
              <Sparkles className="graphic-sparkle-1" size={24} />
              <Sparkles className="graphic-sparkle-2" size={20} />
            </div>
          </div>

          <div className="right-panel-info">
            <h2>Find the best talent, faster</h2>
            <p>Upload resumes, extract insights and build your dream team</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await apiClient(`${config.apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Registration failed.');
      }

      const data = await res.json();
      setToken(data.token);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Server error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card-split animate-scale-up">
        {/* Left Side Form */}
        <div className="auth-left-panel">
          <div className="auth-header-centered">
            <Users className="auth-logo-icon" size={42} />
            <h1 className="auth-logo-title">Recruiter Workspace</h1>
            <p className="auth-logo-subtitle">Resume Management</p>
          </div>
          
          <p className="auth-welcome-text">Get started! Please create your account.</p>

          <form onSubmit={handleSubmit} className="auth-form-custom">
            <div className="form-group-custom tighter">
              <label htmlFor="reg-name">Full name</label>
              <input
                id="reg-name"
                type="text"
                required
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="form-group-custom tighter">
              <label htmlFor="reg-email">Email address</label>
              <input
                id="reg-email"
                type="email"
                required
                placeholder="jane@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="form-group-custom tighter">
              <label htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                type="password"
                required
                placeholder="•••••••• (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="form-group-custom tighter">
              <label htmlFor="reg-confirm">Confirm Password</label>
              <input
                id="reg-confirm"
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {error && <div className="auth-error-msg">{error}</div>}

            <button type="submit" className="auth-btn-purple" disabled={isLoading}>
              {isLoading && <span className="btn-spinner" style={{ marginRight: '8px' }} />}
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div className="auth-footer-prompt">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>

        {/* Right Side Visual Panel */}
        <div className="auth-right-panel">
          <div className="graphic-container">
            <div className="resume-graphic-box">
              <FileText className="graphic-file-icon" size={100} />
              <Search className="graphic-search-icon" size={60} />
              <Sparkles className="graphic-sparkle-1" size={24} />
              <Sparkles className="graphic-sparkle-2" size={20} />
            </div>
          </div>

          <div className="right-panel-info">
            <h2>Find the best talent, faster</h2>
            <p>Upload resumes, extract insights and build your dream team</p>
          </div>
        </div>
      </div>
    </div>
  );
}
