import axios from 'axios';

// Local dev: '/api/v1' is proxied to localhost:5000 (see package.json "proxy").
// Production builds must set REACT_APP_API_URL, e.g. https://<backend-host>/api/v1
export const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token from localStorage if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 try to refresh token once
let isRefreshing = false;
let queue = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    // Never try token-refresh for auth endpoints themselves (login/register/refresh):
    // a 401 there means bad credentials, not an expired session.
    const isAuthCall = /\/auth\/(login|register|refresh-token)/.test(original?.url || '');
    if (err.response?.status === 401 && !original._retry && !isAuthCall) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {}, { withCredentials: true });
        const newToken = data.accessToken;
        localStorage.setItem('accessToken', newToken);
        queue.forEach((p) => p.resolve(newToken));
        queue = [];
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
  queue.forEach((p) => p.reject(refreshErr));
  queue = [];
  localStorage.removeItem('accessToken');

  const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  const isPublicPage = publicPaths.some((p) => window.location.pathname.startsWith(p));


  return Promise.reject(refreshErr);
} finally {
  isRefreshing = false;
}
    }
    return Promise.reject(err);
  }
);

export default api;
