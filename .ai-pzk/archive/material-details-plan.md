## Plan implementacji widoku: Szczegóły materiału PZK

## 1. Przegląd

Widok **Szczegóły materiału PZK** (`/pacjent/pzk/material/:id`) służy do konsumpcji treści edukacyjnej (Markdown, PDF, YouTube) oraz do zarządzania **prywatną notatką pacjenta** dla danego materiału.

Widok musi obsłużyć 3 warianty:
- **odblokowany**: `status=published` + pacjent ma aktywny dostęp do modułu → pełna treść + PDF + wideo + notatki
- **zablokowany**: `status=published` + brak dostępu do modułu → tylko tytuł/opis + blokada + CTA do zakupu (bez PDF/wideo/notatki)
- **publish_soon**: `status=publish_soon` → widoczny informacyjnie jako „Dostępny wkrótce”, bez akcji i bez treści

Wymagania bezpieczeństwa:
- **brak wycieku metadanych** dla `draft`/`archived` (traktować jak **404**)
- **bez ujawniania detali storage/presign** w UI
- wszystkie akcje wymagają zalogowania, a mutacje wymagają przejścia CSRF check (same-origin)

## 2. Routing widoku

- **Ścieżka widoku**: `/pacjent/pzk/material/:id`
- **Implementacja routingu w Astro**: dodać stronę dynamiczną
  - `src/pages/pacjent/pzk/material/[id].astro`

### Zachowanie routingu (SSR gating)

W frontmatter strony Astro:
- **Jeśli `!Astro.locals.user`**:
  - rekomendacja spójna z katalogiem: `302` → `/logowanie`
  - (opcjonalnie w przyszłości: `returnTo=/pacjent/pzk/material/<id>`)
- **Jeśli `user.role === 'dietitian'`**:
  - zwrócić **403** i renderować bezpieczny ekran „Brak dostępu” (bez danych)
- **Jeśli `user.role === 'patient'`**:
  - renderować React island widoku (ładowanie danych po stronie klienta)

Uwaga: w przeciwieństwie do `/pacjent/pzk/katalog` nie wykonujemy tu SSR checku „czy pacjent ma jakikolwiek dostęp do PZK”, bo:
- widok ma wspierać stan **locked** (pacjent zalogowany, bez dostępu do modułu materiału) – API i tak zwróci bezpieczną wersję

## 3. Struktura komponentów

Docelowo (React island) – analogicznie do katalogu:

- `PzkMaterialDetailsPage` (container)
  - `PzkInternalNav` (re-use; aktywne: `catalog` lub rozszerzone na `details`)
  - `PzkBreadcrumbs`
  - `PzkMaterialHeader`
  - **switch po wariancie widoku**:
    - `PzkMaterialLockedState`
    - `PzkMaterialPublishSoonState`
    - `PzkMaterialUnlockedContent`
      - `PzkMaterialBody` (render `contentMd`)
      - `PzkPdfSection`
        - `PzkPdfDownloadButton` (per PDF)
      - `PzkVideoSection`
        - `PzkYouTubeEmbed` (per video)
      - `PzkNotePanel`
  - stany globalne:
    - `PzkMaterialDetailsLoadingState`
    - `PzkMaterialDetailsErrorState`

### Diagram drzewa komponentów (high-level)

```
PzkMaterialDetailsPage
├─ PzkInternalNav
├─ PzkBreadcrumbs
├─ PzkMaterialHeader
└─ (variant)
   ├─ Locked: PzkMaterialLockedState
   ├─ Soon:   PzkMaterialPublishSoonState
   └─ Unlocked: PzkMaterialUnlockedContent
      ├─ PzkMaterialBody (contentMd)
      ├─ PzkPdfSection
      │  └─ PzkPdfDownloadButton (xN)
      ├─ PzkVideoSection
      │  └─ PzkYouTubeEmbed (xN)
      └─ PzkNotePanel
```

## 4. Szczegóły komponentów

> Nazwy plików są propozycją. Rekomendowana lokalizacja: `src/components/pzk/material-details/*` oraz hooki w `src/hooks/pzk/*`.

### `PzkMaterialDetailsPage`

