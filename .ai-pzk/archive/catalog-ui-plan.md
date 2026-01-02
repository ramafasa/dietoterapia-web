# Plan implementacji widoku Katalog PZK

## 1. Przegląd

Widok **Katalog PZK** prezentuje hierarchię **Moduł → Kategoria → Materiały** dla pacjenta, umożliwiając:

- szybkie przełączenie pomiędzy modułami (1/2/3),
- przegląd kategorii w stałej kolejności,
- wejście do szczegółów **tylko** dla materiałów dostępnych (`published` + `isActionable=true`),
- zobaczenie materiałów zablokowanych jako **preview + kłódka + CTA zakupu** (bez linku do szczegółów),
- zobaczenie materiałów `publish_soon` jako widocznych, ale wyszarzonych i bez akcji.

Źródłem danych jest endpoint **GET** `/api/pzk/catalog`, który zwraca już policzone pola `isLocked`, `isActionable` i `ctaUrl`, oraz listy posortowane (kategorie `displayOrder ASC`, materiały `order ASC`).

## 2. Routing widoku

### 2.1. Ścieżki

- **Wejście (gating)**: `/pacjent/pzk` (już istnieje w repo).
  - Pacjent z aktywnym dostępem → redirect do `/pacjent/pzk/katalog`
  - Pacjent bez dostępu lub niezalogowany → redirect do `/pzk/kup`
  - Dietetyk → 403 (bez wycieku danych)

- **Nowy widok katalogu**: `/pacjent/pzk/katalog`
  - Implementacja jako strona Astro: `src/pages/pacjent/pzk/katalog.astro` (nowy plik).

### 2.2. Istotne ograniczenie bezpieczeństwa (middleware)

W `src/middleware/rbac.ts` jest wyjątek `url.pathname.startsWith('/pacjent/pzk')`, co oznacza, że **cały prefiks** `/pacjent/pzk/*` omija standardowy RBAC. Dlatego:

- strona `/pacjent/pzk/katalog` **musi** sama wykonać check: `locals.user` + `role === 'patient'` + `PzkAccessService.getAccessSummary().hasAnyActiveAccess`,
- alternatywnie (rekomendowane), zawęzić wyjątek w middleware tylko do `/pacjent/pzk` (entry-gate), a pozostałe `/pacjent/pzk/**` zostawić pod standardową ochroną.

## 3. Struktura komponentów

### 3.1. Proponowana implementacja (spójna z resztą aplikacji)

- Strona Astro renderuje layout i wstrzykuje React view przez `client:load` (jak `WeightDashboard`).
- React view ładuje katalog przez `fetch('/api/pzk/catalog')` w custom hooku.

### 3.2. Drzewo komponentów (wysoki poziom)

```
src/pages/pacjent/pzk/katalog.astro
└─ <Layout>
   └─ <PzkCatalogPage client:load initialSelectedModule?>
      ├─ <PzkInternalNav />                      (linki: Katalog, Recenzje)
      ├─ <PzkCatalogHeader />                    (tytuł + opis)
      ├─ <PzkModuleSelector />                   (tabs/segmented)
      └─ <PzkModulePanel />                      (dla wybranego modułu)
         └─ <PzkCategoryAccordionList />
            ├─ <PzkCategoryAccordionItem />      (N razy)
            │  ├─ <PzkCategoryHeaderButton />
            │  └─ <PzkMaterialList />
            │     ├─ <PzkMaterialRow />          (N razy)
            │     └─ <PzkEmptyCategoryState />   (gdy brak materiałów)
            └─ <PzkCatalogFooterHint />          (opcjonalnie: krótkie wyjaśnienie lock/soon)
```

## 4. Szczegóły komponentów

Poniżej komponenty opisane w sposób „wdrożeniowy”: co renderują, jakie mają propsy, jakie zdarzenia obsługują, jakie warunki walidują (zgodnie z API) i jakie typy wykorzystują.

### 4.1. `src/pages/pacjent/pzk/katalog.astro` (strona Astro)

- **Opis**: SSR-bramka dla samego katalogu (nie tylko entry). Renderuje `<Layout>` i mountuje React view.
- **Główne elementy**:
  - `<Layout title="Przestrzeń Zdrowej Kobiety — Katalog">`
  - `<PzkCatalogPage client:load initialSelectedModule={...} />`
