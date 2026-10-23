/**
 * Wydruk /regulamin-sklepu do PDF – załącznik maila „Potwierdzenie zamówienia” (Task 5.1/5.2).
 *
 * Zmiana regulaminu = nowa SHOP_TERMS_VERSION (src/lib/shop/constants.ts) + nowy PDF z tego skryptu.
 * Stare pliki zostają w repo – zamówienia złożone wcześniej mają w termsVersion starą wersję.
 *
 * Użycie (dev server z włączonym sklepem w drugim terminalu):
 *   FF_SKLEP=true npm run dev
 *   node scripts/print-shop-terms-pdf.mjs            # http://localhost:4321
 *   node scripts/print-shop-terms-pdf.mjs http://localhost:4322
 *
 * Wymaga przeglądarki Playwright: npx playwright install chromium
 */

import { readFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '')

// Wersja wprost ze stałej – jedno źródło prawdy (bez importu TS)
const constants = readFileSync(resolve(root, 'src/lib/shop/constants.ts'), 'utf8')
const version = constants.match(/SHOP_TERMS_VERSION\s*=\s*'([^']+)'/)?.[1]
if (!version) {
  console.error('SHOP_TERMS_VERSION not found in src/lib/shop/constants.ts')
  process.exit(1)
}

const outFile = resolve(root, `src/assets/legal/regulamin-sklepu-${version}.pdf`)
mkdirSync(dirname(outFile), { recursive: true })

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const response = await page.goto(`${baseUrl}/regulamin-sklepu`, { waitUntil: 'networkidle' })
  if (!response?.ok()) throw new Error(`GET /regulamin-sklepu → ${response?.status()} (FF_SKLEP=true?)`)

  const html = await page.content()
  if (!html.includes(version)) throw new Error(`Page does not mention version ${version} – update the page or the constant`)

  // Bez nawigacji, stopki, CTA, banera cookies i toastów – w PDF tylko treść regulaminu
  await page.addStyleTag({
    content: `
      body > header, body > footer, body > nav, body .fixed, [aria-live] { display: none !important; }
      a { color: inherit !important; text-decoration: none !important; }
      main > section:last-child { display: none !important; } /* CTA „Masz pytania…” */
      main > section { padding-top: 16px !important; padding-bottom: 16px !important; }
      section { break-inside: auto; }
      h2, h3 { break-after: avoid; }
      li { break-inside: avoid; }
    `,
  })
  await page.emulateMedia({ media: 'print' })

  await page.pdf({
    path: outFile,
    format: 'A4',
    printBackground: true,
    scale: 0.8,
    margin: { top: '15mm', bottom: '18mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#666;">
      Regulamin sklepu paulinamaciak.pl – wersja ${version} – strona <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>`,
  })
} finally {
  await browser.close()
}

console.log(`Saved ${outFile} (${Math.round(statSync(outFile).size / 1024)} KB)`)
