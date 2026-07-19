import config from '../config.js';
import * as offlineQueue from './offlineQueue.js';
import wsClient from './webSocketClient.js';
import { apiClient } from '../apiClient.js';

let isSyncing = false;

/**
 * Synchronizes all pending offline candidate edits to the server.
 * Processes results: removes applied/merged from offlineQueue;
 * for conflicts, removes from offlineQueue but saves conflict details in IndexedDB.
 */
export async function syncOfflineActions() {
  if (isSyncing) return;

  const pending = await offlineQueue.getAll();
  if (pending.length === 0) return;

  isSyncing = true;
  console.log(`[Sync Manager] Starting sync of ${pending.length} pending offline edits...`);

  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (wsClient.clientId) {
      headers['X-Client-Id'] = wsClient.clientId;
    }

    const res = await apiClient(`${config.apiBaseUrl}/api/sync/replay`, {
      method: 'POST',
      headers,
      body: JSON.stringify(pending),
    });

    if (!res.ok) {
      throw new Error(`Server returned error status ${res.status}`);
    }

    const results = await res.json();
    console.log('[Sync Manager] Replay results:', results);

    for (const result of results) {
      const originalAction = pending.find(a => a.client_action_id === result.client_action_id);
      if (!originalAction) continue;

      // Always remove enqueued item from offlineQueue
      await offlineQueue.remove(result.client_action_id);

      if (result.status === 'applied' || result.status === 'merged') {
        console.log(`[Sync Manager] Action ${result.client_action_id} successfully synced/resolved.`);
      } else if (result.status === 'conflict') {
        const timestamp = new Date().toISOString();
        const conflictsList = [];

        // Build conflict details (field, your value, their value, timestamp)
        if (result.conflicts) {
          for (const field of Object.keys(result.conflicts)) {
            conflictsList.push({
              field,
              yourValue: originalAction.changes[field],
              theirValue: result.conflicts[field],
              timestamp
            });
          }
        }

        const conflictRecord = {
          candidate_id: originalAction.candidate_id,
          current_version: result.currentServerValues?.version || (originalAction.base_version + 1),
          timestamp,
          conflicts: conflictsList
        };

        await offlineQueue.saveConflict(conflictRecord);
        console.log(`[Sync Manager] Conflict stored for candidate ${originalAction.candidate_id}.`);
      } else {
        console.warn(`[Sync Manager] Action ${result.client_action_id} failed:`, result.error);
      }
    }

    // Trigger custom event to notify React components that the sync cycle has completed
    window.dispatchEvent(new CustomEvent('sync-completed', { detail: results }));
  } catch (err) {
    console.error('[Sync Manager] Error during batch sync replay:', err);
  } finally {
    isSyncing = false;
    console.log('[Sync Manager] Offline edit sync cycle completed.');
  }
}