- **Opis**: główny kontener, orkiestruje pobranie danych `GET /api/pzk/materials/:id`, mapowanie DTO→VM, wybór wariantu, a także przekazanie danych do sekcji PDF/wideo/notatki.
- **Główne elementy**:
  - wrapper: `<div className="min-h-screen bg-neutral-light">`
  - `<div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">`
  - `PzkInternalNav`, `PzkBreadcrumbs`, `PzkMaterialHeader`
  - `section` dla treści (ARIA)
- **Obsługiwane zdarzenia**:
  - `onRetry` (ponowne pobranie szczegółów)
  - przekazywanie callbacków do dzieci: `onDownloadPdf`, `onNoteSave`, `onNoteDelete`
- **Warunki walidacji (UI zgodnie z API)**:
  - `id` z URL musi wyglądać jak UUID (walidacja UX: szybki 400-style komunikat)  
    - minimalnie: regex UUID v4; docelowo: `zod` po stronie klienta lub prosta funkcja `isUuid()`
  - render wariantów:
    - **404**: pokazać “Nie znaleziono zasobu” bez rozróżniania przyczyny (`draft/archived/nie istnieje`)
    - **200 + access.isLocked**:
      - jeśli `reason === 'publish_soon'` → wariant publish soon
      - jeśli `reason === 'no_module_access'` → wariant locked z CTA
    - **200 + access.isLocked=false** → unlocked
- **Typy**:
  - DTO: `ApiResponse<PzkMaterialDetails>` (`src/types/pzk-dto.ts`)
  - VM: `PzkMaterialDetailsVM`, `PzkMaterialDetailsErrorVM` (do dodania – sekcja „Typy”)
- **Props (interfejs)**:
  - `materialId: string` (z Astro route param)
  - opcjonalnie: `include?: 'pdfs,videos,note' | ...` (raczej nie – użyć domyślnego)

### `PzkBreadcrumbs`

- **Opis**: breadcrumbs zgodne z PRD/UI planem: „PZK / Moduł / Kategoria / Materiał”.
- **Główne elementy**:
  - `<nav aria-label="Breadcrumbs">` + lista linków
  - link do katalogu: `/pacjent/pzk/katalog`
- **Obsługiwane zdarzenia**: brak (linki standardowe)
- **Walidacja**:
  - jeżeli `category === null` (np. locked) → pominąć segment kategorii
  - zawsze można pokazać „Moduł X” na podstawie `module` (nawet w locked)
- **Typy**:
  - VM: `PzkMaterialBreadcrumbsVM`
- **Props**:
  - `breadcrumbs: PzkMaterialBreadcrumbsVM`

### `PzkMaterialHeader`

- **Opis**: prezentuje tytuł, opis, badge statusu (opcjonalnie) oraz „meta” (np. moduł).
- **Główne elementy**:
  - `<header>` z `<h1>` i `<p>`
  - badge: “Dostępny”, “Zablokowany”, “Dostępny wkrótce”
- **Obsługiwane zdarzenia**: brak
- **Walidacja**:
  - opis opcjonalny (render warunkowy)
- **Typy**:
  - VM: `PzkMaterialHeaderVM`
- **Props**:
  - `header: PzkMaterialHeaderVM`

### `PzkMaterialLockedState`

- **Opis**: stan zablokowany (kłódka + CTA zakupu modułu), bez treści i bez akcji.
- **Główne elementy**:
  - `<section role="status" aria-live="polite">`
  - CTA `<a target="_blank" rel="noopener noreferrer">`
- **Obsługiwane zdarzenia**: klik CTA
- **Walidacja**:
  - CTA dostępne wyłącznie jeśli `ctaUrl != null`  
    - fallback (edge case): zbudować z `buildPurchaseUrl(module)` z `src/lib/pzk/config.ts`
- **Typy**:
  - VM: `PzkMaterialLockedVM`
- **Props**:
  - `locked: PzkMaterialLockedVM`

### `PzkMaterialPublishSoonState`

- **Opis**: wariant `publish_soon` – informacyjny banner “Dostępny wkrótce”, bez CTA i bez akcji.
- **Główne elementy**:
  - banner/alert info
  - opcjonalnie: “Wróć do katalogu”
- **Obsługiwane zdarzenia**: link “Wróć”
- **Walidacja**:
  - brak CTA zakupu (zgodnie z PRD)
