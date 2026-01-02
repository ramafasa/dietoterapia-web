# Plan implementacji widoku Landing zakupu PZK (publiczny)

## 1. Przegląd

Widok **Landing zakupu PZK** (`/pzk/kup`) to w pełni publiczna strona marketingowa, której celem jest:
- przedstawienie oferty PZK (moduły 1/2/3) w czytelnej, przewidywalnej strukturze,
- umożliwienie przejścia do zakupu poza aplikacją poprzez **zewnętrzne CTA otwierane w nowej karcie**,
- (opcjonalnie) ułatwienie przejścia do logowania / rejestracji (rejestracja tylko przez zaproszenie).

Widok **nie pobiera żadnych danych chronionych** i nie wymaga autoryzacji. Powinien być implementowany SSR‑first w Astro (bez hydratacji), zgodnie z istniejącym design systemem (Tailwind, `Layout.astro`).

## 2. Routing widoku

- **Ścieżka**: `/pzk/kup`
- **Plik routingu (Astro)**: `src/pages/pzk/kup.astro`
- **Layout**: `src/layouts/Layout.astro` (SEO: title/description/OG/canonical już obsługiwane przez layout)

Uwagi:
- Strona ma być dostępna niezależnie od feature flag `FF_STREFA_PACJENTA` (public).
- Link „Zaloguj się” powinien być renderowany **warunkowo** (patrz sekcja „Warunki i walidacja”), ponieważ `/logowanie` jest ukryte za `FF_STREFA_PACJENTA`.

## 3. Struktura komponentów

Widok powinien być złożony z prostych komponentów Astro (bez React), aby zachować minimalny JS i szybkie SSR.

Proponowane pliki:
- `src/pages/pzk/kup.astro` – strona (kompozycja sekcji)
- `src/components/pzk/PzkPurchaseHero.astro` – hero + opis
- `src/components/pzk/PzkPurchaseModules.astro` – karty modułów + CTA
- `src/components/pzk/PzkPurchaseCtaBar.astro` – sekcja CTA + link do logowania/rejestracji (opcjonalnie)
- `src/components/pzk/PzkPurchaseFaq.astro` – (opcjonalnie) mini FAQ, jeśli potrzebne UX‑owo

## 4. Szczegóły komponentów

### `PzkPurchasePage` (Astro page) – `src/pages/pzk/kup.astro`

- **Opis komponentu**: Strona główna widoku; odpowiada za SEO, kompozycję sekcji oraz przekazanie konfiguracji linków CTA do sekcji potomnych.
- **Główne elementy**:
  - `<Layout title=... description=...>`
  - `<main>` z tłem `bg-neutral-light` (jak w innych publicznych stronach)
  - Sekcje: hero → moduły → CTA → (opcjonalnie) FAQ
- **Obsługiwane zdarzenia**: brak (czysty SSR; linki standardowe).
- **Warunki walidacji (frontend)**:
  - Budowanie URL zakupu: tylko jeśli skonfigurowano `baseUrl` (env/config).
  - Link loginu: renderuj tylko gdy `FF_STREFA_PACJENTA === true` (żeby nie prowadzić do 404).
  - Link rejestracji: jeżeli pokazywany, musi jasno komunikować „rejestracja tylko z zaproszeniem” i prowadzić do ścieżki `/auth/signup` (wymaga query param `token`, więc domyślnie lepiej dać CTA „Poproś o zaproszenie” → `/kontakt`).
- **Typy**:
  - `PzkPurchaseLandingVM` (ViewModel – patrz sekcja „Typy”)
- **Propsy**: brak (to strona routingu).

### `PzkPurchaseHero` – `src/components/pzk/PzkPurchaseHero.astro`

- **Opis komponentu**: Sekcja hero z nazwą programu, krótkim opisem i głównym CTA (np. „Kup dostęp do PZK” albo „Zobacz moduły” – anchor do sekcji modułów).
- **Główne elementy**:
  - `<section class="section">`
  - `<div class="container-custom">`
  - `<h1>`: tytuł „Przestrzeń Zdrowej Kobiety”
  - `<p>`: streszczenie wartości + co jest w środku (PDF, wideo, notatki)
  - `<a>` primary CTA:
    - wariant A: `href="#moduly"` (wewnętrzne przejście)
    - wariant B: jeśli posiadamy sensowny „globalny” zakup bez modułu, `target="_blank"`
