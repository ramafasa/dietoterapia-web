/**
 * Ochrona przed rozjazdem stałych zgód i treści regulaminu (/regulamin-sklepu).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DIGITAL_CONTENT_CONSENT_TEXT, SHOP_TERMS_VERSION } from '@/lib/shop/constants'

const termsPage = readFileSync(path.resolve(process.cwd(), 'src/pages/regulamin-sklepu.astro'), 'utf8')

describe('shop constants vs /regulamin-sklepu', () => {
  it('SHOP_TERMS_VERSION equals the version shown on the terms page', () => {
    const match = termsPage.match(/<strong>Wersja:<\/strong>\s*([0-9-]+)/)
    expect(match?.[1]).toBe(SHOP_TERMS_VERSION)
  })

  it('DIGITAL_CONTENT_CONSENT_TEXT is quoted word for word in § 9 ust. 3', () => {
    const section = termsPage.slice(termsPage.indexOf('§ 9.'), termsPage.indexOf('§ 10.'))
    const points = [...section.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1])
    expect(points[2]).toContain(`„${DIGITAL_CONTENT_CONSENT_TEXT}”`)
  })
})