- **Typy**:
  - VM: `PzkMaterialPublishSoonVM`
- **Props**:
  - `soon: PzkMaterialPublishSoonVM`

### `PzkMaterialUnlockedContent`

- **Opis**: wrapper sekcji dostępnych tylko dla odblokowanego materiału.
- **Główne elementy**:
  - `PzkMaterialBody`, `PzkPdfSection`, `PzkVideoSection`, `PzkNotePanel`
- **Obsługiwane zdarzenia**:
  - deleguje do dzieci
- **Walidacja**:
  - sekcje PDF/wideo renderować tylko jeśli listy nie są puste
- **Typy**:
  - VM: `PzkMaterialUnlockedVM`
- **Props**:
  - `unlocked: PzkMaterialUnlockedVM`

### `PzkMaterialBody` (render `contentMd`)

- **Opis**: render treści autora (Markdown) w stylu “prose” (Tailwind typography).
- **Główne elementy**:
  - `<article className="prose prose-neutral max-w-none">`
- **Obsługiwane zdarzenia**: brak
- **Walidacja**:
  - `contentMd` może być `null` → wtedy nie renderować sekcji
- **Typy**:
  - `contentMd: string`
- **Wymagania techniczne**:
  - w repo nie ma parsera Markdown – plan zakłada jedno z podejść:
    - **MVP minimalny**: wyświetlić Markdown jako tekst (`whitespace-pre-wrap`), bez parsowania
    - **Rekomendowane**: dodać `react-markdown` (+ opcjonalnie `remark-gfm`) i renderować bez `rehype-raw` (bezpiecznie; brak HTML)

### `PzkPdfSection`

- **Opis**: lista załączników PDF z przyciskami “Pobierz”.
- **Główne elementy**:
  - `<section aria-label="Pliki PDF">`
  - lista `<ul>` elementów z nazwą pliku i akcją
- **Obsługiwane zdarzenia**:
  - `onDownload(pdfId)`
- **Walidacja**:
  - sekcja tylko w wariancie unlocked
  - przyciski disabled podczas trwającego presign dla danego pdfId
- **Typy**:
  - VM: `PzkMaterialPdfVM[]`
- **Props**:
  - `materialId: string`
  - `pdfs: PzkMaterialPdfVM[]`
  - `onDownload: (pdfId: string) => Promise<void>`
  - `downloadState: Record<pdfId, PzkPdfDownloadStateVM>` (lub Map)

### `PzkPdfDownloadButton`

- **Opis**: przycisk, który:
  - wywołuje `POST /api/pzk/materials/:materialId/pdfs/:pdfId/presign`
  - po sukcesie rozpoczyna download (bez opuszczania widoku)
- **Główne elementy**:
  - `<button>` z loading spinner i komunikatem błędu per element
- **Obsługiwane zdarzenia**:
  - klik pobrania
  - retry po błędzie
- **Walidacja (zgodnie z API)**:
  - request body: `{ ttlSeconds: 60 }` (opcjonalnie pominąć body – backend domyślnie używa 60)
  - obsłużyć statusy:
    - **401**: komunikat + CTA do logowania
    - **403**:
      - `reason=no_module_access` → komunikat + CTA do zakupu
      - `reason=publish_soon` → komunikat informacyjny (raczej edge-case)
    - **404**: “Nie znaleziono pliku lub materiału” (bez detali)
    - **429**: komunikat + “Spróbuj ponownie za X s” (bazując na `Retry-After` lub `details.retryAfterSeconds`)
    - **500**: komunikat + retry
- **Typy**:
  - DTO: `ApiResponse<PzkPresignResponse>`
  - VM: `PzkPdfDownloadStateVM`
- **Implementacja download (rekomendacja UX)**:
  - `window.open(presignedUrl, '_blank', 'noopener,noreferrer')`  
    - uzasadnienie: użytkownik zostaje na stronie materiału (spełnia US-009)

### `PzkVideoSection`

- **Opis**: lista wideo YouTube (embed) dla unlocked materiału.
- **Główne elementy**:
  - `<section aria-label="Wideo">`
  - lista embedów (iframe) + tytuł (jeśli jest)
- **Obsługiwane zdarzenia**:
  - obsługa błędu ładowania iframe (fallback UI)
