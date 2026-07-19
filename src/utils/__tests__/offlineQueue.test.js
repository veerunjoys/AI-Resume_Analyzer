import {
  enqueue,
  getAll,
  remove,
  clear,
  saveConflict,
  getConflict,
  removeConflict,
  getAllConflicts
} from '../offlineQueue';

describe('offlineQueue Unit Tests (In-Memory Database Fallback)', () => {
  beforeEach(async () => {
    // Clean database queue and conflict stores before each run
    await clear();
  });

  test('should enqueue a pending action and retrieve it using getAll', async () => {
    const action = {
      candidate_id: 'cand-uuid-1',
      base_version: 5,
      changes: { status: 'Offer', notes: 'Great candidate' }
    };

    const enqueued = await enqueue(action);
    expect(enqueued.client_action_id).toBeDefined();
    expect(enqueued.candidate_id).toBe('cand-uuid-1');
    expect(enqueued.base_version).toBe(5);
    expect(enqueued.changes.status).toBe('Offer');

    const pending = await getAll();
    expect(pending.length).toBe(1);
    expect(pending[0].client_action_id).toBe(enqueued.client_action_id);
  });

  test('should delete an enqueued action from the queue when remove is called', async () => {
    const action1 = await enqueue({
      candidate_id: 'cand-uuid-1',
      base_version: 1,
      changes: { status: 'Screening' }
    });

    const action2 = await enqueue({
      candidate_id: 'cand-uuid-2',
      base_version: 2,
      changes: { status: 'Interview' }
    });

    let pending = await getAll();
    expect(pending.length).toBe(2);

    await remove(action1.client_action_id);

    pending = await getAll();
    expect(pending.length).toBe(1);
    expect(pending[0].client_action_id).toBe(action2.client_action_id);
  });

  test('should CRUD conflict records in the conflicts store', async () => {
    const conflictRecord = {
      candidate_id: 'cand-conflict-123',
      current_version: 4,
      timestamp: new Date().toISOString(),
      conflicts: [
        {
          field: 'status',
          yourValue: 'Offer',
          theirValue: 'Rejected',
          timestamp: new Date().toISOString()
        }
      ]
    };

    // Save
    await saveConflict(conflictRecord);

    // Get
    const retrieved = await getConflict('cand-conflict-123');
    expect(retrieved).not.toBeNull();
    expect(retrieved.current_version).toBe(4);
    expect(retrieved.conflicts[0].yourValue).toBe('Offer');

    // Get All
    const all = await getAllConflicts();
    expect(all.length).toBe(1);
    expect(all[0].candidate_id).toBe('cand-conflict-123');

    // Remove
    await removeConflict('cand-conflict-123');
    const afterDelete = await getConflict('cand-conflict-123');
    expect(afterDelete).toBeNull();
  });
});
