import { createResumableUpload } from '../resumableUpload';

// Mock apiClient to map directly to global.fetch in tests
jest.mock('../../apiClient', () => ({
  apiClient: (url, options) => global.fetch(url, options),
}));

describe('ResumableUpload State Machine Unit Tests', () => {
  let mockFile;
  let mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock File object
    mockFile = {
      name: 'resume.pdf',
      size: 20 * 1024 * 1024, // 20MB (3 chunks of 8MB each)
      slice: jest.fn(() => 'mock-blob-data')
    };

    // Setup global fetch mock
    global.fetch = jest.fn();
  });

  test('should initialize in idle state and start uploading successfully', async () => {
    // 1. Mock api/uploads/start response
    global.fetch.mockImplementation((url, options) => {
      if (url.includes('/api/uploads/start')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-123' })
        });
      }
      if (url.includes('/chunk/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ chunksReceived: [0] })
        });
      }
      return Promise.reject(new Error('Unknown URL: ' + url));
    });

    const onProgress = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();

    const controller = createResumableUpload(mockFile, 'cand-123', {
      onProgress,
      onComplete,
      onError
    });

    const initialSession = controller.getSessionInfo();
    expect(initialSession.status).toBe('idle');
    expect(initialSession.totalChunks).toBe(3); // 20MB file / 8MB CHUNK_SIZE = 3 chunks

    // Start upload
    controller.start();

    // Verify it transitions to uploading
    expect(controller.getSessionInfo().status).toBe('uploading');
  });

  test('should support pausing, resuming, and transitioning states accordingly', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/uploads/start')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-123' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ chunksReceived: [] })
      });
    });

    const controller = createResumableUpload(mockFile, 'cand-123');
    
    await controller.start();
    expect(controller.getSessionInfo().status).toBe('uploading');

    controller.pause();
    expect(controller.getSessionInfo().status).toBe('paused');

    await controller.resume();
    expect(controller.getSessionInfo().status).toBe('uploading');
  });

  test('should transition to completed when all chunks succeed and complete API resolves', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/uploads/start')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-123' })
        });
      }
      if (url.includes('/chunk/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ chunksReceived: [0, 1, 2] })
        });
      }
      if (url.includes('/complete')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ filePath: 'uploads/resumes/resume.pdf' })
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const onComplete = jest.fn();
    const controller = createResumableUpload(mockFile, 'cand-123', { onComplete });

    controller.start();

    // Allow promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(controller.getSessionInfo().status).toBe('completed');
    expect(onComplete).toHaveBeenCalledWith({ filePath: 'uploads/resumes/resume.pdf' });
  });

  test('should transition to failed state on network errors or non-ok responses', async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/uploads/start')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-123' })
        });
      }
      // Fail chunks
      return Promise.resolve({
        ok: false,
        statusText: 'Internal Error'
      });
    });

    const onError = jest.fn();
    const controller = createResumableUpload(mockFile, 'cand-123', { onError });

    controller.start();

    // Flush start promise
    await Promise.resolve();
    await Promise.resolve();

    // Fast-forward all retries (5 attempts per chunk)
    for (let i = 0; i < 10; i++) {
      jest.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(controller.getSessionInfo().status).toBe('failed');
    expect(onError).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('should transition to cancelled when cancel method is invoked', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/uploads/start')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-123' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ chunksReceived: [] })
      });
    });

    const controller = createResumableUpload(mockFile, 'cand-123');
    controller.start();
    expect(controller.getSessionInfo().status).toBe('uploading');

    controller.cancel();
    expect(controller.getSessionInfo().status).toBe('cancelled');
    expect(controller.getSessionInfo().sessionId).toBeNull();
  });
});