- **Obsługiwane zdarzenia**: klik w CTA (link).
- **Warunki walidacji (frontend)**:
  - Jeśli CTA jest zewnętrzne: zawsze `target="_blank"` i `rel="noopener noreferrer"`.
- **Typy**:
  - `PzkPurchaseHeroVM` (opcjonalnie; jeśli teksty będą konfigurowalne)
- **Propsy**:
  - `title: string`
  - `lead: string`
  - `primaryCta: { label: string; href: string; isExternal: boolean }`

### `PzkPurchaseModules` – `src/components/pzk/PzkPurchaseModules.astro`

- **Opis komponentu**: Prezentuje moduły 1/2/3 jako karty z krótkim opisem i CTA „Kup moduł X”.
- **Główne elementy**:
  - `<section id="moduly" class="section">`
  - `<div class="container-custom">`
  - `<h2>`: „Wybierz moduł”
  - `<div class="grid ...">` z 3 kartami
  - Każda karta:
    - nazwa modułu (np. „Moduł 1”)
    - lista elementów (co zawiera)
    - przycisk/link CTA (zewnętrzny)
- **Obsługiwane zdarzenia**: klik w CTA modułu (zewnętrzny link).
- **Warunki walidacji (frontend)**:
  - `module` musi być jedną z wartości: `1 | 2 | 3`.
  - `ctaUrl` musi być poprawnie zbudowany: `baseUrl + ?{paramName}={module}` (z zachowaniem istniejących query params w `baseUrl`).
  - CTA musi otwierać się w nowej karcie: `target="_blank" rel="noopener noreferrer"`.
  - Jeśli `ctaUrl` jest `null` (brak konfiguracji): pokaż fallback CTA do `/kontakt` lub komunikat „Zakup chwilowo niedostępny”.
- **Typy**:
  - `PzkPurchaseModuleCardVM`
  - `PzkPurchaseCtaConfig` (lub reuse `PzkPurchaseCta` z `src/types/pzk-dto.ts`)
- **Propsy**:
  - `modules: PzkPurchaseModuleCardVM[]`
  - `cta: PzkPurchaseCtaConfig`
  - `fallbackContactHref?: string` (np. `/kontakt`)

### `PzkPurchaseCtaBar` – `src/components/pzk/PzkPurchaseCtaBar.astro`

- **Opis komponentu**: Sekcja domykająca z dodatkowym CTA i linkiem do logowania / informacji o rejestracji.
- **Główne elementy**:
  - `<section class="section">`
  - `<div class="container-custom card">` (lub podobny styl)
  - `<h2>`: „Masz już dostęp?”
  - CTA „Przejdź do PZK” → `/pacjent/pzk` (to jest bramka/gating; bezpieczne nawet bez dostępu)
  - Link „Zaloguj się” → `/logowanie` (tylko gdy `FF_STREFA_PACJENTA` włączone)
  - Link „Nie masz konta? Poproś o zaproszenie” → `/kontakt`
- **Obsługiwane zdarzenia**: klik w linki.
- **Warunki walidacji (frontend)**:
  - Renderuj link do `/logowanie` wyłącznie gdy `isFeatureEnabled('STREFA_PACJENTA') === true`.
- **Typy**:
  - `PzkPurchaseCtaBarVM` (opcjonalnie; jeśli copy/CTA konfigurowalne)
- **Propsy**:
  - `showLoginLink: boolean`
  - `loginHref: string` (domyślnie `/logowanie`)
  - `patientGateHref: string` (domyślnie `/pacjent/pzk`)
  - `contactHref: string` (domyślnie `/kontakt`)

### `PzkPurchaseFaq` (opcjonalnie) – `src/components/pzk/PzkPurchaseFaq.astro`

- **Opis komponentu**: Minimalne FAQ dla redukcji wątpliwości (np. „Czy muszę mieć konto?”, „Jak długo mam dostęp?”, „Jak działa pobieranie PDF?”).
- **Główne elementy**:
  - `<section class="section">`
  - Semantycznie poprawny akordeon: `button` + `aria-expanded` + `aria-controls`
