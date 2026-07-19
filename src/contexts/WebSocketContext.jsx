import React, { createContext, useContext, useEffect } from 'react';
import wsClient from '../utils/webSocketClient.js';
import { isAuthenticated } from '../auth.js';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  useEffect(() => {
    if (isAuthenticated()) {
      wsClient.connect();
    }

    const handleAuthChanged = (e) => {
      if (e.detail && e.detail.token) {
        wsClient.connect();
      } else {
        wsClient.disconnect();
      }
    };

    window.addEventListener('auth-changed', handleAuthChanged);
    return () => {
      window.removeEventListener('auth-changed', handleAuthChanged);
      wsClient.disconnect();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={wsClient}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