- **Walidacja**:
  - tylko unlocked
  - `youtubeVideoId` wymagany
- **Typy**:
  - VM: `PzkMaterialVideoVM[]`
- **Props**:
  - `videos: PzkMaterialVideoVM[]`

### `PzkYouTubeEmbed`

- **Opis**: osadzony odtwarzacz YouTube + fallback gdy nie ładuje się.
- **Główne elementy**:
  - `<iframe>` z `src="https://www.youtube-nocookie.com/embed/<id>"`
  - `title` a11y
- **Obsługiwane zdarzenia**:
  - `onError` (iframe) → pokazać komunikat + przycisk “Odśwież”
- **Walidacja (bezpieczeństwo/PRD)**:
  - nie ujawniać szczegółów technicznych przy błędzie
  - brak odtwarzania w locked (komponent nie renderowany)
- **Props**:
  - `youtubeVideoId: string`
  - `title?: string | null`

### `PzkNotePanel`

- **Opis**: edytor prywatnej notatki pacjenta:
  - pokazuje aktualną notatkę (z `GET /api/pzk/materials/:id`), pozwala zapisać (PUT) lub usunąć (DELETE)
- **Główne elementy**:
  - `<section aria-label="Twoje notatki">`
  - `<textarea>` + przyciski “Zapisz” i “Usuń”
  - status: “Zapisuję…”, “Zapisano”, błąd + retry
- **Obsługiwane zdarzenia**:
  - `onChange` textarea
  - `onSave` → `PUT /api/pzk/materials/:materialId/note`
  - `onDelete` → `DELETE /api/pzk/materials/:materialId/note`
- **Walidacja (zgodnie z API + PRD)**:
  - trim content, wymagane 1..10_000 znaków (po trim) – zgodnie z walidacją backendu
  - disabled save podczas `isSaving=true`
  - hidden/disabled cały panel w locked i publish_soon
- **Typy**:
  - DTO:
    - `ApiResponse<PzkNoteDto | null>` (GET note w szczegółach materiału pośrednio)
    - `ApiResponse<PzkNoteDto>` (PUT)
  - VM: `PzkNoteEditorVM`
- **Props**:
  - `materialId: string`
  - `initialNote: { content: string; updatedAt: string } | null`

### `PzkMaterialDetailsLoadingState` / `PzkMaterialDetailsErrorState`

- **Opis**: analogicznie do katalogu: pełnoekranowy loading + karta błędu z retry.
- **Walidacja**:
  - **404**: “Nie znaleziono zasobu” (bez różnicowania)
  - **401**: CTA logowania
  - **403**: “Brak dostępu” (rola) – ale w praktyce 403 na GET details dotyczy non-patient; pacjent bez dostępu dostaje 200 locked
- **Typy**:
  - `PzkMaterialDetailsErrorVM` (spójny z `mapPzkError`)

## 5. Typy

### DTO (istniejące)

- **Materiał (details)**: `PzkMaterialDetails` (`src/types/pzk-dto.ts`)
- **Presign PDF**:
  - request: `PzkPresignRequest`
  - response: `PzkPresignResponse`
- **Notatki**:
  - `PzkNoteDto`, `PzkNoteUpsertRequest`
- **Envelope**: `ApiResponse<T>`

### Nowe typy ViewModel (do dodania)

> Cel: utrzymać komponenty proste, a reguły (variant, CTA, breadcrumbs) w jednym miejscu – tak jak katalog robi to przez `mapPzkCatalogToVm`.

#### `PzkMaterialDetailsVM`

- **Polityka wariantu**:
  - `variant: 'unlocked' | 'locked' | 'soon'`
  - wyliczany z `dto.status` + `dto.access.isLocked` + `dto.access.reason`

Proponowane pola:
- `id: string`
- `module: 1 | 2 | 3`
- `status: 'published' | 'publish_soon'`
- `title: string`
- `description: string | null`
- `breadcrumbs: PzkMaterialBreadcrumbsVM`
- `header: PzkMaterialHeaderVM`
- `variant: 'unlocked' | 'locked' | 'soon'`
- `locked?: PzkMaterialLockedVM` (gdy `variant='locked'`)
- `soon?: PzkMaterialPublishSoonVM` (gdy `variant='soon'`)
- `unlocked?: PzkMaterialUnlockedVM` (gdy `variant='unlocked'`)

