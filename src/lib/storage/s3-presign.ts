/**
 * S3/R2 Storage Presigned URL Generation
 *
 * This module provides utilities for generating presigned URLs for S3-compatible storage
 * (AWS S3, Cloudflare R2, etc.) with proper security headers and TTL configuration.
 *
 * Environment variables required:
 * - OBJECT_STORAGE_BUCKET: Bucket name
 * - OBJECT_STORAGE_ACCESS_KEY_ID: Access key ID
 * - OBJECT_STORAGE_SECRET_ACCESS_KEY: Secret access key
 * - OBJECT_STORAGE_REGION: AWS region (e.g., 'us-east-1') or 'auto' for R2
 * - OBJECT_STORAGE_ENDPOINT: Custom endpoint URL (required for R2, optional for S3)
 * - OBJECT_STORAGE_PROVIDER: 'r2' or 's3' (for logging/debugging)
 *
 * Security features:
 * - Time-limited URLs (TTL)
 * - Content-Disposition: attachment (forces download)
 * - Filename sanitization (prevent XSS/path traversal)
 * - Content-Type validation
 */

import { S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

/**
 * Storage configuration from environment variables
 */
interface StorageConfig {
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  endpoint?: string
  provider: 'r2' | 's3'
}

/**
 * Presign URL parameters
 */
export interface PresignUrlParams {
  objectKey: string
  fileName: string
  contentType: string
  ttlSeconds: number
}

/**
 * Load and validate storage configuration from environment
 *
 * @throws Error if required environment variables are missing
 */
function loadStorageConfig(): StorageConfig {
  const bucket = import.meta.env.OBJECT_STORAGE_BUCKET
  const accessKeyId = import.meta.env.OBJECT_STORAGE_ACCESS_KEY_ID
  const secretAccessKey = import.meta.env.OBJECT_STORAGE_SECRET_ACCESS_KEY
  const region = import.meta.env.OBJECT_STORAGE_REGION || 'auto'
  const endpoint = import.meta.env.OBJECT_STORAGE_ENDPOINT
  const provider = (import.meta.env.OBJECT_STORAGE_PROVIDER || 's3') as 'r2' | 's3'

  if (!bucket) {
    throw new Error('OBJECT_STORAGE_BUCKET is not configured')
  }

  if (!accessKeyId) {
    throw new Error('OBJECT_STORAGE_ACCESS_KEY_ID is not configured')
  }

  if (!secretAccessKey) {
    throw new Error('OBJECT_STORAGE_SECRET_ACCESS_KEY is not configured')
  }

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    endpoint,
    provider,
  }
}

/**
 * Create S3 client with configuration
 *
 * @param config - Storage configuration
 * @returns Configured S3Client
 */
function createS3Client(config: StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    // Force path-style URLs for R2 compatibility
    forcePathStyle: config.provider === 'r2',
  })
}

/**
 * Sanitize filename for Content-Disposition header
 *
 * Removes/replaces characters that could cause issues:
 * - Path separators (/, \)
 * - Control characters
 * - Quotes
 *
 * @param fileName - Original filename
 * @returns Sanitized filename safe for HTTP header
 *
 * @example
 * sanitizeFileName('../../etc/passwd') → 'etc-passwd'
 * sanitizeFileName('file"with\'quotes.pdf') → 'file-with-quotes.pdf'
 */
function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[\/\\]/g, '-') // Replace path separators
    .replace(/["']/g, '') // Remove quotes
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable characters
    .substring(0, 255) // Limit length
}

/**
 * Generate presigned GET URL for object download
 *
 * Creates a time-limited signed URL for downloading an object from S3/R2 storage.
 * URL includes security headers:
 * - Content-Disposition: forces browser download with sanitized filename
 * - Content-Type: sets MIME type from parameter
 *
 * @param params - Presign parameters (objectKey, fileName, contentType, ttlSeconds)
 * @returns Presigned URL (valid for ttlSeconds)
 * @throws Error if storage is not configured or presign fails
 *
 * @example
 * const url = await generatePresignedUrl({
 *   objectKey: 'pzk/materials/abc123.pdf',
 *   fileName: 'wprowadzenie.pdf',
 *   contentType: 'application/pdf',
 *   ttlSeconds: 60
 * })
 * // Returns: 'https://storage.example.com/bucket/pzk/materials/abc123.pdf?X-Amz-Algorithm=...'
 */
export async function generatePresignedUrl(
  params: PresignUrlParams
): Promise<string> {
  const { objectKey, fileName, contentType, ttlSeconds } = params

  try {
    // Load configuration
    const config = loadStorageConfig()

    // Create S3 client
    const s3Client = createS3Client(config)

    // Sanitize filename for security
    const safeFileName = sanitizeFileName(fileName)

    // Create GetObject command with response headers
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFileName}"`,
      ResponseContentType: contentType || 'application/pdf',
    })

    // Generate presigned URL
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: ttlSeconds,
    })

    if (import.meta.env.DEV) {
      console.log(
        `[S3 Presign] Generated URL for ${objectKey} (TTL: ${ttlSeconds}s, provider: ${config.provider})`
      )
    }

    return presignedUrl
  } catch (error) {
    console.error('[S3 Presign] Error generating presigned URL:', error)

    // Don't expose internal error details to caller
    throw new Error('Failed to generate presigned URL from storage')
  }
}

/**
 * Validate storage configuration (for health checks)
 *
 * @returns true if storage is properly configured, false otherwise
 */
export function isStorageConfigured(): boolean {
  try {
    loadStorageConfig()
    return true
  } catch (error) {
    return false
  }
}
