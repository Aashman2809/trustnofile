import { createReadStream, statSync } from 'node:fs';
import { boundedSandboxResult } from './sandbox.result.js';

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 48 * 1024 * 1024;

export function createRemoteSandbox({ url, token, fetchImpl = fetch } = {}) {
  const baseUrl = String(url || '').replace(/\/$/, '');
  const authorization = `Bearer ${token || ''}`;
  let endpointAllowed = false;
  try {
    const parsed = new URL(baseUrl);
    endpointAllowed = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname));
  } catch { }

  async function request(endpoint, { method = 'GET', body, timeoutMs = 5000, headers = {} } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    body?.on?.('error', () => {});
    try {
      const response = await fetchImpl(`${baseUrl}${endpoint}`, {
        method, headers: { authorization, ...headers }, body, signal: controller.signal,
        ...(body ? { duplex: 'half' } : {}),
      });
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body || []) {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) throw new Error('Sandbox worker response exceeded limit');
        chunks.push(chunk);
      }
      return { response, text: Buffer.concat(chunks).toString('utf8') };
    } finally {
      body?.destroy?.();
      clearTimeout(timer);
    }
  }

  return {
    async getStatus() {
      if (!baseUrl || !token || !endpointAllowed) return { status: 'unavailable', reason: 'sandbox worker is not configured' };
      try {
        const { response, text } = await request('/v1/status');
        const value = JSON.parse(text);
        return response.ok && value.status === 'available'
          ? { status: 'available', executionScope: 'isolated_linux_elf' }
          : { status: 'unavailable', reason: 'sandbox worker is unavailable' };
      } catch { return { status: 'unavailable', reason: 'sandbox worker is unavailable' }; }
    },

    async run({ fileRef, timeoutMs = 30000 } = {}) {
      if (!baseUrl || !token || !endpointAllowed || typeof fileRef !== 'string') return unavailable('Sandbox worker is unavailable; no file was executed.');
      let size;
      try { size = statSync(fileRef).size; } catch { return unavailable('Sandbox input is unavailable; no file was executed.'); }
      if (!size || size > MAX_FILE_BYTES) return unavailable('Sandbox input is outside the supported size range; no file was executed.');
      const timeout = Math.max(1000, Math.min(Number(timeoutMs) || 30000, 60000));
      try {
        const { response, text } = await request('/v1/analyze', {
          method: 'POST', body: createReadStream(fileRef), timeoutMs: timeout + 15000,
          headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) },
        });
        if (!response.ok) return unavailable('Sandbox worker is unavailable; no file was executed.');
        return boundedSandboxResult(JSON.parse(text));
      } catch { return unavailable('Sandbox worker is unavailable; static analysis results are preserved.'); }
    },
  };
}

function unavailable(message) {
  return { status: 'unavailable', message, behavioralEvidence: null, logs: [], artifacts: [] };
}