#### `PzkMaterialBreadcrumbsVM`

- `items: Array<{ label: string; href?: string }>`
  - przykładowo:
    - `{ label: 'PZK', href: '/pacjent/pzk/katalog' }`
    - `{ label: 'Moduł 1', href: '/pacjent/pzk/katalog?module=1' }` *(opcjonalnie – jeśli w katalogu wspieracie query)*
    - `{ label: 'Start' }` *(tylko jeśli `category != null`)*
    - `{ label: '<tytuł materiału>' }`

#### `PzkMaterialHeaderVM`

- `title: string`
- `description: string | null`
- `badge: { kind: 'available' | 'locked' | 'soon'; label: string }`
- `meta: { moduleLabel: string }`

#### `PzkMaterialUnlockedVM`

- `contentMd: string | null`
- `pdfs: PzkMaterialPdfVM[]`
- `videos: PzkMaterialVideoVM[]`
- `note: { content: string; updatedAt: string } | null`

#### `PzkMaterialPdfVM`

- `id: string`
- `fileName: string | null`
- `displayOrder: number`
- `label: string` (np. fallback “Załącznik 1” jeśli brak `fileName`)

#### `PzkMaterialVideoVM`

- `id: string`
- `youtubeVideoId: string`
- `title: string | null`
- `displayOrder: number`
- `ariaTitle: string` (np. `title ?? 'Wideo'`)

#### `PzkMaterialLockedVM`

- `message: string` (np. “Ten materiał jest dostępny po zakupie modułu X.”)
- `cta: { href: string; label: string; isExternal: true }`
- `module: 1|2|3` (do fallback CTA)

#### `PzkMaterialPublishSoonVM`

- `message: string` (np. “Materiał będzie dostępny wkrótce.”)

#### `PzkMaterialDetailsErrorVM`

Spójny kształt z `PzkCatalogErrorVM` (re-use):
- `kind: 'unauthorized' | 'forbidden' | 'validation' | 'not_found' | 'server' | 'network' | 'unknown'`
- `message: string`
- `statusCode?: number`
- `retryable: boolean`

#### `PzkPdfDownloadStateVM`

Do zarządzania stanem pobierania per PDF:
- `status: 'idle' | 'loading' | 'success' | 'error' | 'rate_limited'`
- `message?: string` (komunikat pod przyciskiem)
- `retryAfterSeconds?: number`

#### `PzkNoteEditorVM`

- `value: string`
- `isDirty: boolean`
- `isSaving: boolean`
- `isDeleting: boolean`
- `lastSavedAt?: string`
- `error?: { message: string; retryable: boolean }`

## 6. Zarządzanie stanem

### Globalny stan widoku (container)

W `PzkMaterialDetailsPage`:
- `material: PzkMaterialDetailsVM | null`
- `isLoading: boolean`
- `error: PzkMaterialDetailsErrorVM | null`
- `reload(): Promise<void>`

Rekomendacja: osobny hook analogiczny do katalogu:
- `usePzkMaterialDetails(materialId: string, opts?: { include?: string })`
  - `AbortController`
  - `isMountedRef` (jak w `usePzkCatalog`)
  - mapowanie DTO→VM
  - mapowanie błędów (rozszerzenie `mapPzkError` o `not_found`)

### Stan akcji PDF (per załącznik)

W `PzkPdfSection` albo wyżej (jeśli chcemy centralnie):
- `downloadStateByPdfId: Record<string, PzkPdfDownloadStateVM>`
- `downloadPdf(pdfId)`:  
  - ustawia `loading`, wywołuje presign, na sukces `window.open(url, ...)`, potem `success` (best-effort)

Opcjonalny hook:
- `usePzkPdfDownload(materialId: string)` → zwraca `download(pdfId)` + `stateByPdfId`

### Stan notatki

W `PzkNotePanel`:
- `value`, `isDirty`
- `save()` (PUT)
- `remove()` (DELETE)

Opcjonalny hook:
- `usePzkNote(materialId, initialNote)`

## 7. Integracja API

### 7.1. Pobranie szczegółów materiału

