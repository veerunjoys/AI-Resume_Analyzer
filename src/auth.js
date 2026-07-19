let jwtToken = sessionStorage.getItem('recruiter_token') || null;

export function getToken() {
  return jwtToken;
}

export function setToken(token) {
  jwtToken = token;
  if (token) {
    sessionStorage.setItem('recruiter_token', token);
  } else {
    sessionStorage.removeItem('recruiter_token');
  }
  
  // Dispatch custom event to notify components/WebSocket of auth state change
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: { token } }));
}

export function clearToken() {
  setToken(null);
}

export function isAuthenticated() {
  if (!jwtToken) return false;
  const decoded = decodeJwt(jwtToken);
  if (!decoded || !decoded.exp) return false;
  return decoded.exp * 1000 > Date.now();
}

/**
 * Returns { id, name, email } from the current JWT, or null if not logged in.
 */
export function getCurrentUser() {
  if (!jwtToken) return null;
  const decoded = decodeJwt(jwtToken);
  if (!decoded) return null;
  return { id: decoded.id, name: decoded.name, email: decoded.email };
}

function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}
