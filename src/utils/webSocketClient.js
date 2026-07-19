import config from '../config.js';
import { getToken } from '../auth.js';
import { apiClient } from '../apiClient.js';

export class WebSocketClient {
  constructor() {
    this.wsUrl = config.wsUrl;
    this.apiBaseUrl = config.apiBaseUrl;
    this.ws = null;
    this.lastSeenSequenceId = 0;
    this.reconnectDelay = 1000; // start at 1s
    this.maxReconnectDelay = 30000; // cap at 30s
    this.isReplaying = false;
    this.eventQueue = [];
    this.callbacks = new Set();
    this.pingCallbacks = new Set();
    this.shouldReconnect = true;
    this.reconnectTimer = null;
    this.hasEverConnected = false; // suppress noisy errors on first attempt

    // Sliding window of applied sequence IDs (capped at 200)
    this.appliedSequences = [];

    // 50ms buffering system for out-of-order protection
    this.incomingBuffer = [];
    this.batchTimer = null;

    // Connection status tracking
    this.connectionStatus = 'offline';
    this.statusCallbacks = new Set();
    this.clientId = null;
  }

  connect() {
    this.shouldReconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    // Tear down any existing socket before creating a new one
    // This prevents "WebSocket is closed before the connection is established" warnings
    if (this.ws) {
      const oldWs = this.ws;
      this.ws = null;
      oldWs.onopen = null;
      oldWs.onclose = null;
      oldWs.onerror = null;
      oldWs.onmessage = null;
      if (oldWs.readyState === 0 || oldWs.readyState === 1) {
        oldWs.close();
      }
    }

    this.setConnectionStatus(this.hasEverConnected ? 'reconnecting' : 'connecting');
    console.log(`[WS Client] Connecting to ${this.wsUrl}`);
    
    // Support running in both Browser (native WebSocket) and Node (polyfilled WebSocket)
    const WSClass = typeof WebSocket !== 'undefined' ? WebSocket : (typeof global !== 'undefined' && global.WebSocket ? global.WebSocket : null);
    if (!WSClass) {
      console.error('[WS Client] WebSocket constructor is not available.');
      return;
    }

    const ws = new WSClass(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      console.log('[WS Client] WebSocket connection opened. Identifying...');
      this.hasEverConnected = true;
      // Reset backoff delay on successful open
      this.reconnectDelay = 1000;
      // Send auth/identify
      ws.send(JSON.stringify({ type: 'auth', token: getToken() }));
      this.setConnectionStatus('connected');
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'authenticated') {
          console.log('[WS Client] Identified successfully.');
          this.clientId = message.clientId;
          await this.replayMissedEvents();
          return;
        }

        if (message.type === 'event') {
          if (this.isReplaying) {
            // Buffer events received during replay
            console.log(`[WS Client] Replay in progress. Queueing live event (Seq: ${message.event.sequenceId})`);
            this.eventQueue.push(message.event);
          } else {
            this.queueForBatching(message.event);
          }
        }

        if (message.type === 'upload_status_ping') {
          // Lightweight, non-replayable "something changed" signal — no
          // sequencing/dedup needed, just tell listeners to go refetch.
          for (const callback of this.pingCallbacks) {
            try { callback(message); } catch (err) { console.error('[WS Client] Error in ping subscriber callback:', err); }
          }
        }
      } catch (err) {
        console.error('[WS Client] Error handling message:', err);
      }
    };

    ws.onclose = (e) => {
      // Guard: if this socket was already replaced, don't act on its close
      if (this.ws !== ws) return;

      if (e.code === 4001) {
        console.log('[WS Client] Server rejected authentication. Will not reconnect.');
        this.shouldReconnect = false;
      } else if (!this.hasEverConnected) {
        // Suppress noisy logs on initial connection attempts — server may not be ready
        console.log(`[WS Client] Initial connection attempt failed (code: ${e.code}). Retrying...`);
      } else {
        console.log(`[WS Client] WebSocket connection closed. Code: ${e.code}, Reason: ${e.reason || 'None'}`);
      }

      if (this.shouldReconnect) {
        this.setConnectionStatus('reconnecting');
        this.scheduleReconnect();
      } else {
        this.setConnectionStatus('offline');
      }
    };

    ws.onerror = () => {
      // Suppress error logging — the onclose handler will manage reconnection.
      // Browser-level WebSocket connection errors are logged by the browser automatically;
      // there is nothing actionable to log here that onclose doesn't already cover.
    };
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    // Calculate delay with exponential backoff and jitter
    // delay doubles each time, cap at 30s, add random jitter of up to 500ms
    const jitter = Math.random() * 500;
    const delay = this.reconnectDelay + jitter;
    
    console.log(`[WS Client] Scheduling reconnect in ${delay.toFixed(0)}ms (base delay: ${this.reconnectDelay}ms)`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);

    // Increment delay for next attempt
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  async replayMissedEvents() {
    this.isReplaying = true;
    console.log(`[WS Client] Fetching missed events since sequenceId: ${this.lastSeenSequenceId}`);
    try {
      const res = await apiClient(`${this.apiBaseUrl}/api/events/since/${this.lastSeenSequenceId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch missed events: ${res.statusText}`);
      }
      const missedEvents = await res.json();
      console.log(`[WS Client] Found ${missedEvents.length} missed events.`);
      
      // Process missed events sequentially via the batch queue
      for (const rawEvent of missedEvents) {
        const event = {
          id: rawEvent.id,
          sequenceId: parseInt(rawEvent.sequence_id, 10),
          candidateId: rawEvent.candidate_id,
          eventType: rawEvent.event_type,
          payload: rawEvent.payload,
          createdAt: rawEvent.created_at
        };
        this.queueForBatching(event);
      }

      // Resume live events by flushing queued events
      console.log(`[WS Client] Queueing ${this.eventQueue.length} buffered live events.`);
      const queueToProcess = [...this.eventQueue];
      this.eventQueue = [];
      this.isReplaying = false; // Turn off flag before handling so new incoming events are batched normally

      for (const event of queueToProcess) {
        this.queueForBatching(event);
      }
    } catch (err) {
      console.error('[WS Client] Error replaying missed events:', err);
      this.isReplaying = false;
    }
  }

  queueForBatching(event) {
    // Drop duplicates immediately if already in the sliding window of last 200 sequences
    if (this.appliedSequences.includes(event.sequenceId)) {
      console.log(`[WS Client] Dropping duplicate event in sliding window (Seq: ${event.sequenceId})`);
      return;
    }

    this.incomingBuffer.push(event);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, 50); // 50ms batching window
    }
  }

  flushBatch() {
    this.batchTimer = null;
    
    // Sort events by sequenceId ascending to protect against out-of-order delivery
    const sorted = [...this.incomingBuffer].sort((a, b) => a.sequenceId - b.sequenceId);
    this.incomingBuffer = [];

    for (const event of sorted) {
      this.processEventNow(event);
    }
  }

  processEventNow(event) {
    // Deduplicate again to prevent processing duplicates in the same batch
    if (this.appliedSequences.includes(event.sequenceId)) {
      console.log(`[WS Client] Dropping duplicate event in sliding window during flush (Seq: ${event.sequenceId})`);
      return;
    }

    // Skip echo event if originated from this client
    if (event.payload && event.payload._originClientId && event.payload._originClientId === this.clientId) {
      console.log(`[WS Client] Skipping echo event for Seq: ${event.sequenceId}`);
      // Add to sliding window to prevent future duplicate checks
      this.appliedSequences.push(event.sequenceId);
      if (this.appliedSequences.length > 200) {
        this.appliedSequences.shift();
      }
      this.lastSeenSequenceId = Math.max(this.lastSeenSequenceId, event.sequenceId);
      return;
    }

    // Add to sliding window
    this.appliedSequences.push(event.sequenceId);
    if (this.appliedSequences.length > 200) {
      this.appliedSequences.shift();
    }

    this.lastSeenSequenceId = Math.max(this.lastSeenSequenceId, event.sequenceId);
    console.log(`[WS Client] Applied event ${event.eventType} (Seq: ${event.sequenceId})`);
    
    // Notify subscribers
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (err) {
        console.error('[WS Client] Error in event subscriber callback:', err);
      }
    }
  }

  onEvent(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback); // Returns unsubscribe function
  }

  onPing(callback) {
    this.pingCallbacks.add(callback);
    return () => this.pingCallbacks.delete(callback); // Returns unsubscribe function
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.ws) {
      this.ws.close();
    }
    this.setConnectionStatus('offline');
  }

  setConnectionStatus(status) {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      for (const callback of this.statusCallbacks) {
        try {
          callback(status);
        } catch (err) {
          console.error('[WS Client] Error in status change callback:', err);
        }
      }
    }
  }

  onStatusChange(callback) {
    this.statusCallbacks.add(callback);
    // Invoke immediately with current status
    callback(this.connectionStatus);
    return () => this.statusCallbacks.delete(callback);
  }
}

// Export a singleton instance by default, and class for custom instantiation
const wsClientInstance = new WebSocketClient();
export default wsClientInstance;
