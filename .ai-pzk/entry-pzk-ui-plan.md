# Plan implementacji widoku Wejście do PZK (gating) — `/pacjent/pzk`

## 1. Przegląd

Widok **Wejście do PZK (gating/redirect)** to bramka dostępu do obszaru PZK. Jego zadaniem jest:

- rozpoznanie kontekstu użytkownika (brak sesji / rola / dostęp do modułów),
- wykonanie wywołania **GET `/api/pzk/access`** dla pacjenta,
- przekierowanie do:
  - **katalogu PZK** (docelowo osobny route, np. `/pacjent/pzk/katalog`) jeśli pacjent ma **≥1 aktywny moduł**,
  - **landing zakupu** `/pzk/kup` jeśli pacjent nie ma aktywnego dostępu lub użytkownik jest niezalogowany,
  - ekran/odpowiedź **403** jeśli użytkownik jest dietetykiem.

Widok **nie może ujawniać** żadnych danych o materiałach/katalogu; operuje wyłącznie na “access summary”.

## 2. Routing widoku

- **Ścieżka**: `/pacjent/pzk`
- **Plik routingu (Astro)**: `src/pages/pacjent/pzk/index.astro` (do utworzenia)
- **Uwagi dot. istniejącego RBAC**:
  - obecnie `src/middleware/rbac.ts` wymusza:
    - niezalogowany na `/pacjent/*` → `/logowanie`,
    - dietetyk na `/pacjent/*` → `/dietetyk/dashboard`.
  - aby spełnić wymagania tego widoku, trzeba wprowadzić **wyjątek** dla `/pacjent/pzk` (szczegóły w sekcji “Kroki implementacji”).

## 3. Struktura komponentów

Widok jest “SSR-first”, z opcjonalnym minimalnym UI “Sprawdzam dostęp…”.

Proponowana struktura:

- `src/pages/pacjent/pzk/index.astro`
  - `Layout` (wspólny layout)
  - `PzkEntryGate` (lekki komponent React, opcjonalny, do pokazania stanu i obsługi retry)
    - albo: czysty SSR redirect bez hydratacji (gdy preferujemy maks. szybkość i prostotę)

## 4. Szczegóły komponentów

### `PacjentPzkEntryPage` (`src/pages/pacjent/pzk/index.astro`)

- **Opis komponentu**:
  - Strona bramki wejścia do PZK.
  - Odpowiada za decyzję: **403 / redirect do `/pzk/kup` / redirect do katalogu**.
  - Nie renderuje treści PZK — tylko (opcjonalnie) krótki komunikat.

- **Główne elementy**:
  - `<Layout ...>` jako wrapper.
  - `<main>` z krótką treścią (opcjonalnie), np.:
    - nagłówek “Sprawdzam dostęp…”
    - opis “To może potrwać chwilę”
    - fallback link “Przejdź do zakupu” i “Powtórz”

- **Obsługiwane zdarzenia**:
  - Brak bezpośrednich interakcji, jeśli wszystko jest SSR i działa.
  - Jeśli jest fallback UI:
    - klik “Spróbuj ponownie” (wywołuje ponownie logikę access check w komponencie React),
    - klik “Przejdź do strony zakupu” (nawigacja do `/pzk/kup`).

- **Warunki walidacji (zgodne z API / wymaganiami)**:
  - **Brak sesji** (brak `Astro.locals.user`):
    - **redirect** do `/pzk/kup`.
  - **Rola użytkownika**:
    - `dietitian` → ustaw status odpowiedzi na **403** i pokaż bezpieczny komunikat (bez danych).
    - `patient` → kontynuuj do wywołania `/api/pzk/access`.
  - **Integracja z `/api/pzk/access`** (dla pacjenta):
    - Jeśli HTTP 200 i `data.hasAnyActiveAccess === true` → **redirect** do katalogu PZK (rekomendowane: `/pacjent/pzk/katalog`).
    - Jeśli HTTP 200 i `data.hasAnyActiveAccess === false` → **redirect** do `/pzk/kup`.
    - Jeśli HTTP 401 → **redirect** do `/pzk/kup` (wymóg widoku).
    - Jeśli HTTP 403 → potraktuj jak stan niespójny (pacjent powinien go nie dostać), ale zachowaj bezpiecznie:
      - rekomendacja: pokaż komunikat “Brak dostępu” i link do `/pzk/kup`.
    - Jeśli HTTP 5xx / błąd sieci → pokaż fallback UI + retry.

