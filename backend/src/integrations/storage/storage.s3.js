import fs, { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { config } from '../../config/env.js';

const safeKey = (value) => {
  const key = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/i.test(key) || path.basename(key) !== key) throw new Error('Invalid storage object key.');
  return key;
};

export function createS3ObjectStorage({ bucket = config.awsStorageBucket, client = null, region = config.awsRegion } = {}) {
  if (!bucket || !region) throw new Error('S3 storage requires AWS_REGION and AWS_S3_BUCKET.');
  const s3 = client || new S3Client({ region });
  return {
    async put(localPath, objectKey, contentType = 'application/octet-stream') {
      const key = safeKey(objectKey);
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `uploads/${key}`, Body: createReadStream(localPath), ContentLength: (await stat(localPath)).size, ContentType: contentType, ServerSideEncryption: 'AES256' }));
      return key;
    },
    async cleanupUpload(localPath) { await fs.rm(localPath, { force: true }); },
    async materialize(objectKey) {
      const key = safeKey(objectKey);
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'trustnofile-s3-'));
      const filePath = path.join(directory, key);
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `uploads/${key}` }));
        if (!result.Body) throw new Error('S3 object body was empty.');
        const limit = Math.floor(config.maxUploadMb * 1024 * 1024);
        if (Number.isFinite(result.ContentLength) && result.ContentLength > limit) {
          result.Body.destroy?.();
          throw new Error('Stored object exceeds the configured upload limit.');
        }
        await pipeline(result.Body, byteLimit(limit), createWriteStream(filePath, { flags: 'wx', mode: 0o600 }));
        return { filePath, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
      } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
    },
    async delete(objectKey) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `uploads/${safeKey(objectKey)}` })); },
    async putSandboxInput(localPath, objectKey) {
      const key = safeKey(objectKey);
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `sandbox-input/${key}`, Body: createReadStream(localPath), ContentLength: (await stat(localPath)).size, ServerSideEncryption: 'AES256' }));
      return key;
    },
    async getSandboxResult(objectKey) {
      const key = safeKey(objectKey);
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `sandbox-results/${key}` }));
      if (!result.Body || (Number.isFinite(result.ContentLength) && result.ContentLength > 64 * 1024)) throw new Error('Sandbox result exceeded its response limit.');
      const chunks = [];
      let size = 0;
      for await (const chunk of result.Body) {
        size += chunk.length;
        if (size > 64 * 1024) throw new Error('Sandbox result exceeded its response limit.');
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    },
    async deleteSandboxObject(prefix, objectKey) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `${prefix}/${safeKey(objectKey)}` })); },
    async getStatus() {
      try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); return { status: 'available', provider: 's3', bucket }; }
      catch { return { status: 'unavailable', provider: 's3', reason: 'bucket_unavailable' }; }
    },
    async createPresignedUpload(objectKey, expiresIn = 300) {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const key = safeKey(objectKey);
      return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: `sandbox-input/${key}`, ServerSideEncryption: 'AES256' }), { expiresIn });
    },
    async createPresignedDownload(objectKey, expiresIn = 300) {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const key = safeKey(objectKey);
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: `sandbox-input/${key}` }), { expiresIn });
    },
  };
}

function byteLimit(maxBytes) {
  let seen = 0;
  return new Transform({ transform(chunk, _encoding, callback) {
    seen += chunk.length;
    callback(seen > maxBytes ? new Error('Stored object exceeds the configured upload limit.') : null, chunk);
  } });
}
