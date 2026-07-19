import { getToken, clearToken } from './auth';

export function apiClient(url, options = {}) {
  const token = getToken();
  
  // Set up headers
  const headers = {
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    ...options,
    headers,
  };

  return fetch(url, fetchOptions)
    .then((response) => {
      if (response.status === 401) {
        clearToken();
        // Redirect to login page
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }
      return response;
    })
    .catch((error) => {
      if (error.message === 'Unauthorized') {
        throw error;
      }
      throw error;
    });
}