- **Obsługiwane zdarzenia**: brak (SSR).
- **Walidacja/warunki (must-have)**:
  - jeśli `!Astro.locals.user` → redirect `/logowanie` (lub `/pzk/kup`, jeśli chcecie zachować UX „public landing”),
  - jeśli `user.role !== 'patient'` → 403 lub redirect (zgodnie z polityką PZK),
  - jeśli `PzkAccessService.getAccessSummary(user.id).hasAnyActiveAccess === false` → redirect `/pzk/kup`.
- **Typy**:
  - korzysta z `Astro.locals.user` (Lucia),
  - opcjonalnie: `PzkAccessSummary` (server-side).
- **Props (do React)**:
  - `initialSelectedModule?: PzkModuleNumber` (wyliczane z access summary: preferuj pierwszy aktywny moduł, inaczej 1).

### 4.2. `PzkCatalogPage` (React, główny kontener widoku)

- **Opis**: Łączy pobranie danych i render UI (nawigacja PZK + selektor modułu + akordeon kategorii).
- **Główne elementy HTML**:
  - wrapper: `<div className="min-h-screen bg-neutral-light">`
  - container: `<div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">`
- **Obsługiwane zdarzenia**:
  - start ładowania przy mount (hook),
  - retry (np. przycisk „Spróbuj ponownie”),
  - zmiana modułu,
  - rozwijanie kategorii.
- **Walidacja/warunki**:
  - jeśli API zwróci 401 → pokazać komunikat + CTA „Zaloguj się ponownie” (lub automatyczny redirect),
  - jeśli 403 → komunikat „Brak dostępu” (bez ujawniania szczegółów),
  - jeśli `data === null` → traktować jako błąd kontraktu i pokazać „Wystąpił błąd”.
- **Typy**:
  - DTO: `ApiResponse<PzkCatalog>`
  - VM: `PzkCatalogVM`, `PzkCatalogErrorVM`
- **Props**:
  - `initialSelectedModule?: PzkModuleNumber`

### 4.3. `PzkInternalNav` (nawigacja wewnętrzna PZK)

- **Opis**: Proste linki wewnątrz obszaru PZK.
- **Główne elementy**:
  - `<nav aria-label="Nawigacja PZK">`
  - linki `<a href="/pacjent/pzk/katalog">Katalog</a>`, `<a href="/pacjent/pzk/recenzje">Recenzje</a>`
- **Obsługiwane zdarzenia**: standardowa nawigacja.
- **Walidacja/warunki**:
  - aktywny stan linku na podstawie `window.location.pathname` lub przekazanej wartości.
- **Typy**:
  - VM: `PzkInternalNavVM` (opcjonalnie)
- **Props**:
  - `active: 'catalog' | 'reviews'`

### 4.4. `PzkModuleSelector` (tabs/segmented control)

- **Opis**: Przełącznik modułów 1/2/3. Pokazuje czy moduł jest aktywny (`isActive`) i ustawia wybrany moduł.
- **Główne elementy**:
  - `role="tablist"` na kontenerze,
  - przyciski `role="tab"`:
    - label: „Moduł 1”, „Moduł 2”, „Moduł 3”
    - badge „Aktywny” dla `isActive=true` (opcjonalnie)
- **Obsługiwane zdarzenia**:
  - `onClick(module)` → `onChange(module)`
  - `onKeyDown`:
    - `ArrowLeft/ArrowRight` przestawia fokus między tabami,
    - `Enter/Space` aktywuje zaznaczenie,
    - `Home/End` fokus na pierwszy/ostatni tab (opcjonalnie).
- **Walidacja/warunki (zgodnie z API)**:
  - moduły pochodzą z `catalog.modules` (jeśli API zwróci mniej, UI ma nadal działać),
  - selected module musi być jedną z dostępnych wartości `1|2|3`.
- **Typy**:
  - DTO: `PzkCatalogModule`
  - VM: `PzkModuleTabVM` (np. label, isActive, isSelected)
- **Props**:
  - `modules: PzkCatalogModule[]` lub `PzkModuleTabVM[]`
  - `selected: PzkModuleNumber`
  - `onChange: (module: PzkModuleNumber) => void`

### 4.5. `PzkModulePanel` (panel dla wybranego modułu)

- **Opis**: Renderuje kategorie dla wybranego modułu i akordeon.
- **Główne elementy**:
  - `<section aria-label={`Moduł ${selected}`}>`
  - `<PzkCategoryAccordionList categories={...} />`
- **Obsługiwane zdarzenia**:
  - przekazuje do listy toggle kategorii.