- **Endpoint**: `GET /api/pzk/materials/:materialId`
- **Typ odpowiedzi**: `ApiResponse<PzkMaterialDetails>`
- **Wywołanie FE**:
  - `fetch(`/api/pzk/materials/${materialId}`)`
  - nagłówki: `Accept: application/json`, `Cache-Control: no-store`
- **Obsługa**:
  - `200`:
    - jeśli `data.access.isLocked=false` → unlocked
    - jeśli `isLocked=true` + `reason='no_module_access'` → locked (CTA)
    - jeśli `isLocked=true` + `reason='publish_soon'` lub `status='publish_soon'` → soon
  - `401` → błąd unauthorized + CTA logowania
  - `403` → forbidden (rola)
  - `404` → not_found (bez wycieku)
  - `500+` → server

### 7.2. Presign PDF (download)

- **Endpoint**: `POST /api/pzk/materials/:materialId/pdfs/:pdfId/presign`
- **Typ żądania**: `PzkPresignRequest` (opcjonalnie; `ttlSeconds: 60`)
- **Typ odpowiedzi**: `ApiResponse<PzkPresignResponse>`
- **Wywołanie FE**:
  - `fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ttlSeconds: 60 }) })`
- **Obsługa**:
  - `200` → `window.open(data.url, '_blank', 'noopener,noreferrer')`
  - `429` → odczytać `Retry-After` i/lub `error.details.retryAfterSeconds`, zablokować retry przez ten czas
  - `403` z `details.reason` → komunikat + CTA (jeśli `no_module_access`)

### 7.3. Notatki (CRUD)

> GET notatki jest dostępny, ale w tym widoku preferujemy użyć `material.note` z `GET /materials/:id` jako initial state.

- **PUT** `/api/pzk/materials/:materialId/note`
  - body: `PzkNoteUpsertRequest`
  - response: `ApiResponse<PzkNoteDto>`
  - walidacja FE: trim, 1..10_000 znaków
- **DELETE** `/api/pzk/materials/:materialId/note`
  - response: `204 No Content`
  - FE: po sukcesie czyści note state (`value=''`, `isDirty=false`)

## 8. Interakcje użytkownika

- **Wejście na stronę**:
  - użytkownik widzi loading, następnie jeden z wariantów (unlocked/locked/soon) lub error/404
- **Pobranie PDF** (US-008/009):
  - klik “Pobierz” → loading na przycisku → presign
  - sukces → rozpoczyna download w nowej karcie (użytkownik pozostaje na stronie)
  - błąd → komunikat przy przycisku + retry
  - 429 → komunikat + blokada retry na czas limitu
- **Odtworzenie wideo** (US-010/011):
  - embed działa bez logowania w YouTube (youtube-nocookie)
  - gdy iframe nie ładuje: komunikat + “Odśwież” (reload iframe/sekcji)
- **Notatki** (US-012/013):
  - wpis → przycisk “Zapisz” aktywny (isDirty)
  - “Zapisz” → PUT, pokaz status “Zapisuję…”, potem “Zapisano”
  - “Usuń” → DELETE, potwierdzenie w UI (opcjonalny modal)

## 9. Warunki i walidacja

### Warunki wynikające z API (i jak wpływają na UI)

- **`GET /materials/:id`**
  - `200 + access.isLocked=false`:
    - render sekcji PDF/wideo/notatek
    - przyciski aktywne
  - `200 + access.isLocked=true + reason=no_module_access`:
    - nie renderować treści, pdfs, videos, note (powinny być puste/null)
    - render `PzkMaterialLockedState` + CTA
  - `200 + status=publish_soon` (lub `reason=publish_soon`):
    - render `PzkMaterialPublishSoonState`
    - brak CTA i brak akcji
  - `404`:
    - render “Nie znaleziono zasobu” (bez różnicowania draft/archived/nie istnieje)
- **`POST presign`**
  - `403` może się wydarzyć nawet na unlocked (wygaśnięcie dostępu w trakcie):
    - UI powinien umieć przełączyć się w stan locked (opcjonalnie po `reload()`)
  - `429`:
    - UI powinien czytelnie komunikować limit i sugerować retry po czasie
- **`PUT note`**
  - `400` gdy content pusty/za długi:
    - UI waliduje to pre-emptive; jeśli mimo to backend zwróci 400, pokazać komunikat z envelope

