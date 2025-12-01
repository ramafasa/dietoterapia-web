## CRITICAL

### Issue #1: Dietitian APIs lack patient scoping (broken access control)
**Location**: `src/pages/api/dietitian/patients/[patientId].ts`, `src/lib/services/patientService.ts`, `src/lib/services/weightEntryService.ts`

**Description**: Every dietitian endpoint only checks the caller’s role and then lets them read or mutate any patient referenced by ID. None of the services verify that the patient belongs to the logged-in dietitian, and `confirmOutlier` even contains a `TODO` that explicitly skips RBAC.

```38:86:src/pages/api/dietitian/patients/[patientId].ts
    if (user.role !== 'dietitian') {
      const errorResponse: ApiError = {
        error: 'forbidden',
        message: 'Tylko dietetycy mogą przeglądać szczegóły pacjentów',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const validatedParams = getPatientDetailsParamsSchema.parse({
      patientId: params.patientId,
    })

    const result: GetPatientDetailsResponse = await patientService.getPatientDetails(
      validatedParams.patientId,
      user.id // dla analytics (best-effort)
    )
```

```120:169:src/lib/services/patientService.ts
  async getPatientDetails(
    patientId: string,
    dietitianId?: string
  ): Promise<GetPatientDetailsResponse> {
    try {
      const patient = await userRepository.findById(patientId)

      if (!patient || patient.role !== 'patient') {
        throw new NotFoundError('Pacjent nie został znaleziony')
      }
      ...
      if (dietitianId) {
        eventRepository
          .create({
            userId: dietitianId,
            eventType: 'view_patient_details',
            properties: { patientId },
          })
```

```611:623:src/lib/services/weightEntryService.ts
    } else if (sessionUserRole === 'dietitian') {
      // TODO: Implement RBAC helper - canAccessPatientEntry(sessionUserId, entry.userId)
      console.warn('[WeightEntryService] Dietitian RBAC not fully implemented - assuming access granted')
    } else {
      throw new ForbiddenError('Nieprawidłowa rola użytkownika')
    }
```

**Security Impact**: Any dietitian credential (or a compromised dietitian account) can enumerate every patient, download their full weight history, update their status, or confirm outliers—even if that dietitian should never have access to those records. Because patient health data is sensitive, this is a severe data protection and compliance failure.

**Recommendation**: Introduce a persistent dietitian–patient ownership model (join table or field) and enforce it in a central authorization helper. All dietitian APIs and service methods must call this helper before returning or mutating patient data. Until then, block access unless the caller is explicitly assigned to the patient. Remove the `TODO` shortcut in `confirmOutlier` and add automated tests that prove unauthorized dietitians are rejected.

## HIGH

### Issue #1: Password reset tokens stored in plaintext ✅ RESOLVED
**Location**: `src/lib/tokens.ts`, `src/lib/repositories/invitationRepository.ts`
**Status**: FIXED on 2025-11-29
**Fixed by**: Security implementation of SHA-256 token hashing

**Original Description**: `generatePasswordResetToken` writes the raw reset token into the `password_reset_tokens` table and later compares it directly. Anyone who gains read access to the database (or logs) can reuse these tokens for account takeovers.

**Security Impact**: Database leaks immediately translate into valid password reset links, letting an attacker change any user's password without knowing their current credentials.

**Resolution Implemented**:
1. Created `src/lib/crypto.ts` with `hashToken()` function (SHA-256 hashing)
2. Updated database schema:
   - `invitations.token` → `invitations.tokenHash`
   - `password_reset_tokens.token` → `password_reset_tokens.tokenHash`
3. Updated all token generation/validation functions to hash tokens before DB operations
4. Raw tokens only exist in memory during email sending
5. Database migration applied: `drizzle/0004_hash_token_columns.sql`

**Implementation Details**:
- Algorithm: SHA-256 (cryptographically secure one-way hash)
- Raw token: 64-char hex (32 random bytes)
- Stored hash: 64-char hex (SHA-256 output)
- Tokens are single-use (marked with `usedAt`)
- Automatic expiration (60 min password reset, 7 days invitations)

**Verification**:
- ✅ All unit tests passing (162 tests)
- ✅ Type checking passing
- ✅ Database migration applied successfully
- ✅ Documentation updated in CLAUDE.md