- **Walidacja/warunki**:
  - kategorie powinny być w kolejności `displayOrder ASC` (jeśli nie ufamy w 100% API, sortujemy po stronie klienta jako „defense in depth”).
- **Typy**:
  - DTO: `PzkCatalogCategory`
- **Props**:
  - `module: PzkCatalogModule`
  - `expandedCategoryIds: Set<string>`
  - `onToggleCategory: (categoryId: string) => void`

### 4.6. `PzkCategoryAccordionList` (lista akordeonu)

- **Opis**: Renderuje wszystkie kategorie jako akordeon A11y.
- **Główne elementy**:
  - `<div className="space-y-3">`
  - itemy: `<PzkCategoryAccordionItem />`
- **Obsługiwane zdarzenia**:
  - delegacja toggle dla itemów.
- **Walidacja/warunki**:
  - każda kategoria musi mieć stabilne `id` do `aria-controls` i do stanu `expandedCategoryIds`.
- **Typy**:
  - DTO: `PzkCatalogCategory`
- **Props**:
  - `categories: PzkCatalogCategory[]`
  - `expandedCategoryIds: Set<string>`
  - `onToggle: (categoryId: string) => void`

### 4.7. `PzkCategoryAccordionItem` (pojedyncza kategoria)

- **Opis**: Przycisk nagłówka kategorii + panel z listą materiałów (lub empty state).
- **Główne elementy (A11y)**:
  - nagłówek jako `<button>`:
    - `aria-expanded={isExpanded}`
    - `aria-controls={panelId}`
    - `id={buttonId}`
  - panel jako `<div role="region">`:
    - `id={panelId}`
    - `aria-labelledby={buttonId}`
    - ukrywanie: CSS + warunkowy render (ważne dla SR: preferuj warunkowy render panelu przy `!isExpanded`).
- **Obsługiwane zdarzenia**:
  - `onClick` nagłówka → toggle,
  - `onKeyDown`:
    - `Enter/Space` toggle (automatyczne na `<button>`),
    - (opcjonalnie) `ArrowUp/ArrowDown` przechodzenie po nagłówkach.
- **Walidacja/warunki**:
  - materiały w panelu muszą być w kolejności `order ASC` (defense-in-depth sort),
  - jeśli `materials.length === 0` → render `PzkEmptyCategoryState`.
- **Typy**:
  - DTO: `PzkCatalogCategory`, `PzkCatalogMaterial`
- **Props**:
  - `category: PzkCatalogCategory`
  - `isExpanded: boolean`
  - `onToggle: () => void`

### 4.8. `PzkMaterialRow` (wiersz materiału)

- **Opis**: Prezentuje materiał w jednym z 3 stanów:
  1) **Dostępny**: `status==='published' && isActionable===true`  
  2) **Zablokowany**: `status==='published' && isLocked===true && isActionable===false`  
  3) **Dostępny wkrótce**: `status==='publish_soon'` (zawsze locked, zawsze nie-actionable)
- **Główne elementy**:
  - wrapper: `<article className="... rounded-xl border ...">`
  - tytuł + opis,
  - ikony/badges: `hasPdf`, `hasVideos`, status,
  - akcja:
    - dostępny: `<a href={`/pacjent/pzk/material/${id}`}>Otwórz</a>`
    - zablokowany: `<a href={ctaUrl} target="_blank" rel="noopener noreferrer">Kup moduł X</a>`
    - publish_soon: brak CTA (lub disabled chip „Wkrótce”).
- **Obsługiwane zdarzenia**:
  - click „Otwórz” → nawigacja do szczegółów,
  - click „Kup…” → otwarcie w nowej karcie,
  - (opcjonalnie) click na cały wiersz (tylko w stanie dostępnym).
- **Walidacja/warunki (zgodnie z API)**:
  - jeśli `isActionable === false`, **nie renderować linku** do szczegółów (zapobiega „kliknięciu mimo disabled” oraz spełnia wymóg bezpieczeństwa),
  - CTA:
    - używać `ctaUrl` z API; jeśli `ctaUrl === null` dla locked (edge-case) → fallback: `buildPurchaseUrl(module)` z `@/lib/pzk/config`,
    - walidować, że CTA jest `http/https` (bezpieczny fallback do `buildPurchaseUrl`).
- **Typy**:
  - DTO: `PzkCatalogMaterial`, `PzkModuleNumber`, `PzkMaterialStatus`
  - VM: `PzkMaterialRowVM` (rekomendowane dla uproszczenia renderu)