### Walidacja po stronie UI (rekomendowana)

- **UUID w URL**:
  - jeśli niepoprawne → natychmiastowy błąd “Nieprawidłowy adres” (retryable: false)
- **Notatka**:
  - `trim().length` w zakresie 1..10_000
  - disable “Zapisz” jeśli invalid lub brak zmian

## 10. Obsługa błędów

### Klasy błędów do pokrycia

- **Błędy globalne `GET details`**:
  - 401 → “Sesja wygasła…” + CTA logowania
  - 403 → “Brak dostępu” (rola dietetyk/non-patient)
  - 404 → “Nie znaleziono zasobu”
  - network → “Brak połączenia…”
  - 5xx → “Wystąpił błąd… Spróbuj ponownie”

- **Błędy akcji presign**:
  - 403 no access → komunikat + CTA zakupu
  - 404 → “Nie znaleziono pliku”
  - 429 → komunikat z czasem retry (Retry-After)
  - 500 → “Nie udało się przygotować pobrania”

- **Błędy notatek**:
  - 400 → walidacja treści
  - 403/404 → utrata dostępu lub materiał nieaktywny → komunikat + opcjonalny reload widoku

### Zasada “no data leak”

W UI dla 404:
- nie wskazywać, czy materiał był `draft/archived`, czy “nie istnieje”
- komunikat zawsze ogólny (“Nie znaleziono zasobu”)

## 11. Kroki implementacji

1. **Routing (Astro)**
   - dodać `src/pages/pacjent/pzk/material/[id].astro`
   - skopiować wzorzec gatingu z `katalog.astro`:
     - redirect `!user` → `/logowanie`
     - `dietitian` → status 403 + widok błędu
     - `patient` → render React island z parametrem `id`

2. **Nowe komponenty widoku (React)**
   - utworzyć katalog `src/components/pzk/material-details/`
   - dodać `PzkMaterialDetailsPage.tsx` + komponenty pomocnicze (header, breadcrumbs, stany)
   - zre-użyć `PzkInternalNav` (na start ustaw `active="catalog"` albo rozszerz typ na `'details'`)

3. **Hook do pobrania danych**
   - dodać `src/hooks/pzk/usePzkMaterialDetails.ts`
   - skopiować wzorzec z `usePzkCatalog`:
     - AbortController
     - mapowanie błędów przez funkcję w `src/lib/pzk/mappers.ts` (rozszerzyć o `404`)
     - mapowanie DTO→VM

4. **Mappowanie DTO→VM**
   - dodać `mapPzkMaterialDetailsToVm(dto: PzkMaterialDetails): PzkMaterialDetailsVM`
   - miejsce:
     - preferowane: `src/lib/pzk/mappers.ts` (spójnie)
     - alternatywnie: nowy plik `src/lib/pzk/material-details-mappers.ts`

5. **PDF download (presign)**
   - dodać `PzkPdfSection` + `PzkPdfDownloadButton`
   - zaimplementować per-pdf stan (loading/error/rate limit)
   - obsłużyć `Retry-After` i `error.details.retryAfterSeconds`

6. **Wideo (YouTube embed)**
   - dodać `PzkVideoSection` + `PzkYouTubeEmbed` z `youtube-nocookie`
   - fallback błędu (US-011): komunikat + “Odśwież”

7. **Notatki**
   - dodać `PzkNotePanel` z walidacją 1..10_000 po trim
   - PUT/DELETE z obsługą błędów i stanów UI (saving/deleting)

8. **Render `contentMd`**
   - ustalić podejście:
     - MVP: tekst z `whitespace-pre-wrap`
     - rekomendowane: dodać `react-markdown` + `remark-gfm`, stylować `prose`

9. **A11y + testability**
   - dodać `aria-label` dla sekcji, `aria-live` dla komunikatów, sensowne focus states
   - dodać `data-testid` dla:
     - root widoku
     - przycisków download per pdf
     - panelu notatek (save/delete)
     - stanów locked/soon/error

10. **Scenariusze E2E (do implementacji później, ale zaplanować selektory)**
   - unlocked: widoczne sekcje + zapis notatki + presign (mock)
   - locked: brak sekcji + CTA zakupu
   - publish_soon: banner, brak akcji
   - 404: bez wycieku