- **Typy (DTO i ViewModel)**:
  - DTO:
    - `ApiResponse<PzkAccessSummary>` z `src/types/pzk-dto.ts`
    - `PzkAccessSummary`
  - ViewModel (lokalny, frontendowy) — jeśli renderujemy fallback UI:
    - `PzkEntryGateVM` (szczegóły w sekcji 5)

- **Propsy**:
  - Strona Astro nie przyjmuje propsów (routing page).
  - Jeśli używamy React komponentu:
    - przekazujemy mu minimalny config (np. docelowy URL katalogu).

### `PzkEntryGate` (`src/components/pzk/PzkEntryGate.tsx`) — opcjonalny

- **Opis komponentu**:
  - Minimalny komponent React, który:
    - pokazuje “Sprawdzam dostęp…”
    - wykonuje `fetch('/api/pzk/access')` po mount,
    - przekierowuje klienta do właściwej strony,
    - obsługuje błędy (retry / CTA do `/pzk/kup`).
  - Komponent jest opcjonalny — jeśli preferujesz czysty SSR redirect, można go pominąć.

- **Główne elementy**:
  - `<section>` z:
    - tytułem,
    - loaderem (np. prosty spinner CSS),
    - blokiem błędu (gdy wystąpi) + przyciski.

- **Obsługiwane zdarzenia**:
  - `onRetryClick` → ponowne wywołanie fetch.
  - `onGoToPurchaseClick` → `window.location.assign('/pzk/kup')`.

- **Warunki walidacji (zgodne z API)**:
  - Oparte o status HTTP i payload envelope:
    - HTTP 200 + `data?.hasAnyActiveAccess === true` → redirect do katalogu
    - HTTP 200 + `data?.hasAnyActiveAccess === false` → redirect do `/pzk/kup`
    - HTTP 401 → redirect do `/pzk/kup`
    - inne → pokaż błąd i retry

- **Typy**:
  - `ApiResponse<PzkAccessSummary>`
  - `PzkEntryGateState` (union, frontend)

- **Propsy (interfejs komponentu)**:
  - `catalogHref: string` — gdzie kierować pacjenta z dostępem (np. `/pacjent/pzk/katalog`)
  - `purchaseHref: string` — domyślnie `/pzk/kup`
  - `onForbiddenHref?: string` — opcjonalnie gdzie kierować, jeśli backend zwróci 403 (np. `/pzk/kup`)

## 5. Typy

### DTO wykorzystywane bezpośrednio

- **`PzkAccessSummary`** (`src/types/pzk-dto.ts`)
  - `hasAnyActiveAccess: boolean`
  - `activeModules: (1|2|3)[]`
  - `access: { module: 1|2|3; startAt: string; expiresAt: string }[]`
  - `serverTime: string`

- **`ApiResponse<T>`** (`src/types/pzk-dto.ts`)
  - `data: T | null`
  - `error: { code: string; message: string; details?: Record<string, unknown> } | null`

### Proponowane typy ViewModel (frontend-only)

> Te typy są użyteczne tylko wtedy, gdy widok ma fallback UI (komponent React lub SSR render błędu).

- **`PzkEntryGateState`**
  - `'checking'` — trwa pobieranie access summary
  - `'redirecting'` — decyzja zapadła, wykonujemy przekierowanie
  - `'error'` — błąd sieci/5xx/parsing
  - `'forbidden'` — dietetyk lub inny brak uprawnień (jeśli obsługujemy w UI)

- **`PzkEntryGateVM`**
  - `state: PzkEntryGateState`
  - `message: string` — komunikat dla użytkownika (bez szczegółów technicznych)
  - `canRetry: boolean`
  - `purchaseHref: string`
  - `catalogHref: string`
  - `debug?: { status?: number; code?: string }` — tylko do logów, nie renderować użytkownikowi