- **Props**:
  - `module: PzkModuleNumber`
  - `material: PzkCatalogMaterial` (lub `PzkMaterialRowVM`)

### 4.9. `PzkEmptyCategoryState`

- **Opis**: Komunikat „Brak materiałów w tej kategorii”.
- **Główne elementy**:
  - `<div className="bg-neutral-light/60 rounded-xl p-4 text-center">...`
- **Obsługiwane zdarzenia**: brak.
- **Walidacja/warunki**: render tylko gdy `materials.length === 0`.
- **Typy**: brak lub `categoryLabel: string`.
- **Props**:
  - `categoryLabel: string`

### 4.10. `PzkCatalogLoadingState` (skeleton)

- **Opis**: Skeleton UI podczas pobierania danych z API.
- **Główne elementy**:
  - placeholder dla tabs,
  - kilka kart kategorii i 2–3 wiersze materiału jako `animate-pulse`.
- **Obsługiwane zdarzenia**: brak.
- **Walidacja/warunki**: render gdy `isLoading === true`.
- **Props**: opcjonalnie `rows?: number`.

### 4.11. `PzkCatalogErrorState`

- **Opis**: Bezpieczny komunikat błędu + retry.
- **Główne elementy**:
  - `Alert` (`src/components/Alert.tsx`) z wariantem `error`,
  - przycisk retry (może być `Alert` action).
- **Obsługiwane zdarzenia**:
  - `onRetry()` wywołuje `reload()` z hooka.
- **Walidacja/warunki**:
  - komunikaty zależne od statusu HTTP:
    - 401: „Sesja wygasła. Zaloguj się ponownie.”
    - 403: „Brak dostępu.”
    - 400: „Nieprawidłowe parametry.”
    - 500: „Wystąpił błąd. Spróbuj ponownie.”
- **Typy**:
  - VM: `PzkCatalogErrorVM` (np. `message`, `kind`, `statusCode?`)
- **Props**:
  - `error: PzkCatalogErrorVM`
  - `onRetry: () => void`

## 5. Typy

### 5.1. DTO (już istniejące)

Wykorzystujemy typy z `src/types/pzk-dto.ts`:

- `ApiResponse<T>` (envelope)
- `PzkCatalog`
- `PzkCatalogModule`
- `PzkCatalogCategory`
- `PzkCatalogMaterial`
- `PzkModuleNumber` (`1|2|3`)
- `PzkMaterialStatus` (`draft | published | archived | publish_soon`)
- (konfig) `PzkPurchaseCta` oraz helper `buildPurchaseUrl()` z `src/lib/pzk/config.ts`

### 5.2. Nowe typy ViewModel (rekomendowane)

Cel: uprościć renderowanie i skondensować reguły UI w jednym miejscu (mapowanie DTO → VM).

#### `PzkCatalogVM`

- `purchaseCta: PzkPurchaseCta` (z API; przydaje się do fallbacków/telemetrii UI)
- `modules: PzkCatalogModuleVM[]`

#### `PzkCatalogModuleVM`

- `module: PzkModuleNumber`
- `label: string` (np. „Moduł 1”)
- `isActive: boolean`
- `categories: PzkCatalogCategoryVM[]`

#### `PzkCatalogCategoryVM`

- `id: string`
- `slug: string`
- `label: string`
- `description: string | null`
- `displayOrder: number`
- `materials: PzkMaterialRowVM[]`
- `isEmpty: boolean` (computed: `materials.length === 0`)

#### `PzkMaterialRowVM`

- `id: string`
- `title: string`
- `description: string | null`
- `order: number`
- `status: 'published' | 'publish_soon'`
- `hasPdf: boolean`
- `hasVideos: boolean`
- `variant: 'available' | 'locked' | 'soon'`
- `primaryAction`:
  - `{ type: 'link'; href: string; label: string }` (dla available)
  - `{ type: 'cta'; href: string; label: string; isExternal: true }` (dla locked)
  - `{ type: 'none' }` (dla soon)
- `aria` (opcjonalnie):
  - `statusLabel: string` (np. „Zablokowany”, „Dostępny”, „Dostępny wkrótce”)

#### `PzkCatalogErrorVM`

- `kind: 'unauthorized' | 'forbidden' | 'validation' | 'server' | 'network' | 'unknown'`
- `message: string`
- `statusCode?: number`
- `retryable: boolean`

## 6. Zarządzanie stanem

### 6.1. Stan widoku (w `PzkCatalogPage`)