**Files Modified**:
- `src/lib/crypto.ts` (new)
- `src/lib/tokens.ts` (updated)
- `src/lib/repositories/invitationRepository.ts` (updated)
- `src/lib/services/invitationService.ts` (updated)
- `src/db/schema.ts` (updated)
- `src/types.ts` (updated)
- All test fixtures updated to use hashed tokens
- Migration: `drizzle/0004_hash_token_columns.sql`

**Note**: This fix also applies to invitation tokens, providing comprehensive security for all token-based operations.

### Issue #2: Contact and consultation APIs operate as an unauthenticated email relay ✅ RESOLVED
**Location**: `src/pages/api/contact.ts`, `src/pages/api/consultation.ts`
**Status**: FIXED on 2025-12-01
**Fixed by**: Comprehensive security implementation (rate limiting + reCAPTCHA + sanitization)

**Original Description**: Both public endpoints accept arbitrary JSON and immediately send two SMTP emails—one to the site owner and another to the user-supplied address—without authentication, CAPTCHA, or rate limiting. Attackers can therefore use your infrastructure to deliver spam to any recipient, with content fully controlled via the request body.

```58:164:src/pages/api/contact.ts
    const ownerEmailOptions = { ... }

    const userEmailOptions = {
      from: contactEmail,
      to: email,
      subject: 'Potwierdzenie wysłania wiadomości - Dietoterapia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          ...
          <p style="background-color: #F9F6F3; padding: 15px; border-radius: 8px; white-space: pre-wrap; line-height: 1.6;">${message}</p>
        </div>
      `,
    };

    try {
      const ownerEmailResult = await transporter.sendMail(ownerEmailOptions);
      ...
      const userEmailResult = await transporter.sendMail(userEmailOptions);
```

```93:224:src/pages/api/consultation.ts
    const ownerEmailOptions = { ... }
    const userEmailOptions = {
      from: contactEmail,
      to: email,
      subject: 'Potwierdzenie wysłania zapytania - Dietoterapia',
      html: `
        <div ...>
          ...
        </div>
      `,
    };

    const ownerEmailResult = await transporter.sendMail(ownerEmailOptions);
    const userEmailResult = await transporter.sendMail(userEmailOptions);
```

**Security Impact**: Anyone on the internet can send thousands of emails per minute to arbitrary addresses via your SMTP credentials, burning your reputation and possibly getting the domain blocked. The attacker can fully control the email HTML, so phishing content would appear as if it came from you.

**Resolution Implemented**:
1. **IP-based Rate Limiting** (`src/lib/rate-limit-public.ts`):
   - In-memory storage (Map-based)
   - Limit: 5 requests per hour per IP
   - Automatic garbage collection (every 10 minutes)
   - Returns 429 status with retry-after time when exceeded

2. **Google reCAPTCHA v3** (`src/lib/captcha.ts`):
   - Server-side token verification
   - Minimum score threshold: 0.5
   - Action validation ('contact_form', 'consultation_form')
   - Timeout protection (5 seconds)
   - Dev mode bypass for local development

3. **Email Security** (`src/lib/email-security.ts`):
   - Strict HTML sanitization (removes all tags, escapes special chars)
   - Email recipient validation (blocks disposable domains)
   - Email rate limiting: 2 confirmation emails per hour per address
   - Risk score calculation for suspicious emails
   - Form data sanitization (names, phone, messages)

4. **Endpoint Updates** (`src/pages/api/contact.ts`, `src/pages/api/consultation.ts`):
   - IP extraction from headers (x-forwarded-for, x-real-ip)
   - Security checks order: IP rate limit → reCAPTCHA → email validation → email rate limit
   - Sanitization of all user inputs before email generation
   - Owner email always sent, confirmation email conditionally sent based on rate limit
   - Comprehensive logging for blocked requests

5. **Schema Updates** (`src/schemas/contact.ts`, `src/schemas/consultation.ts`):
   - Added `recaptchaToken: z.string().min(1)` field

**Security Benefits**:
- ✅ Prevents spam flooding (max 5 requests/hour per IP)
- ✅ Blocks bot attacks (reCAPTCHA verification)
- ✅ Prevents XSS attacks in emails (HTML sanitization)
- ✅ Blocks disposable email addresses
- ✅ Prevents harassment via confirmation emails (2/hour limit)
- ✅ Comprehensive logging for security monitoring

**Verification**:
- ✅ Unit tests passing (162 tests total)
  - `tests/unit/rate-limit-public.test.ts` - Rate limiting logic
  - `tests/unit/captcha.test.ts` - reCAPTCHA verification
  - `tests/unit/email-security.test.ts` - Sanitization & validation
- ✅ Type checking passing
- ✅ Dev mode support (skips reCAPTCHA, logs instead of rate limiting)

**Files Modified**:
- `src/lib/rate-limit-public.ts` (new)
- `src/lib/captcha.ts` (new)
- `src/lib/email-security.ts` (new)
- `src/pages/api/contact.ts` (updated)
- `src/pages/api/consultation.ts` (updated)
- `src/schemas/contact.ts` (updated)
- `src/schemas/consultation.ts` (updated)
- Unit tests (3 new files)

**Deployment Requirements**:
1. Generate reCAPTCHA v3 keys: https://www.google.com/recaptcha/admin
2. Add environment variables to Vercel:
   - `PUBLIC_RECAPTCHA_SITE_KEY` (public key for frontend)
   - `RECAPTCHA_SECRET_KEY` (secret key for backend)
3. Frontend updates required (not yet implemented):
   - Add reCAPTCHA script to Layout.astro
   - Generate token on form submit
   - Handle 429 rate limit errors in UI

**Note**: Frontend integration is pending. Backend is fully secured and ready for deployment once frontend adds reCAPTCHA token generation.

## MEDIUM

### Issue #1: Password reset requests can be abused for email flooding
**Location**: `src/pages/api/auth/password-reset-request.ts`

**Description**: The reset request endpoint intentionally returns 200 for any email (good) but it does not throttle or cap requests per user/IP. An attacker can loop this call to continually email password-reset links to a victim, effectively performing a denial-of-service or social-engineering attack.

```59:128:src/pages/api/auth/password-reset-request.ts
    const { email } = passwordResetRequestSchema.parse(body)
    const normalizedEmail = email.trim().toLowerCase()

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1)

    if (!user) {
      return jsonResponse<ForgotPasswordResponse>({ message: SUCCESS_MESSAGE }, 200)
    }

    ...
    const token = await generatePasswordResetToken(user.id)
    const resetLink = `${siteUrl.replace(/\/$/, '')}/reset-hasla/${token}`

    ...
    await sendPasswordResetEmail(...)
    await recordEvent({
      userId: user.id,
      eventType: 'password_reset_requested',
      properties: emailSent ? undefined : { emailSent: false },
    })
