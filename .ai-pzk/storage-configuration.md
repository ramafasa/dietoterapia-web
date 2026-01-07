# Storage Configuration for PZK PDF Presign

## Environment Variables

The presign endpoint requires S3-compatible storage configuration via environment variables.

### Required Variables

Add these to your `.env.local` file:

```bash
# Object Storage (S3/R2) - Required for PZK PDF presign
OBJECT_STORAGE_BUCKET=your-bucket-name
OBJECT_STORAGE_ACCESS_KEY_ID=your-access-key-id
OBJECT_STORAGE_SECRET_ACCESS_KEY=your-secret-access-key
OBJECT_STORAGE_REGION=auto # Use 'auto' for Cloudflare R2, or AWS region (e.g., 'us-east-1')
OBJECT_STORAGE_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com # Required for R2, optional for S3
OBJECT_STORAGE_PROVIDER=r2 # 'r2' or 's3' (for logging/debugging)
```

### AWS S3 Configuration Example

```bash
OBJECT_STORAGE_BUCKET=my-pzk-bucket
OBJECT_STORAGE_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
OBJECT_STORAGE_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_PROVIDER=s3
# OBJECT_STORAGE_ENDPOINT is optional for AWS S3 (uses default AWS endpoint)
```

### Cloudflare R2 Configuration Example

```bash
OBJECT_STORAGE_BUCKET=my-pzk-bucket
OBJECT_STORAGE_ACCESS_KEY_ID=your-r2-access-key-id
OBJECT_STORAGE_SECRET_ACCESS_KEY=your-r2-secret-access-key
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_ENDPOINT=https://1234567890abcdef.r2.cloudflarestorage.com
OBJECT_STORAGE_PROVIDER=r2
```

## Setup Instructions

### 1. Create Storage Bucket

**AWS S3:**
- Create bucket in AWS Console
- Enable versioning (recommended)
- Configure CORS for GET requests if needed

**Cloudflare R2:**
- Create bucket in Cloudflare Dashboard
- Go to R2 → Create bucket
- Note the account ID from the endpoint URL

### 2. Generate Access Keys

**AWS S3:**
- IAM → Users → Create user (or use existing)
- Attach policy: `AmazonS3ReadOnlyAccess` (or custom policy)
- Create access key (Access key ID + Secret access key)

**Cloudflare R2:**
- R2 → Manage R2 API Tokens → Create API Token
- Permissions: Object Read (for presign GET URLs)
- Copy Access Key ID and Secret Access Key

### 3. Configure CORS (if needed)

If presigned URLs will be fetched from browser, bucket must allow CORS for GET requests:

**AWS S3 CORS configuration:**
```json
[
  {
    "AllowedOrigins": ["https://paulinamaciak.pl"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

**Cloudflare R2 CORS configuration:**
- R2 → Bucket → Settings → CORS Policy
- Add same JSON as above

### 4. Upload Test PDF

Upload a test PDF to verify configuration:

**Object key format**: `pzk/materials/{materialId}/{filename}.pdf`

Example:
- Bucket: `my-pzk-bucket`
- Object key: `pzk/materials/test-material-123/intro.pdf`

### 5. Add to Database

Add test PDF record to `pzk_material_pdfs` table:

```sql
INSERT INTO pzk_material_pdfs (
  id,
  material_id,
  object_key,
  file_name,
  content_type,
  display_order
) VALUES (
  gen_random_uuid(),
  'test-material-123', -- Must match existing material ID
  'pzk/materials/test-material-123/intro.pdf',
  'intro.pdf',
  'application/pdf',
  1
);
```

## Security Notes

### objectKey Security

- **NEVER expose `object_key` to client** - it's stored in database and used only internally
- Presigned URLs are generated on-demand with 60s TTL
- URLs include signature and expiration timestamp
- After TTL expires, URL becomes invalid (403 Forbidden)

### Content-Disposition

Presigned URLs include `Content-Disposition: attachment` header:
- Forces browser download (not inline display)
- Filename is sanitized to prevent XSS/path traversal
- Removes: path separators, quotes, control characters

### IAM Policy (AWS S3)

Minimal IAM policy for presign service (read-only):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::my-pzk-bucket/pzk/materials/*"
    }
  ]
}
```

### R2 Token Permissions

Create R2 API token with:
- **Object Read** permission only
- **Scope**: Limit to specific bucket if possible

## Testing

### Test endpoint locally:

1. Start dev server: `npm run dev`
2. Authenticate as patient user
3. POST request to presign endpoint:

```bash
curl -X POST http://localhost:4321/api/pzk/materials/{materialId}/pdfs/{pdfId}/presign \
  -H "Cookie: auth_session=..." \
  -H "Content-Type: application/json" \
  -d '{"ttlSeconds": 60}'
```

4. Response should include presigned URL:

```json
{
  "data": {
    "url": "https://my-bucket.s3.amazonaws.com/pzk/materials/.../intro.pdf?X-Amz-Algorithm=...",
    "expiresAt": "2025-12-30T14:01:00.000Z",
    "ttlSeconds": 60
  },
  "error": null
}
```

5. Test URL in browser (should download PDF)

### Verify security:

- **TTL**: Wait 61 seconds, URL should return 403
- **Filename**: Check downloaded file has sanitized name
- **Content-Type**: Verify PDF MIME type
- **IDOR**: Try accessing PDF from different material (should return 404)

## Troubleshooting

### Error: "OBJECT_STORAGE_BUCKET is not configured"

- Add missing environment variable to `.env.local`
- Restart dev server after changes

### Error: "Failed to generate presigned URL from storage"

- Check AWS/R2 credentials are correct
- Verify bucket exists and is accessible
- Check IAM/token permissions
- Look for detailed error in server logs

### Presigned URL returns 403 (before TTL expires)

- Object key doesn't exist in bucket
- Bucket permissions don't allow GetObject
- CORS misconfigured (if accessing from browser)

### Presigned URL returns 404

- Object doesn't exist at specified key
- Check `object_key` in database matches actual file path in bucket

## Production Checklist

- [ ] Use dedicated IAM user/R2 token for production (not admin)
- [ ] Restrict IAM policy to minimum permissions (GetObject only)
- [ ] Enable bucket versioning (backup/recovery)
- [ ] Configure CORS for production domain
- [ ] Monitor presign event logs (`pzk_pdf_presign_*` events)
- [ ] Set up CloudWatch/R2 alerts for 4xx/5xx errors
- [ ] Test TTL expiration (URLs should become invalid after 60s)
- [ ] Verify filename sanitization (prevent XSS)
- [ ] Test rate limiting (should block after 10 requests/min)