- `catalog: PzkCatalogVM | null`
- `isLoading: boolean`
- `error: PzkCatalogErrorVM | null`
- `selectedModule: PzkModuleNumber`
  - inicjalizacja: z props `initialSelectedModule`, a jeśli brak:
    - preferuj pierwszy `module.isActive === true` z API,
    - fallback: `1`
- `expandedCategoryIds: Set<string>`
  - inicjalizacja: pusta (wszystko zwinięte),
  - opcjonalnie: auto-open pierwszej kategorii po załadowaniu (UX).

### 6.2. Custom hook (rekomendowane): `usePzkCatalog()`

Lokalizacja: `src/hooks/pzk/usePzkCatalog.ts` (nowy).

Zakres:

- pobranie danych z `GET /api/pzk/catalog`,
- AbortController (jak w `useWeightHistory`),
- parsowanie błędów z envelope `ApiResponse`,
- mapowanie DTO → VM (lub zwracanie DTO i mapowanie w komponencie).

API hooka (przykład):

- `usePzkCatalog(options?: { modules?: PzkModuleNumber[]; includeStatuses?: ('published'|'publish_soon')[]; locale?: string })`
- zwraca:
  - `catalog: PzkCatalogVM | null`
  - `isLoading: boolean`
  - `error: PzkCatalogErrorVM | null`
  - `reload: () => Promise<void>`

### 6.3. Synchronizacja z URL (opcjonalnie, ale praktyczne)

Hook `usePzkSelectedModuleInUrl`:

- czyta `?module=1|2|3` przy inicjalizacji,
- przy zmianie modułu aktualizuje URL przez `history.replaceState` (bez reload),
- ułatwia linkowanie do konkretnego modułu i powrót po refreshu.

## 7. Integracja API

### 7.1. Endpoint

- Metoda: `GET`
- URL: `/api/pzk/catalog`
- Query (opcjonalnie):
  - `modules`: `"1,2,3"`
  - `includeStatuses`: `"published,publish_soon"`
  - `locale`: np. `"pl"`

### 7.2. Typy żądania i odpowiedzi

- Request: brak body.
- Response:
  - `200`: `ApiResponse<PzkCatalog>` z `data !== null`,
  - `401/403/400/500`: `ApiResponse<null>` z `error !== null`.

### 7.3. Mapowanie na akcje frontendowe

- `mount` → `usePzkCatalog().reload()` automatycznie
- `retry` → `reload()`
- `select module` → tylko zmiana stanu UI (bez ponownego fetcha), bo katalog zawiera wszystkie moduły (domyślnie).

### 7.4. Parsowanie błędów (kontrakt PZK)

Rekomendowana logika w hooku:

- jeśli `!response.ok`:
  - spróbuj `await response.json()` i odczytaj `error.message`,
  - fallback: generyczny komunikat.
- jeśli `response.ok`:
  - sprawdź, czy `body.data` istnieje; jeśli nie → błąd kontraktu.

## 8. Interakcje użytkownika

### 8.1. Wybór modułu (US-002)

- klik w tab modułu:
  - aktualizuje `selectedModule`,
  - przenosi fokus zgodnie z A11y tabs (roving tabindex),
  - (opcjonalnie) przewija do listy kategorii.

### 8.2. Rozwijanie kategorii (US-003)

- klik w nagłówek kategorii:
  - toggle `expandedCategoryIds` (add/remove),
  - panel rozwija się/zwija bez utraty stanu modułu.

### 8.3. Interakcje z materiałem (US-004..006)

- dostępny (`isActionable=true`):
  - klik „Otwórz” (lub klik w cały wiersz) → przejście do `/pacjent/pzk/material/{id}`
- zablokowany (`published` + brak dostępu):
  - brak linku do szczegółów,
  - klik CTA → nowa karta `target="_blank"` do `ctaUrl`
- `publish_soon`:
  - brak akcji (wszystko disabled),
  - czytelny komunikat „Dostępny wkrótce”.

## 9. Warunki i walidacja

### 9.1. Warunki wynikające z API (muszą być przestrzegane w UI)

- **Widoczność**:
  - UI zakłada, że API zwraca wyłącznie materiały `published` i `publish_soon`.
  - UI nie powinno próbować obsługi `draft/archived` w katalogu (ale powinno być odporne, jeśli pojawią się przez błąd danych: traktuj jak `soon` i bez akcji).

