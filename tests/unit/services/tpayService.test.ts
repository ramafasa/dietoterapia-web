import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { TpayService } from '@/lib/services/tpayService'

describe('TpayService.verifyWebhookSignature DoS hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    // Ensure we don't leak fetch mocks across tests
    // @ts-expect-error - global fetch
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

    // @ts-expect-error - global fetch
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


