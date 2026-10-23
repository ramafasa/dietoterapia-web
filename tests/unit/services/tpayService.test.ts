import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { TpayService, extractTpayErrorCodes } from '@/lib/services/tpayService'

describe('TpayService.verifyWebhookSignature DoS hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    // Ensure we don't leak fetch mocks across tests
    delete globalThis.fetch
  })

  it('caches the public key fetched from x5u (no fetch per request)', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicKeyPem = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString()

    const certUrl = 'https://secure.sandbox.tpay.com/cert.pem'
    const requestBody = 'tr_id=123&tr_status=TRUE&tr_amount=1.00&tr_crc=abc'

    const header = { alg: 'RS256', x5u: certUrl }
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    const payloadB64 = Buffer.from(requestBody).toString('base64url')
    const signingInput = `${headerB64}.${payloadB64}`

    const sign = crypto.createSign('SHA256')
    sign.update(signingInput)
    sign.end()
    const signatureBytes = sign.sign(privateKey)
    const signatureB64 = signatureBytes.toString('base64url')

    const jws = `${headerB64}.${payloadB64}.${signatureB64}`

    const fetchMock = vi.fn(async () => {
      return new Response(publicKeyPem, {
        status: 200,
        headers: { 'content-type': 'application/x-pem-file' },
      })
    })

    globalThis.fetch = fetchMock

    const svc = new TpayService({
      clientId: 'test',
      clientSecret: 'test',
      environment: 'sandbox',
      certDomain: 'secure.sandbox.tpay.com',
    })

    const first = await svc.verifyWebhookSignature(jws, requestBody)
    const second = await svc.verifyWebhookSignature(jws, requestBody)

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(certUrl, expect.anything())
  })
})



describe('TpayService.verifyWebhookSignature negatives', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicKeyPem = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString()
  const BODY = 'tr_id=123&tr_status=TRUE&tr_amount=1.00&tr_crc=abc&tr_email=anna%40example.com'

  function signJws(body: string, x5u: string, detached = false) {
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', x5u })).toString('base64url')
    const payloadB64 = Buffer.from(body).toString('base64url')
    const sign = crypto.createSign('SHA256')
    sign.update(`${headerB64}.${payloadB64}`)
    sign.end()
    return `${headerB64}.${detached ? '' : payloadB64}.${sign.sign(privateKey).toString('base64url')}`
  }

  let fetchMock: ReturnType<typeof vi.fn>
  let svc: TpayService

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock = vi.fn(async () => new Response(publicKeyPem, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    svc = new TpayService({
      clientId: 'test',
      clientSecret: 'test',
      environment: 'sandbox',
      certDomain: 'secure.sandbox.tpay.com',
    })
  })

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch
  })

  it('valid detached signature → true (sanity)', async () => {
    expect(await svc.verifyWebhookSignature(signJws(BODY, 'https://secure.sandbox.tpay.com/x.pem', true), BODY)).toBe(true)
  })

  it('x5u on a different host → false, certificate not downloaded', async () => {
    const jws = signJws(BODY, 'https://evil.example.com/x.pem')
    expect(await svc.verifyWebhookSignature(jws, BODY)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('x5u over http (not https) → false, certificate not downloaded', async () => {
    const jws = signJws(BODY, 'http://secure.sandbox.tpay.com/x.pem')
    expect(await svc.verifyWebhookSignature(jws, BODY)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('x5u is never logged raw (query) – only host/path; unparsable x5u → false, truncated', async () => {
    const secret = 'https://secure.sandbox.tpay.com/x.pem?leak=SECRET-PATH-123'
    expect(await svc.verifyWebhookSignature(signJws(BODY, secret), BODY)).toBe(true)
    const logged = JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.log).mock.calls])
    expect(logged).not.toContain('SECRET-PATH-123')
    expect(logged).toContain('secure.sandbox.tpay.com')

    vi.mocked(console.error).mockClear()
    const long = 'z'.repeat(500)
    expect(await svc.verifyWebhookSignature(signJws(BODY, long), BODY)).toBe(false)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(long)
  })

  it('detached signature over a different body → false', async () => {
    const jws = signJws(BODY, 'https://secure.sandbox.tpay.com/x.pem', true)
    expect(await svc.verifyWebhookSignature(jws, BODY.replace('tr_amount=1.00', 'tr_amount=9.00'))).toBe(false)
  })

  it('attached payload different from the body → false, body never logged', async () => {
    const jws = signJws(BODY, 'https://secure.sandbox.tpay.com/x.pem')
    const other = BODY.replace('tr_crc=abc', 'tr_crc=xyz')
    expect(await svc.verifyWebhookSignature(jws, other)).toBe(false)
    const logged = JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.log).mock.calls])
    expect(logged).not.toContain('anna')
    expect(logged).not.toContain('tr_status')
  })
})

