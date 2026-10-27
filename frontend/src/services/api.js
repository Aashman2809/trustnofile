import { getAccessToken } from './auth.js';

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

async function request(path, options) {
  const token = await getAccessToken();
  const headers = new Headers(options?.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${apiBase}/api${path}`, { ...options, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`);
  return body;
}

function uploadFile(file, onProgress) {
  return getAccessToken().then((token) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase}/api/files`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new Error('Network error: is the backend running?'));
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch {   }
      xhr.status >= 200 && xhr.status < 300 ? resolve({ ...body.file, priorAnalysis: body.priorAnalysis ?? null }) : reject(new Error(body?.error?.message || `Upload failed (${xhr.status})`));
    };
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  }));
}

async function downloadReport(id) {
  const token = await getAccessToken();
  const response = await fetch(`${apiBase}/api/analyses/${id}/report.json`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('Could not download the report. Sign in again and retry.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `trustnofile-report-${id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
export const api = {
  health: () => request('/health'),
  capabilities: () => request('/config/capabilities'),
  uploadFile,
  startAnalysis: (fileId, force = false) => request(`/files/${fileId}/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
  }),
  deleteFile: (id, purge = false) => request(`/files/${id}?purge=${purge}`, { method: 'DELETE' }),
  getStats: () => request('/analyses/stats'),
  listAnalyses: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return request('/analyses?' + q.toString());
  },
  getAnalysis: (id) => request(`/analyses/${id}`),
  getReport: (id) => request(`/analyses/${id}/report`),
  reportDownloadUrl: (id) => `/api/analyses/${id}/report.json`,
  chatWithReport: (id, question, history = []) => request(`/analyses/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  }),
  downloadReport,
};
