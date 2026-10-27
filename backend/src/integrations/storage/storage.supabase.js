import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../../config/env.js';

// Creates private Supabase Storage object access.
export function createSupabaseObjectStorage({ url = config.supabaseUrl, serviceRoleKey = config.supabaseServiceRoleKey, bucket = config.supabaseStorageBucket, fetchImpl = fetch } = {}) {
  if (!url || !serviceRoleKey || !bucket) throw new Error('Supabase Storage requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.');
  const baseUrl = url.replace(/\/+$/, '');
  const safeBucket = encodeURIComponent(bucket);
  // Builds the authenticated endpoint for one object.
  const objectUrl = (key, operation = 'object') => `${baseUrl}/storage/v1/${operation}/${safeBucket}/${String(key).split('/').map(encodeURIComponent).join('/')}`;
  // Returns headers for private service-side storage requests.
  const headers = (extra = {}) => ({ apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, ...extra });

  return {
    // Uploads a local temporary file to the private bucket.
    async put(localPath, objectKey, contentType = 'application/octet-stream') {
      const body = createReadStream(localPath);
      const response = await fetchImpl(objectUrl(objectKey), { method: 'POST', headers: headers({ 'Content-Type': contentType, 'x-upsert': 'false' }), body, duplex: 'half', signal: AbortSignal.timeout(120000) });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status}).`);
      return objectKey;
    },
    // Removes the temporary upload after it reaches object storage.
    async cleanupUpload(localPath) {
      await fs.rm(localPath, { force: true });
    },
    // Downloads an object to a private temporary path for analysis.
    async materialize(objectKey) {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'trustnofile-'));
      const filePath = path.join(directory, path.basename(objectKey));
      try {
        const response = await fetchImpl(objectUrl(objectKey, 'object/authenticated'), { headers: headers(), signal: AbortSignal.timeout(120000) });
        if (!response.ok || !response.body) throw new Error(`Supabase Storage download failed (${response.status}).`);
        await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath, { flags: 'wx', mode: 0o600 }));
        return { filePath, cleanup:/* Removes the downloaded temporary directory after analysis. */ () => fs.rm(directory, { recursive: true, force: true }) };
      } catch (error) {
        await fs.rm(directory, { recursive: true, force: true });
        throw error;
      }
    },
    // Deletes an object from the private bucket.
    async delete(objectKey) {
      const response = await fetchImpl(`${baseUrl}/storage/v1/object/${safeBucket}`, {
        method: 'DELETE', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [objectKey] }), signal: AbortSignal.timeout(20000),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`Supabase Storage delete failed (${response.status}).`);
    },
    // Reports whether the configured Supabase Storage endpoint is reachable.
    async getStatus() {
      try {
        const response = await fetchImpl(`${baseUrl}/storage/v1/bucket/${safeBucket}`, { headers: headers(), signal: AbortSignal.timeout(10000) });
        const status = response.status;
        await response.body?.cancel();
        return response.ok ? { status: 'available', provider: 'supabase', bucket } : { status: 'unavailable', provider: 'supabase', reason: status === 404 ? 'bucket_missing' : 'storage_request_failed' };
      } catch {
        return { status: 'unavailable', provider: 'supabase', reason: 'storage_request_failed' };
      }
    },
  };
}
