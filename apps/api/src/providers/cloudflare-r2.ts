import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client | null {
  const { r2 } = config.cloudflare;
  if (!r2.accountId || !r2.accessKeyId || !r2.secretAccessKey) {
    return null;
  }
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey
      }
    });
  }
  return s3ClientInstance;
}

export function isR2Configured(): boolean {
  return Boolean(getS3Client());
}

/**
 * Uploads audio or photo to Cloudflare R2 bucket.
 */
export async function uploadToR2(input: {
  bytes: Buffer;
  key: string;
  mimeType: string;
}): Promise<{ url: string; key: string; provider: 'cloudflare-r2' }> {
  const client = getS3Client();
  if (!client) throw new Error('Cloudflare R2 is not configured. Add CLOUDFLARE_R2 credentials in .env');

  const { bucket, publicDomain } = config.cloudflare.r2;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.mimeType
    })
  );

  let publicUrl: string;
  if (publicDomain) {
    const domainClean = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
    publicUrl = `${domainClean}/${input.key}`;
  } else {
    // Generate a pre-signed streaming URL (valid for 7 days)
    publicUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: input.key
      }),
      { expiresIn: 60 * 60 * 24 * 7 }
    );
  }

  return {
    provider: 'cloudflare-r2',
    key: input.key,
    url: publicUrl
  };
}

/**
 * Universal media saver: Uses Cloudflare R2 if credentials exist; otherwise falls back to local uploads directory.
 */
export async function saveMediaFile(input: {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  category?: 'audio' | 'photos' | 'documents';
}): Promise<{ url: string; key: string; provider: 'cloudflare-r2' | 'local' }> {
  const ext = input.filename.includes('.') ? input.filename.split('.').pop() : 'bin';
  const category = input.category ?? 'audio';
  const key = `${category}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;

  if (isR2Configured()) {
    return uploadToR2({
      bytes: input.bytes,
      key,
      mimeType: input.mimeType
    });
  }

  // Fallback: save to local directory
  const localDir = join(process.cwd(), 'data', 'uploads', category);
  await mkdir(localDir, { recursive: true });
  const localPath = join(localDir, `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`);
  await writeFile(localPath, input.bytes);

  return {
    provider: 'local',
    key,
    url: `/v1/storage/local/${key}`
  };
}
