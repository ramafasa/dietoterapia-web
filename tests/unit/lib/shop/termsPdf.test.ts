/**
 * Regulamin w PDF (załącznik potwierdzenia umowy) – wbudowany przez Vite, wybierany po termsVersion.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SHOP_TERMS_VERSION } from '@/lib/shop/constants'
import { availableTermsPdfVersions, getTermsPdfAttachment } from '@/lib/shop/termsPdf'

describe('getTermsPdfAttachment', () => {
  it('has a PDF for the current SHOP_TERMS_VERSION (zmiana regulaminu = nowy PDF)', () => {
    expect(availableTermsPdfVersions()).toContain(SHOP_TERMS_VERSION)
  })

  it('returns the exact file bytes as a nodemailer attachment', () => {
    const attachment = getTermsPdfAttachment(SHOP_TERMS_VERSION)
    expect(attachment).not.toBeNull()
    expect(attachment!.filename).toBe(`Regulamin-sklepu-${SHOP_TERMS_VERSION}.pdf`)
    expect(attachment!.contentType).toBe('application/pdf')

    const onDisk = readFileSync(
      path.resolve(process.cwd(), `src/assets/legal/regulamin-sklepu-${SHOP_TERMS_VERSION}.pdf`)
    )
    expect(attachment!.content.subarray(0, 5).toString()).toBe('%PDF-')
    expect(attachment!.content.equals(onDisk)).toBe(true)
  })

  it('unknown version → null', () => {
    expect(getTermsPdfAttachment('1999-01-01')).toBeNull()
    expect(getTermsPdfAttachment('')).toBeNull()
    expect(getTermsPdfAttachment('../2026-11-01')).toBeNull()
  })
})
