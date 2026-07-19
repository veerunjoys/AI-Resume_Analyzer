import config from '../config';
import { apiClient } from '../apiClient';

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks

/**
 * Creates a resumable file upload controller using an explicit state machine.
 * @param {File} file - The file object to upload.
 * @param {string} candidateId - The ID of the candidate.
 * @param {Object} options - Callbacks for progress, completion, and errors.
 * @param {function} options.onProgress - Called with progress percentage (0-100) and failed status.
 * @param {function} options.onComplete - Called with the final file details on success.
 * @param {function} options.onError - Called with error object on failure.
 */
export function createResumableUpload(file, candidateId, { onProgress, onComplete, onError, onSessionCreated } = {}) {
  let sessionId = null;
  let status = 'idle'; // 'idle' | 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled'
  let chunksReceived = new Set();
  let failedChunks = new Set();
  let pendingIndices = [];
  let activeUploadsCount = 0;

  const chunkAttempts = new Map(); // chunkIndex -> attempt count
  const currentAbortControllers = new Map(); // chunkIndex -> AbortController
  const activeTimeouts = new Map(); // chunkIndex -> timeoutId

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Enforces valid state transitions in the upload state machine
  const transition = (nextState) => {
    const validTransitions = {
      idle: ['uploading', 'cancelled'],
      uploading: ['paused', 'completed', 'failed', 'cancelled'],
      paused: ['uploading', 'cancelled'],
      failed: ['uploading', 'cancelled'],
      completed: [], // Final state
      cancelled: [], // Final state
    };

    const allowed = validTransitions[status];
    if (!allowed || !allowed.includes(nextState)) {
      throw new Error(`Invalid state transition: Cannot change status from "${status}" to "${nextState}"`);
    }

    status = nextState;
  };

  // Clears all pending retry backoff timeouts
  const clearAllTimeouts = () => {
    for (const [chunkIndex, timeoutId] of activeTimeouts.entries()) {
      clearTimeout(timeoutId);
    }
    activeTimeouts.clear();
  };

  // Aborts all current active chunk HTTP requests and clears timeouts
  const abortAllActive = () => {
    for (const [chunkIndex, controller] of currentAbortControllers.entries()) {
      controller.abort();
    }
    currentAbortControllers.clear();
    clearAllTimeouts();
    activeUploadsCount = 0;
  };

  // Triggers the final complete API endpoint when all chunks are uploaded
  const triggerComplete = async () => {
    try {
      // Transition to completed is performed on success
      const res = await apiClient(`${config.apiBaseUrl}/api/uploads/${sessionId}/complete`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to complete upload session.');
      }

      const result = await res.json();
      transition('completed');
      if (onComplete) onComplete(result);
    } catch (err) {
      // If complete fails, mark state machine as failed
      try {
        transition('failed');
      } catch (transitionErr) {
        // Safe fallback
      }
      if (onError) onError(err);
    }
  };

  // Uploads a single chunk of the file with retry backoff logic
  const uploadChunk = (chunkIndex) => {
    if (status !== 'uploading') return;

    activeUploadsCount++;
    const controller = new AbortController();
    currentAbortControllers.set(chunkIndex, controller);

    const startByte = chunkIndex * CHUNK_SIZE;
    const endByte = Math.min(file.size, startByte + CHUNK_SIZE);
    const chunkBlob = file.slice(startByte, endByte);

    apiClient(`${config.apiBaseUrl}/api/uploads/${sessionId}/chunk/${chunkIndex}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: chunkBlob,
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to upload chunk ${chunkIndex}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        currentAbortControllers.delete(chunkIndex);
        activeUploadsCount--;
        chunksReceived.add(chunkIndex);
        chunkAttempts.delete(chunkIndex);

        // Report progress percentage and failed list
        const progress = Math.round((chunksReceived.size / totalChunks) * 100);
        if (onProgress) onProgress(progress, { failedChunks: Array.from(failedChunks) });

        // Continue running the queue
        runQueue();
      })
      .catch((err) => {
        currentAbortControllers.delete(chunkIndex);
        activeUploadsCount--;

        if (err.name === 'AbortError') {
          // Request was intentionally cancelled/paused
          return;
        }

        const attempts = (chunkAttempts.get(chunkIndex) || 0) + 1;
        chunkAttempts.set(chunkIndex, attempts);

        if (attempts < 5) {
          // Exponential backoff retry: 500ms, 1000ms, 2000ms, 4000ms
          const delay = 500 * Math.pow(2, attempts - 1);
          console.warn(`Chunk ${chunkIndex} failed (attempt ${attempts}/5). Retrying in ${delay}ms...`);
          
          const timeoutId = setTimeout(() => {
            activeTimeouts.delete(chunkIndex);
            if (status === 'uploading') {
              uploadChunk(chunkIndex);
            }
          }, delay);
          activeTimeouts.set(chunkIndex, timeoutId);
        } else {
          // Max attempts reached, mark chunk as failed in state
          console.error(`Chunk ${chunkIndex} failed after 5 attempts.`);
          failedChunks.add(chunkIndex);
          
          // Report progress and state containing new failure
          const progress = Math.round((chunksReceived.size / totalChunks) * 100);
          if (onProgress) onProgress(progress, { failedChunks: Array.from(failedChunks) });
          
          // Continue with remaining queue chunks
          runQueue();
        }
      });
  };

  // Concurrency queue runner
  const runQueue = () => {
    if (status !== 'uploading') return;

    if (pendingIndices.length === 0 && activeUploadsCount === 0 && activeTimeouts.size === 0) {
      if (failedChunks.size === 0) {
        triggerComplete();
      } else {
        // Transition to failed state
        try {
          transition('failed');
        } catch (e) {
          // Already in failed status or handled
        }
        if (onError) {
          onError(new Error(`${failedChunks.size} chunks failed to upload.`));
        }
      }
      return;
    }

    // Process up to 4 simultaneous chunk uploads
    while (activeUploadsCount < 4 && pendingIndices.length > 0) {
      const chunkIndex = pendingIndices.shift();
      uploadChunk(chunkIndex);
    }
  };

  const getStatusFromServer = async () => {
    const res = await apiClient(`${config.apiBaseUrl}/api/uploads/${sessionId}/status`);
    if (!res.ok) {
      throw new Error('Failed to fetch upload session status from server.');
    }
    const data = await res.json();
    return data;
  };

  return {
    /**
     * Start the upload session. Enforces transition: idle -> uploading.
     */
    async start() {
      // Validate transition
      transition('uploading');

      try {
        if (!sessionId) {
          // Initialize upload session
          const res = await apiClient(`${config.apiBaseUrl}/api/uploads/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              candidateId,
              fileName: file.name,
              totalChunks,
            }),
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to start upload session.');
          }

          const data = await res.json();
          sessionId = data.sessionId;
          if (onSessionCreated) {
            onSessionCreated(data);
          }
        }

        // Initialize pending indices
        chunksReceived.clear();
        failedChunks.clear();
        chunkAttempts.clear();
        pendingIndices = Array.from({ length: totalChunks }, (_, i) => i);

        // Trigger queue
        runQueue();
      } catch (err) {
        try {
          transition('failed');
        } catch (e) {}
        if (onError) onError(err);
      }
    },

    /**
     * Pause the upload. Enforces transition: uploading -> paused.
     * Aborts active HTTP requests and retries.
     */
    pause() {
      transition('paused');
      abortAllActive();
    },

    /**
     * Resume the upload session. Enforces transition: paused -> uploading or failed -> uploading.
     * Syncs with the server to find missing chunks before uploading.
     */
    async resume() {
      // Validate transition
      transition('uploading');

      try {
        if (!sessionId) {
          throw new Error('No upload session to resume.');
        }

        // Sync progress from server
        const data = await getStatusFromServer();
        const serverReceived = data.chunksReceived || [];

        chunksReceived = new Set(serverReceived);
        
        // Filter out already confirmed chunks
        pendingIndices = [];
        for (let i = 0; i < totalChunks; i++) {
          if (!chunksReceived.has(i) && !failedChunks.has(i)) {
            pendingIndices.push(i);
          }
        }

        // Report starting progress
        const progress = Math.round((chunksReceived.size / totalChunks) * 100);
        if (onProgress) onProgress(progress, { failedChunks: Array.from(failedChunks) });

        // Resume queue
        runQueue();
      } catch (err) {
        try {
          transition('failed');
        } catch (e) {}
        if (onError) onError(err);
      }
    },

    /**
     * Cancels the upload. Enforces transition: any state except completed -> cancelled.
     */
    cancel() {
      transition('cancelled');
      abortAllActive();
      sessionId = null;
      chunksReceived.clear();
      failedChunks.clear();
      chunkAttempts.clear();
      pendingIndices = [];
      if (onProgress) onProgress(0, { failedChunks: [] });
    },

    /**
     * Manually retry a single failed chunk index.
     * @param {number} chunkIndex
     */
    retryChunk(chunkIndex) {
      if (!failedChunks.has(chunkIndex)) return;

      failedChunks.delete(chunkIndex);
      chunkAttempts.delete(chunkIndex);
      pendingIndices.push(chunkIndex);

      if (status === 'failed') {
        transition('uploading');
      }

      runQueue();
    },

    /**
     * Returns the current session state object.
     */
    getSessionInfo() {
      return {
        sessionId,
        status,
        totalChunks,
        chunksConfirmed: chunksReceived.size,
        failedChunks: Array.from(failedChunks),
        progress: Math.round((chunksReceived.size / totalChunks) * 100),
      };
    },
  };
}