- **Obsługiwane zdarzenia**: otwieranie/zamykanie pytań (można zrobić bez JS jako `<details><summary>...`).
- **Warunki walidacji**: brak.
- **Typy**:
  - `PzkFaqItemVM[]`
- **Propsy**:
  - `items: PzkFaqItemVM[]`

## 5. Typy

Ten widok nie korzysta bezpośrednio z API PZK, ale warto zastosować spójne nazewnictwo typów oraz (tam gdzie ma sens) reuse DTO.

### DTO (istniejące; do ewentualnego reuse)

- `PzkModuleNumber` (z `src/types/pzk-dto.ts`): `1 | 2 | 3`
- `PzkPurchaseCta` (z `src/types/pzk-dto.ts`):
  - `baseUrl: string`
  - `paramName: string`

### Nowe typy ViewModel (propozycja)

- `PzkPurchaseCtaConfig`
  - **Cel**: konfiguruje budowę linku zakupu.
  - Pola:
    - `baseUrl: string` – bazowy URL zewnętrznego landingu
    - `paramName: string` – nazwa parametru (domyślnie `"module"`)

- `PzkPurchaseModuleCardVM`
  - **Cel**: dane do renderu jednej karty modułu.
  - Pola:
    - `module: PzkModuleNumber`
    - `title: string` (np. „Moduł 1”)
    - `subtitle?: string` (opcjonalnie)
    - `bullets: string[]` (lista korzyści / zawartości)
    - `ctaLabel: string` (np. „Kup moduł 1”)
    - `ctaUrl: string | null` (zbudowane na bazie `PzkPurchaseCtaConfig`)

- `PzkPurchaseLandingVM`
  - **Cel**: model całej strony (jeśli chcemy utrzymać copy w jednym miejscu).
  - Pola:
    - `seo: { title: string; description: string }`
    - `hero: { title: string; lead: string; primaryCta: { label: string; href: string; isExternal: boolean } }`
    - `modules: PzkPurchaseModuleCardVM[]`
    - `ctaBar: { showLoginLink: boolean }`
    - `faq?: PzkFaqItemVM[]`

- `PzkFaqItemVM` (opcjonalnie)
  - `id: string`
  - `question: string`
  - `answerMd: string` (albo `answer: string` jeśli bez markdown)

## 6. Zarządzanie stanem

Widok jest w założeniu **statyczny** (SSR) i nie wymaga Reactowego stanu.

Minimalny „stan” po stronie serwera:
- `showLoginLink: boolean` – wynik `isFeatureEnabled('STREFA_PACJENTA')`.

Nie przewiduje się custom hooków. Jeśli w przyszłości dojdzie telemetria kliknięć, wtedy:
- tylko lekkie eventy (np. GA4), bez blokowania nawigacji.

## 7. Integracja API

Dla tego widoku: **brak wymaganych wywołań API**.

Powiązanie z kontraktami PZK:
- W PZK API istnieje DTO `PzkPurchaseCta` (z `src/types/pzk-dto.ts`) używany w katalogu (`GET /api/pzk/catalog`). Landing `/pzk/kup` powinien budować CTA **w identyczny sposób** (ten sam `baseUrl` i `paramName`), ale bez zależności od endpointu.

Konfiguracja (frontend/SSR):
- Źródło `baseUrl` i `paramName` powinno być utrzymywane w jednym miejscu (np. `src/lib/pzk/purchase-cta.ts`), aby backend i frontend nie rozjechały się w parametrach.
- Jeśli konfiguracja nie istnieje, UI ma przejść w stan fallback (CTA → `/kontakt`).

## 8. Interakcje użytkownika

- **Klik w „Kup moduł X”**:
  - otwiera zewnętrzny landing w nowej karcie,
  - URL zawiera parametr modułu (np. `?module=1`),
  - link ma `rel="noopener noreferrer"` (bezpieczeństwo).

- **Klik w „Przejdź do PZK”**:
  - prowadzi do `/pacjent/pzk` (wewnętrzny routing),
  - dalsze przekierowania/gating realizuje osobny widok bramki (poza tym planem).

