import '@testing-library/jest-dom';

jest.mock('./config', () => ({
  __esModule: true,
  default: {
    apiBaseUrl: 'http://localhost:4000',
    wsUrl: 'ws://localhost:4001',
  }
}));