```

**Security Impact**: Attackers can repeatedly trigger reset emails to harass users, potentially leading to support tickets or conditioning users to ignore legitimate security emails.

**Recommendation**: Introduce per-email/IP cooldowns (e.g., limit to 3 requests per hour), store attempts in `loginAttempts` or a dedicated table, and require CAPTCHA or authenticated sessions before issuing multiple resets. Notify users when limits are hit so they know to contact support if they did not initiate the requests.

## LOW

### Issue #1: Missing HTTP security headers
**Location**: `astro.config.mjs`, `vercel.json`

**Description**: The Astro/Vercel configuration does not set baseline headers such as `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`, or `Permissions-Policy`. Without them, browsers fall back to permissive defaults, leaving room for downgrade or content-injection scenarios on supporting infrastructure.

```8:27:astro.config.mjs
export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap()
  ],
  output: 'server',
  adapter: vercel(),
  site: 'https://paulinamaciak.pl',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  },
  vite: {
    optimizeDeps: {
      exclude: ['@astrojs/react']
    }
  }
});
```

**Security Impact**: While not an immediate exploit, missing headers reduce defense-in-depth—e.g., users could be vulnerable to SSL stripping on first visit (no HSTS) or to third-party script injection (no CSP) if another bug surfaces.

**Recommendation**: Add middleware or Vercel `headers` rules that set HSTS (including preload), a restrictive CSP, `Referrer-Policy: no-referrer`, and other modern security headers. Reuse existing libraries (e.g., `helmet` for Astro middleware) to keep the configuration consistent across routes.