describe('TpayService.createTransaction return URLs', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  function mockFetch() {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transactionId: 'TR-1', transactionPaymentUrl: 'https://pay' }), { status: 200 })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    vi.spyOn(console, 'log').mockImplementation(() => {})
    return fetchMock
  }

  const base = {
    amount: 29,
    description: 'Zamówienie ZAM-2026-00001',
    payerEmail: 'anna@example.com',
    notificationUrl: 'https://x/api/sklep/platnosc/callback',
    crc: 'tx-uuid',
  }

  it('appends ?status=success|error to a single returnUrl (PZK)', async () => {
    const fetchMock = mockFetch()
    const svc = new TpayService({ clientId: 'test', clientSecret: 'test', environment: 'sandbox' })

    await svc.createTransaction({ ...base, returnUrl: 'https://x/pzk/platnosc/sukces?transaction=1' })

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.callbacks.payerUrls).toEqual({
      success: 'https://x/pzk/platnosc/sukces?transaction=1&status=success',
      error: 'https://x/pzk/platnosc/sukces?transaction=1&status=error',
    })
  })

  it('uses explicit successUrl/errorUrl as-is (sklep)', async () => {
    const fetchMock = mockFetch()
    const svc = new TpayService({ clientId: 'test', clientSecret: 'test', environment: 'sandbox' })

    const result = await svc.createTransaction({
      ...base,
      successUrl: 'https://x/sklep/platnosc/sukces?order=o1',
      errorUrl: 'https://x/sklep/platnosc/blad?order=o1',
    })

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.callbacks.payerUrls).toEqual({
      success: 'https://x/sklep/platnosc/sukces?order=o1',
      error: 'https://x/sklep/platnosc/blad?order=o1',
    })
    expect(payload.callbacks.notification.url).toBe('https://x/api/sklep/platnosc/callback')
    expect(payload.hiddenDescription).toBe('tx-uuid')
    expect(result).toEqual({ transactionId: 'TR-1', paymentUrl: 'https://pay' })
  })
})

describe('TpayService.createTransaction error logging (no payer PII)', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('logs and throws only the HTTP status and Tpay error codes, never the response text', async () => {
    const tpayBody = JSON.stringify({
      result: 'failed',
      errors: [
        {
          errorCode: 'invalid_field',
          fieldName: 'payer.email',
          errorMessage: 'Value anna.kowalska@example.com is not a valid e-mail for Anna Kowalska',
          devMessage: 'payer anna.kowalska@example.com rejected',
        },
      ],
    })
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(tpayBody, { status: 400, statusText: 'Bad Request' })) as unknown as typeof fetch
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const svc = new TpayService({ clientId: 'test', clientSecret: 'test', environment: 'sandbox' })

    const promise = svc.createTransaction({
      amount: 29,
      description: 'Zamówienie ZAM-2026-00001',
      payerEmail: 'anna.kowalska@example.com',
      payerName: 'Anna Kowalska',
      successUrl: 'https://x/sukces',
      errorUrl: 'https://x/blad',
      notificationUrl: 'https://x/callback',
      crc: 'tx-uuid',
    })

    await expect(promise).rejects.toThrow('Tpay API error: 400 Bad Request [invalid_field:payer.email]')
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).toContain('400')
    expect(logged).toContain('invalid_field')
    expect(logged).not.toContain('anna.kowalska@example.com')
    expect(logged).not.toContain('Anna Kowalska')
    await promise.catch((error: Error) => {
      expect(error.message).not.toContain('anna.kowalska@example.com')
    })
  })
})

describe('extractTpayErrorCodes', () => {
  it('returns errorCode(:fieldName) and drops free text', () => {
    expect(
      extractTpayErrorCodes(
        JSON.stringify({
          errors: [
            { errorCode: 'invalid_field', fieldName: 'amount' },
            { errorCode: 'missing_field' },
            { errorCode: 'contains anna@example.com and spaces' },
          ],
        })
      )
    ).toEqual(['invalid_field:amount', 'missing_field'])
  })

  it('returns [] for non-JSON or unexpected bodies', () => {
    expect(extractTpayErrorCodes('<html>Bad Gateway anna@example.com</html>')).toEqual([])
    expect(extractTpayErrorCodes(JSON.stringify({ message: 'anna@example.com' }))).toEqual([])
    expect(extractTpayErrorCodes('')).toEqual([])
  })
})