- **Klik w „Zaloguj się”** (opcjonalnie):
  - prowadzi do `/logowanie`,
  - link jest dostępny tylko gdy strefa pacjenta jest włączona feature flagą.

- **Klik w „Poproś o zaproszenie”**:
  - prowadzi do `/kontakt`.

## 9. Warunki i walidacja

### Warunki wynikające z PRD / UI planu (frontend)

- **CTA zakupu w nowej karcie**:
  - Każde CTA zakupu musi mieć `target="_blank"` oraz `rel="noopener noreferrer"`.

- **Parametr modułu w CTA**:
  - Parametr musi być zgodny z PRD: przekazuje identyfikator modułu (1/2/3).
  - Budowanie URL musi obsłużyć sytuację, gdy `baseUrl` ma już query string (doklejanie parametru przez `URL` / `URLSearchParams`).

- **Brak danych chronionych**:
  - Widok nie może pokazywać żadnych danych z `Astro.locals.user` poza ewentualnym „masz konto? przejdź do PZK” (bez personalizacji).

### Walidacja konfiguracji (SSR)

- Jeśli `baseUrl` jest pusty / niezdefiniowany:
  - ukryj zewnętrzne CTA zakupu lub zamień je na CTA „Skontaktuj się” → `/kontakt`,
  - pokaż neutralny komunikat (bez szczegółów technicznych).

### Walidacja linku loginu (SSR)

- Jeśli `isFeatureEnabled('STREFA_PACJENTA') === false`:
  - **nie renderuj** linku do `/logowanie` (bo strona loginu zwróci 404).

## 10. Obsługa błędów

Ponieważ widok jest statyczny, typowe błędy to:

- **Brak konfiguracji URL zakupu**:
  - UI fallback: CTA do `/kontakt` + komunikat „Zakup chwilowo niedostępny”.

- **Błędny `baseUrl` (np. bez protokołu)**:
  - traktuj jak brak konfiguracji (fallback).
  - rekomendacja implementacyjna: walidować `baseUrl` przez `new URL(baseUrl)` w SSR i łapać wyjątek.

- **Feature flag wyłączony**:
  - nie pokazuj linku do logowania (uniknięcie 404).

## 11. Kroki implementacji

1. Utwórz routing: dodaj `src/pages/pzk/kup.astro` i podepnij `Layout.astro` z dedykowanym `title` i `description`.
2. Zdefiniuj źródło konfiguracji CTA:
   - dodaj małą funkcję/util (np. `getPzkPurchaseCtaConfig()`), która zwraca `baseUrl` i `paramName` (z env) lub `null` jeśli brak.
3. Zbuduj `PzkPurchaseLandingVM` w pliku strony (copy + lista modułów).
4. Wydziel sekcje do komponentów Astro:
   - `PzkPurchaseHero.astro`
   - `PzkPurchaseModules.astro`
   - `PzkPurchaseCtaBar.astro`
   - (opcjonalnie) `PzkPurchaseFaq.astro` na `<details>/<summary>` bez JS.
5. Zaimplementuj budowę `ctaUrl` dla modułów:
   - przez `URL`/`URLSearchParams`, z parametrem `module=1|2|3` (albo inną nazwą z `paramName`).
6. Dodaj A11y:
   - poprawna hierarchia nagłówków (`h1` → `h2`),
   - focus states (Tailwind, zgodne z istniejącymi przyciskami),
   - `rel="noopener noreferrer"` dla linków zewnętrznych,
   - jeśli używasz ikon: `aria-hidden="true"`.
7. Dodaj responsywny layout:
   - karty modułów w `grid` (1 kolumna mobile → 3 kolumny desktop),
   - przyciski pełnej szerokości na mobile.
8. Warunkowo renderuj link do logowania:
   - `showLoginLink = isFeatureEnabled('STREFA_PACJENTA')`.
9. Dodaj testy (rekomendowane):
   - Playwright: sprawdź, że `/pzk/kup` renderuje się publicznie i CTA ma `target="_blank"` + poprawny parametr modułu.
10. Przejrzyj SEO:
   - dopasuj `title/description` oraz ewentualny `ogImage` (jeśli dla PZK potrzebny osobny).


