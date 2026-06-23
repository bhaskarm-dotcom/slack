import axios from 'axios';
const BASE = import.meta.env.VITE_API_URL || '';
const api = axios.create({ baseURL: BASE, withCredentials: true });
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('commhub_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) { localStorage.removeItem('commhub_token'); window.location.reload(); }
  return Promise.reject(err);
});
export default api;
