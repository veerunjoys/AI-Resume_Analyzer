const DB_NAME = 'RecruiterOfflineDB';
const DB_VERSION = 2;
const STORE_NAME = 'pending_edits';
const CONFLICTS_STORE = 'conflicts';

const isIndexedDBSupported = typeof indexedDB !== 'undefined';
let inMemoryQueue = [];
let inMemoryConflicts = [];

/**
 * Generates a standard UUID.
 * Uses crypto.randomUUID if available, falling back to a secure pseudo-random generator.
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Opens the IndexedDB database.
 */
function openDB() {
  if (!isIndexedDBSupported) {
    throw new Error('IndexedDB is not supported in this environment');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'client_action_id' });
      }
      if (!db.objectStoreNames.contains(CONFLICTS_STORE)) {
        db.createObjectStore(CONFLICTS_STORE, { keyPath: 'candidate_id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Enqueues a pending candidate edit action.
 * @param {object} action - Should contain { candidate_id, base_version, changes }
 * @returns {Promise<object>} - The enqueued action object including client_action_id and created_at.
 */
export async function enqueue(action) {
  const client_action_id = generateUUID();
  const enqueuedAction = {
    client_action_id,
    candidate_id: action.candidate_id,
    base_version: action.base_version,
    changes: action.changes,
    created_at: new Date().toISOString()
  };

  if (!isIndexedDBSupported) {
    inMemoryQueue.push(enqueuedAction);
    return enqueuedAction;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(enqueuedAction);

    request.onsuccess = () => {
      resolve(enqueuedAction);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Retrieves all pending candidate edits, sorted by created_at ascending.
 * @returns {Promise<Array>}
 */
export async function getAll() {
  if (!isIndexedDBSupported) {
    return [...inMemoryQueue].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => {
      const results = event.target.result || [];
      results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      resolve(results);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Removes a pending candidate edit by its client_action_id.
 * @param {string} client_action_id
 * @returns {Promise<void>}
 */
export async function remove(client_action_id) {
  if (!isIndexedDBSupported) {
    inMemoryQueue = inMemoryQueue.filter(item => item.client_action_id !== client_action_id);
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(client_action_id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Updates an existing pending edit action in the store.
 * @param {object} action - The action object including its client_action_id.
 * @returns {Promise<void>}
 */
export async function update(action) {
  if (!isIndexedDBSupported) {
    const idx = inMemoryQueue.findIndex(item => item.client_action_id === action.client_action_id);
    if (idx !== -1) {
      inMemoryQueue[idx] = action;
    }
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(action);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Clears all pending candidate edits.
 * @returns {Promise<void>}
 */
export async function clear() {
  if (!isIndexedDBSupported) {
    inMemoryQueue = [];
    inMemoryConflicts = [];
    return;
  }

  const db = await openDB();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFLICTS_STORE, 'readwrite');
    const store = transaction.objectStore(CONFLICTS_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Saves a conflict record in IndexedDB conflicts store.
 * @param {object} conflictRecord - { candidate_id, current_version, timestamp, conflicts: [] }
 * @returns {Promise<object>}
 */
export async function saveConflict(conflictRecord) {
  if (!isIndexedDBSupported) {
    const idx = inMemoryConflicts.findIndex(c => c.candidate_id === conflictRecord.candidate_id);
    if (idx !== -1) {
      inMemoryConflicts[idx] = conflictRecord;
    } else {
      inMemoryConflicts.push(conflictRecord);
    }
    return conflictRecord;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFLICTS_STORE, 'readwrite');
    const store = transaction.objectStore(CONFLICTS_STORE);
    const request = store.put(conflictRecord);

    request.onsuccess = () => {
      resolve(conflictRecord);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Retrieves a conflict record by candidate_id.
 * @param {string} candidateId
 * @returns {Promise<object|null>}
 */
export async function getConflict(candidateId) {
  if (!isIndexedDBSupported) {
    return inMemoryConflicts.find(c => c.candidate_id === candidateId) || null;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFLICTS_STORE, 'readonly');
    const store = transaction.objectStore(CONFLICTS_STORE);
    const request = store.get(candidateId);

    request.onsuccess = (event) => {
      resolve(event.target.result || null);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Removes a conflict record by candidate_id.
 * @param {string} candidateId
 * @returns {Promise<void>}
 */
export async function removeConflict(candidateId) {
  if (!isIndexedDBSupported) {
    inMemoryConflicts = inMemoryConflicts.filter(c => c.candidate_id !== candidateId);
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFLICTS_STORE, 'readwrite');
    const store = transaction.objectStore(CONFLICTS_STORE);
    const request = store.delete(candidateId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Retrieves all conflict records in the conflicts store.
 * @returns {Promise<Array>}
 */
export async function getAllConflicts() {
  if (!isIndexedDBSupported) {
    return [...inMemoryConflicts];
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFLICTS_STORE, 'readonly');
    const store = transaction.objectStore(CONFLICTS_STORE);
    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve(event.target.result || []);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