## 6. Zarządzanie stanem

### Wariant A (rekomendowany): SSR-only (bez React)

- **Stan**: brak stanu po stronie klienta.
- **Przepływ**:
  - `index.astro` wykonuje decyzję i zwraca redirect/403/HTML.
- **Plusy**:
  - najszybsze przekierowanie,
  - działa bez JS,
  - minimalna powierzchnia błędów.

### Wariant B: SSR + lekki React fallback (gdy chcemy pokazać “Sprawdzam dostęp…”)

- **Stan w `PzkEntryGate`**:
  - `state: PzkEntryGateState`
  - `errorMessage: string | null`
  - `lastHttpStatus?: number`
  - `attempt: number` (do retry)

- **Custom hook (opcjonalnie)**: `usePzkAccessGate`
  - Cel: enkapsulować logikę `fetch('/api/pzk/access')`, mapowanie statusów i side-effecty redirect.
  - API hooka:
    - `state`
    - `error`
    - `retry()`

## 7. Integracja API

### Endpoint

- **GET** `/api/pzk/access`
- **Request**:
  - brak query/body
  - wymaga cookie sesji Lucia (automatycznie wysyłane przez przeglądarkę w ramach tej samej domeny)
- **Response**:
  - `200`: `ApiResponse<PzkAccessSummary>` z `data`
  - `401`: `ApiResponse<null>` z `error.code = 'unauthorized'`
  - `403`: `ApiResponse<null>` z `error.code = 'forbidden'`

### Akcje frontendowe (mapowanie)

- `200` + `data.hasAnyActiveAccess === true`
  - `redirect → /pacjent/pzk/katalog` (lub inny docelowy route katalogu)
- `200` + `data.hasAnyActiveAccess === false`
  - `redirect → /pzk/kup`
- `401`
  - `redirect → /pzk/kup` (wymóg widoku)
- `403`
  - jeśli to dietetyk: **403 view** (bez redirectu)
  - w pozostałych przypadkach: fallback UI + CTA do `/pzk/kup`
- `5xx` / wyjątek:
  - fallback UI + retry

## 8. Interakcje użytkownika

W normalnym scenariuszu użytkownik nie wykonuje interakcji — widok jest czystą bramką.

Jeśli wdrażamy fallback UI:

- **Wejście na `/pacjent/pzk`**:
  - widzi tekst “Sprawdzam dostęp…”
  - po krótkiej chwili następuje przekierowanie.
- **Błąd sieci/serwera**:
  - widzi komunikat “Nie udało się sprawdzić dostępu. Spróbuj ponownie.”
  - może kliknąć:
    - “Spróbuj ponownie” → ponawia `GET /api/pzk/access`
    - “Przejdź do zakupu” → przechodzi na `/pzk/kup`

## 9. Warunki i walidacja

### Warunki wynikające z PRD / user story / API

- **Brak ujawniania treści PZK**:
  - widok nie pobiera katalogu ani materiałów,
  - nie wyświetla listy modułów/dostępów (poza samą decyzją redirect).

- **Rola użytkownika**:
  - dietetyk **nie może** wejść do PZK:
    - w tym widoku: odpowiedź/ekran **403**.

- **Dostęp**:
  - pacjent ma dostęp do PZK tylko wtedy, gdy `hasAnyActiveAccess === true`.

### Weryfikacja warunków w kodzie

- W `index.astro`:
  - sprawdź `Astro.locals.user` i `user.role`.
- W `PzkEntryGate`/hooku:
  - sprawdź status HTTP,
  - sprawdź envelope `ApiResponse<T>`:
    - `data != null` dla 200,
    - `error != null` dla błędów.

## 10. Obsługa błędów

### Scenariusze błędów i rekomendowane zachowanie

- **Niezalogowany**:
  - redirect do `/pzk/kup`.
  - Uwaga: obecne RBAC przekieruje na `/logowanie` — trzeba wyjątku w middleware.

