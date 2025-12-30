import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  getPurchaseCtaConfig,
  buildPurchaseUrl,
} from '@/lib/pzk/config'
import type { PzkPurchaseCta } from '@/types/pzk-dto'

describe('PZK Config - getPurchaseCtaConfig()', () => {
  // Store original env values
  let originalBaseUrl: string | undefined
  let originalParamName: string | undefined

  beforeEach(() => {
    // Save original values
    originalBaseUrl = import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL
    originalParamName = import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME
  })

  afterEach(() => {
    // Restore original values
    if (originalBaseUrl !== undefined) {
      import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL = originalBaseUrl
    } else {
      delete import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL
    }
    if (originalParamName !== undefined) {
      import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME = originalParamName
    } else {
      delete import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME
    }
  })

  it('should return default fallback values when env vars not set', () => {
    // Clear env vars by deleting them
    delete import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL
    delete import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME

    const config = getPurchaseCtaConfig()

    expect(config).toEqual({
      baseUrl: 'https://example.com/pzk',
      paramName: 'module',
    })
  })

  it('should use env var for baseUrl when set', () => {
    import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL =
      'https://paulinamaciak.pl/zakup'
    delete import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME

    const config = getPurchaseCtaConfig()

    expect(config.baseUrl).toBe('https://paulinamaciak.pl/zakup')
    expect(config.paramName).toBe('module') // default
  })

  it('should use env var for paramName when set', () => {
    delete import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL
    import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME = 'modul'

    const config = getPurchaseCtaConfig()

    expect(config.baseUrl).toBe('https://example.com/pzk') // default
    expect(config.paramName).toBe('modul')
  })

  it('should use both env vars when set', () => {
    import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL =
      'https://paulinamaciak.pl/zakup'
    import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME = 'modul'

    const config = getPurchaseCtaConfig()

    expect(config).toEqual({
      baseUrl: 'https://paulinamaciak.pl/zakup',
      paramName: 'modul',
    })
  })
})

describe('PZK Config - buildPurchaseUrl()', () => {
  it('should build URL with module 1', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(1, config)

    expect(url).toBe('https://example.com/pzk?module=1')
  })

  it('should build URL with module 2', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(2, config)

    expect(url).toBe('https://example.com/pzk?module=2')
  })

  it('should build URL with module 3', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(3, config)

    expect(url).toBe('https://example.com/pzk?module=3')
  })

  it('should use default config when not provided', () => {
    const url = buildPurchaseUrl(1)

    // Should use fallback config from getPurchaseCtaConfig()
    expect(url).toBe('https://example.com/pzk?module=1')
  })

  it('should handle custom param name', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/buy',
      paramName: 'modul',
    }

    const url = buildPurchaseUrl(2, config)

    expect(url).toBe('https://example.com/buy?modul=2')
  })

  it('should preserve existing query parameters', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk?source=app',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(1, config)

    expect(url).toBe('https://example.com/pzk?source=app&module=1')
  })

  it('should handle base URL with trailing slash', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk/',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(1, config)

    expect(url).toBe('https://example.com/pzk/?module=1')
  })

  it('should handle base URL with path', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://paulinamaciak.pl/przestrzen-zdrowej-kobiety',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(2, config)

    expect(url).toBe(
      'https://paulinamaciak.pl/przestrzen-zdrowej-kobiety?module=2'
    )
  })

  it('should handle base URL with hash fragment', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk#pricing',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(1, config)

    // URL.searchParams.set() should preserve hash
    expect(url).toBe('https://example.com/pzk?module=1#pricing')
  })

  it('should override module param if already present', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk?module=1',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(3, config)

    // Should replace module=1 with module=3
    expect(url).toBe('https://example.com/pzk?module=3')
  })

  it('should handle complex query string', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk?source=email&campaign=winter&utm_medium=email',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(2, config)

    // Should append module param and preserve others
    const urlObj = new URL(url)
    expect(urlObj.searchParams.get('source')).toBe('email')
    expect(urlObj.searchParams.get('campaign')).toBe('winter')
    expect(urlObj.searchParams.get('utm_medium')).toBe('email')
    expect(urlObj.searchParams.get('module')).toBe('2')
  })

  it('should handle invalid base URL gracefully (fallback)', () => {
    const config: PzkPurchaseCta = {
      baseUrl: 'not-a-valid-url',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(1, config)

    // Should fallback to simple string concatenation
    expect(url).toBe('not-a-valid-url?module=1')
  })
})

describe('PZK Config - Integration', () => {
  it('should produce correct URL for real-world scenario', () => {
    // Simulate production config
    const productionConfig: PzkPurchaseCta = {
      baseUrl: 'https://paulinamaciak.pl/przestrzen-zdrowej-kobiety',
      paramName: 'module',
    }

    const urlModule1 = buildPurchaseUrl(1, productionConfig)
    const urlModule2 = buildPurchaseUrl(2, productionConfig)
    const urlModule3 = buildPurchaseUrl(3, productionConfig)

    expect(urlModule1).toBe(
      'https://paulinamaciak.pl/przestrzen-zdrowej-kobiety?module=1'
    )
    expect(urlModule2).toBe(
      'https://paulinamaciak.pl/przestrzen-zdrowej-kobiety?module=2'
    )
    expect(urlModule3).toBe(
      'https://paulinamaciak.pl/przestrzen-zdrowej-kobiety?module=3'
    )
  })

  it('should work with tracking parameters', () => {
    const configWithTracking: PzkPurchaseCta = {
      baseUrl: 'https://example.com/pzk?utm_source=app&utm_medium=cta',
      paramName: 'module',
    }

    const url = buildPurchaseUrl(2, configWithTracking)

    const urlObj = new URL(url)
    expect(urlObj.searchParams.get('utm_source')).toBe('app')
    expect(urlObj.searchParams.get('utm_medium')).toBe('cta')
    expect(urlObj.searchParams.get('module')).toBe('2')
  })
})
