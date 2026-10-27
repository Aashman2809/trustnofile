async function request(path, options) {
  const res = await fetch(`/api${path}`, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`);
  return body;
}

function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
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
  });
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
};