- **Dietetyk na `/pacjent/pzk`**:
  - status 403 + bezpieczny komunikat.
  - Uwaga: obecne RBAC przekieruje dietetyka na `/dietetyk/dashboard` — trzeba wyjątku w middleware.

- **Błąd 5xx z `/api/pzk/access`**:
  - fallback UI + retry, bez pokazywania szczegółów technicznych.

- **Nieprawidłowy payload** (np. `data` null przy 200):
  - traktuj jako błąd (fallback UI + retry).

- **Nieoczekiwany 403 z endpointu dla pacjenta**:
  - pokaż bezpieczny komunikat + CTA do `/pzk/kup` (nie ujawniaj “dlaczego”).

### Logowanie (opcjonalne)

- W wariancie z React:
  - `console.warn`/`console.error` tylko w dev,
  - nie renderować szczegółów błędu użytkownikowi.

## 11. Kroki implementacji

1. **Dodaj route widoku**:
   - utwórz `src/pages/pacjent/pzk/index.astro`.
   - ustaw spójne SEO title/description (np. “Przestrzeń Zdrowej Kobiety — wejście”).

2. **Wprowadź wyjątek w RBAC dla `/pacjent/pzk`** (wymagane, inaczej nie spełnimy widoku):
   - w `src/middleware/rbac.ts` dodaj warunek specjalny dla `url.pathname === '/pacjent/pzk'` (lub `startsWith('/pacjent/pzk')` jeśli przewidujesz podstrony):
     - **nie rób** redirectu niezalogowanych na `/logowanie` dla tej ścieżki,
     - **nie rób** redirectu dietetyka na `/dietetyk/dashboard` dla tej ścieżki,
     - pozwól wejść do routingu, żeby strona mogła zrobić `/pzk/kup` lub 403.

3. **Zaimplementuj logikę bramki (SSR)** w `index.astro`:
   - jeśli `!Astro.locals.user` → `Astro.redirect('/pzk/kup')`
   - jeśli `user.role === 'dietitian'` → ustaw status 403 i wyrenderuj prosty ekran “Brak dostępu”
   - jeśli `user.role === 'patient'`:
     - wywołaj `GET /api/pzk/access` (albo równoważnie, bezpośrednio serwis — ale kontraktowo opieraj decyzję o DTO `PzkAccessSummary`)
     - na podstawie `hasAnyActiveAccess` przekieruj:
       - `true` → `/pacjent/pzk/katalog`
       - `false` → `/pzk/kup`

4. **(Opcjonalnie) Dodaj fallback UI**:
   - dodaj `src/components/pzk/PzkEntryGate.tsx` i zhydratyzuj `client:load`,
   - pokaż “Sprawdzam dostęp…” + obsługę retry w razie błędów.

5. **Zadbaj o spójność z US-001 (menu entry)**:
   - w `src/components/Header.astro` dodaj pozycję “Przestrzeń Zdrowej Kobiety” w nawigacji pacjenta,
   - zgodnie z PRD: pokazuj ją tylko gdy pacjent ma aktywny dostęp (wymaga danych “access summary”):
     - rekomendacja techniczna: rozważ osobne wzbogacenie `Astro.locals` w middleware o `pzkAccessSummary` (żeby nie dublować fetchy),
     - alternatywnie (prostszym kosztem): renderuj link zawsze dla pacjenta, a bramka `/pacjent/pzk` zrobi właściwy redirect (to jest zgodne UX, ale **nie** spełnia wprost PRD “menu tylko przy dostępie”).

6. **Testy (rekomendowane)**:
   - E2E (Playwright):
     - niezalogowany wchodzi na `/pacjent/pzk` → kończy na `/pzk/kup`,
     - dietetyk wchodzi na `/pacjent/pzk` → widzi 403,
     - pacjent bez aktywnego dostępu → `/pzk/kup`,
     - pacjent z aktywnym dostępem → `/pacjent/pzk/katalog`.
   - (Opcjonalnie) test komponentu React (Vitest) jeśli wdrożony fallback UI.


