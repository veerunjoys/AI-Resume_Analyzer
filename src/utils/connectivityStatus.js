import config from '../config.js';
import wsClient from './webSocketClient.js';

let status = 'online'; // default initial
const callbacks = new Set();
let pingTimer = null;
let consecutiveFailures = 0;
const MAX_FAILURES = 2;
const PING_INTERVAL = 10000; // 10 seconds

function getNavigatorOnLine() {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true; // Default to true in non-browser/testing environments
}

async function pingHealthEndpoint() {
  try {
    const fetchFunc = typeof fetch !== 'undefined' ? fetch : (typeof global !== 'undefined' && global.fetch ? global.fetch : null);
    if (!fetchFunc) return false;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const res = await fetchFunc(`${config.apiBaseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });

    clearTimeout(id);
    return res.ok;
  } catch (err) {
    return false;
  }
}

function updateStatus(newStatus) {
  if (status !== newStatus) {
    status = newStatus;
    console.log(`[Connectivity Status] Genuine connection status: ${status.toUpperCase()}`);
    for (const callback of callbacks) {
      try {
        callback(status);
      } catch (err) {
        console.error('[Connectivity Status] Error in callback subscription:', err);
      }
    }
  }
}

export async function evaluateStatus(forcePing = false) {
  const navOnline = getNavigatorOnLine();

  if (!navOnline) {
    consecutiveFailures = MAX_FAILURES;
    updateStatus('offline');
    return;
  }

  // If WebSocket is connected, we are genuinely online
  if (wsClient && wsClient.connectionStatus === 'connected') {
    consecutiveFailures = 0;
    updateStatus('online');
    return;
  }

  // If navigator says online but WS is not connected, ping the health endpoint
  if (forcePing || consecutiveFailures < MAX_FAILURES) {
    const isHealthy = await pingHealthEndpoint();
    if (isHealthy) {
      consecutiveFailures = 0;
      updateStatus('online');
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_FAILURES) {
        updateStatus('offline');
      }
    }
  }
}

function handleWindowOnline() {
  consecutiveFailures = 0;
  evaluateStatus(true);
}

function handleWindowOffline() {
  consecutiveFailures = MAX_FAILURES;
  updateStatus('offline');
}

function handleWSStatusChange(wsStatus) {
  if (wsStatus === 'connected') {
    consecutiveFailures = 0;
    updateStatus('online');
  } else {
    evaluateStatus();
  }
}

export function getStatus() {
  return status;
}

export function onChange(callback) {
  callbacks.add(callback);
  // Invoke immediately with current state
  callback(status);
  return () => callbacks.delete(callback);
}

export function startMonitoring() {
  if (pingTimer) return;

  evaluateStatus(true);

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleWindowOnline);
    window.addEventListener('offline', handleWindowOffline);
  }

  if (wsClient && typeof wsClient.onStatusChange === 'function') {
    wsClient.onStatusChange(handleWSStatusChange);
  }

  pingTimer = setInterval(() => {
    evaluateStatus();
  }, PING_INTERVAL);
}

export function stopMonitoring() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }

  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleWindowOnline);
    window.removeEventListener('offline', handleWindowOffline);
  }
}

// Auto-start in browser contexts
if (typeof window !== 'undefined') {
  startMonitoring();
}
