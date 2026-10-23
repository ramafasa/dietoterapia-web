/**
 * Regulamin sklepu w PDF – załącznik maila „Potwierdzenie zamówienia” (Task 5.1/5.2).
 *
 * Pliki: src/assets/legal/regulamin-sklepu-<wersja>.pdf (wydruk /regulamin-sklepu skryptem
 * scripts/print-shop-terms-pdf.mjs). Zmiana regulaminu = nowa SHOP_TERMS_VERSION + nowy PDF;
 * stare pliki zostają – potwierdzenie (także ponowione przez cron) dostaje wersję z order.termsVersion.
 *
 * Wbudowane w bundle przez Vite (`?inline` → data URL base64), bez fs – działa w funkcji Vercel
 * bez `includeFiles` i w vitest.
 */

const files = import.meta.glob<string>('/src/assets/legal/regulamin-sklepu-*.pdf', {
  query: '?inline',
  import: 'default',
  eager: true,
})

const FILE_RE = /\/regulamin-sklepu-([^/]+)\.pdf$/
const DATA_URL_PREFIX = 'data:application/pdf;base64,'

const byVersion = new Map<string, string>()
for (const [path, dataUrl] of Object.entries(files)) {
  const version = path.match(FILE_RE)?.[1]
  if (version) byVersion.set(version, dataUrl)
}

export interface TermsPdfAttachment {
  filename: string
  content: Buffer
  contentType: 'application/pdf'
}

/** Wersje, dla których jest PDF (posortowane). */
export function availableTermsPdfVersions(): string[] {
  return [...byVersion.keys()].sort()
}

/** PDF regulaminu w danej wersji jako załącznik nodemailer; null = brak pliku dla tej wersji. */
export function getTermsPdfAttachment(termsVersion: string): TermsPdfAttachment | null {
  const dataUrl = byVersion.get(termsVersion)
  if (!dataUrl?.startsWith(DATA_URL_PREFIX)) return null
  return {
    filename: `Regulamin-sklepu-${termsVersion}.pdf`,
    content: Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), 'base64'),
    contentType: 'application/pdf',
  }
}
