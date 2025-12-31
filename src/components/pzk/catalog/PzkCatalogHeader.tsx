/**
 * PzkCatalogHeader Component
 *
 * Header section for the PZK Catalog page.
 *
 * Features:
 * - Page title (h1)
 * - Description/lead text
 */

export function PzkCatalogHeader() {
  return (
    <header className="mb-8" data-testid="pzk-catalog-header">
      <h1 className="text-4xl font-heading font-bold text-neutral-dark mb-2">
        Katalog PZK
      </h1>
      <p className="text-lg text-neutral-dark/70">
        Przeglądaj materiały edukacyjne z Przestrzeni Zdrowej Kobiety
      </p>
    </header>
  )
}
