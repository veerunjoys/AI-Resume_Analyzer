const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

// Single base URL — all services (API, events, orchestrator, search, WebSocket)
// are now served from one port on the same Express server.
const BASE_URL = env.VITE_API_BASE_URL || 'http://localhost:4000';
const WS_URL   = BASE_URL.replace(/^http/, 'ws');

const config = {
  apiBaseUrl:        BASE_URL,          // /api/*, /events/*, /orchestrator/*, /search/*
  wsUrl:             WS_URL,            // ws://localhost:4000
  eventSystemUrl:    BASE_URL,          // /events/stream, /events/emit
  orchestratorUrl:   BASE_URL,          // /orchestrator/*
  searchUrl:         BASE_URL,          // /search/candidates
};

export default config;