- **Dostępność akcji**:
  - `published`:
    - `isActionable=true` → render link do szczegółów,
    - `isActionable=false` → nie renderować linku; pokazać lock + CTA
  - `publish_soon`:
    - zawsze `isLocked=true`, `isActionable=false` → brak linku i brak CTA (tylko status)

- **CTA**:
  - dla materiałów zablokowanych `ctaUrl` powinien istnieć,
  - UI musi otwierać CTA w nowej karcie (`target="_blank"`, `rel="noopener noreferrer"`),
  - w razie braku `ctaUrl` stosować fallback do `buildPurchaseUrl(module)`.

### 9.2. Sortowanie

- Kategoria: sort po `displayOrder ASC` (defense-in-depth w UI).
- Materiały: sort po `order ASC` (defense-in-depth w UI).

## 10. Obsługa błędów

### 10.1. Scenariusze błędów i rekomendowana reakcja UI

- **Network error / timeout / abort**:
  - pokaż `PzkCatalogErrorState` z retry.

- **401 Unauthorized**:
  - komunikat: „Sesja wygasła. Zaloguj się ponownie.”
  - CTA: link `/logowanie` lub automatyczny redirect po kliknięciu.

- **403 Forbidden** (np. dietetyk lub błędna rola):
  - komunikat: „Brak dostępu.”
  - CTA: link `/` lub `/pzk/kup` (zależnie od decyzji UX).

- **400 Validation error** (np. błędne query paramy):
  - komunikat: „Nieprawidłowe parametry widoku. Odśwież stronę.”
  - CTA: „Odśwież”.

- **500 Internal Server Error**:
  - komunikat: „Wystąpił błąd. Spróbuj ponownie.”
  - CTA: retry.

### 10.2. Utrzymanie bezpieczeństwa komunikatów

- Nie wyświetlać szczegółów technicznych (stack trace, detale storage itp.).
- Dla 403/404 nie sugerować istnienia materiałów „ukrytych”.

## 11. Kroki implementacji

1. **Dodać stronę katalogu**:
   - utworzyć `src/pages/pacjent/pzk/katalog.astro`,
   - wykonać SSR check: user/rola + aktywny dostęp (jak w `/pacjent/pzk/index.astro`).

2. **Dodać główny komponent React widoku**:
   - `src/components/pzk/catalog/PzkCatalogPage.tsx` (nowy),
   - użyć `client:load` z poziomu strony Astro.

3. **Dodać hook do pobierania danych**:
   - `src/hooks/pzk/usePzkCatalog.ts` (nowy),
   - wzorować się na `src/hooks/useWeightHistory.ts` (AbortController, `isMountedRef`, `isLoading`, `error`, `reload`).

4. **Zaimplementować komponenty UI**:
   - `PzkInternalNav`
   - `PzkModuleSelector` (tabs A11y)
   - `PzkCategoryAccordionList` + `PzkCategoryAccordionItem` (akordeon A11y)
   - `PzkMaterialRow` (3 stany: available/locked/soon)
   - `PzkCatalogLoadingState`, `PzkCatalogErrorState`, `PzkEmptyCategoryState`

5. **Dodać mapowanie DTO → VM**:
   - helper `mapPzkCatalogToVm(dto: PzkCatalog): PzkCatalogVM`,
   - helper `mapPzkError(...) => PzkCatalogErrorVM`.

6. **Dodać atrybuty testowe (E2E)**:
   - `data-testid` dla kluczowych elementów:
     - `pzk-catalog-module-tab-1/2/3`
     - `pzk-category-accordion-{categoryId}`
     - `pzk-material-row-{materialId}`
     - `pzk-material-open-{materialId}`
     - `pzk-material-cta-{materialId}`
     - `pzk-catalog-retry`

7. **(Rekomendowane) uporządkować RBAC**:
   - zawęzić wyjątek w `src/middleware/rbac.ts` tak, aby dotyczył wyłącznie `/pacjent/pzk` (entry gate),
   - zostawić `/pacjent/pzk/katalog` pod standardową ochroną (mniej ryzyka przypadkowego „publicznego” routingu).

8. **Weryfikacja manualna wg kryteriów akceptacji**:
   - US-002: tabs działają myszą i klawiaturą, widać wybrany moduł,
   - US-003: kategorie w stałej kolejności, akordeon A11y, empty state,
   - US-004: materiały w `order ASC`, tytuł + opis,
   - US-005: zablokowane mają kłódkę i brak linku do szczegółów,
   - US-006: CTA otwiera nową kartę z poprawnym URL.


