## Plan implementacji widoku Recenzje PZK

## 1. Przegląd

Widok **Recenzje PZK** (`/pacjent/pzk/recenzje`) służy do:

- **Social proof** w obrębie PZK: lista recenzji innych pacjentów.
- **Zarządzania własną recenzją**: dodanie / edycja / usunięcie (maks. 1 recenzja na pacjenta).

Widok ma działać w obecnym stylu PZK w repo: **SSR gating w `.astro`** + **React island (`client:load`)** z hookami do fetchowania i spójną obsługą błędów w oparciu o `ApiResponse<T>`.

## 2. Routing widoku

- **Ścieżka**: `/pacjent/pzk/recenzje`
- **Plik routingu**: `src/pages/pacjent/pzk/recenzje.astro` (do utworzenia)

### SSR gating (wymagania bezpieczeństwa i UX)

W frontmatter strony `.astro` wdrożyć identyczny wzorzec jak w `src/pages/pacjent/pzk/katalog.astro`:

- **Niezalogowany**: `302` redirect → `/logowanie`
  - Uwaga: w `src/pages/pacjent/pzk/index.astro` niezalogowany idzie na `/pzk/kup`, ale katalog używa `/logowanie`. Dla spójności ze strefą pacjenta rekomendacja: **tak jak katalog**.
- **Rola `dietitian`**: `403` (bez ujawniania danych).
- **Rola `patient`**:
  - sprawdź dostęp przez `PzkAccessService.getAccessSummary(user.id)`,
  - jeśli `hasAnyActiveAccess === false`: `302` redirect → `/pzk/kup` (US-015),
  - jeśli `true`: render React island (widok recenzji).
- **Błąd serwera przy sprawdzaniu dostępu**: `500` i prosty ekran z retry (jak w katalogu).

## 3. Struktura komponentów

Rekomendowana lokalizacja komponentów: `src/components/pzk/reviews/*` (nowy katalog), analogicznie do `catalog/` i `material-details/`.

### Wysokopoziomowy diagram drzewa komponentów

- `recenzje.astro`
  - `Layout.astro`
    - `PzkReviewsPage` (React, `client:load`)
      - `PzkInternalNav active="reviews"`
      - `PzkReviewsHeader`
      - `PzkReviewsLayout`
        - `PzkMyReviewPanel`
          - `PzkRatingInput` (radio-group 1–6)
          - `PzkReviewTextarea`
          - `PzkMyReviewActions` (Zapisz / Usuń / Anuluj)
          - `PzkInlineError` (błędy walidacji / API)
        - `PzkReviewsList`
          - `PzkReviewCard[]`
          - `PzkReviewsPagination` (“Załaduj więcej”, status ładowania)
      - `PzkReviewsLoadingState` / `PzkReviewsErrorState` (zależnie od stanu)

## 4. Szczegóły komponentów

Poniżej: rekomendowana implementacja w stylu istniejących PZK komponentów (Tailwind + proste, deklaratywne komponenty).

### `PzkReviewsPage`

- **Cel**: kontener widoku, orkiestruje pobranie listy i “mojej recenzji”, renderuje stany loading/error/success.
- **Główne elementy**:
  - wrapper: `div.min-h-screen.bg-neutral-light` + `container ... max-w-6xl pt-10 pb-24` (jak katalog/szczegóły),
  - `PzkInternalNav active="reviews"`,
  - nagłówek widoku,
  - layout 2-kolumnowy (desktop) / 1-kolumnowy (mobile).
- **Zdarzenia**:
  - `onRetry` dla błędu pobierania (reload listy i/lub mojej recenzji),
  - `onSortChange` (zmiana sortowania listy),
  - `onLoadMore` (pobranie kolejnej strony).
- **Walidacja**: brak bezpośredniej (deleguje do panelu formularza).
- **Typy**:
  - wewnętrznie: `PzkReviewsPageVM` (nowy VM) lub kompozycja: `PzkReviewsListVM` + `PzkMyReviewVM`.
- **Props (interfejs)**:
  - opcjonalnie: `initialSort?: 'createdAtDesc' | 'updatedAtDesc'` (domyślnie `createdAtDesc`),
  - opcjonalnie: `initialLimit?: number` (domyślnie 20).

### `PzkReviewsHeader`

- **Cel**: tytuł i krótki opis widoku (spójny styl z `PzkCatalogHeader`).
- **Główne elementy**:
  - `h1` + `p` (np. “Recenzje PZK” + opis),
  - opcjonalnie: selektor sortowania (jeśli chcemy w headerze).
- **Zdarzenia**:
  - `onSortChange(sort)`.
- **Walidacja**:
  - sort musi być jednym z: `createdAtDesc` | `updatedAtDesc` (front).
- **Typy**:
  - `ReviewSortOptionVM = 'createdAtDesc' | 'updatedAtDesc'`.
- **Props**:
  - `sort: ReviewSortOptionVM`,
  - `onSortChange: (sort: ReviewSortOptionVM) => void`.

### `PzkMyReviewPanel`

- **Cel**: UI do dodania/edycji/usunięcia własnej recenzji (US-016/017/018).
- **Główne elementy**:
  - sekcja `section.bg-white.rounded-xl.border-2 ...` (jak `PzkNotePanel`),
  - `PzkRatingInput` (radio 1–6),
  - `textarea` treści,
  - stany: “tworzę / edytuję / zapisuję / usuwam”,
  - komunikaty walidacji i API (bez utraty treści).
- **Zdarzenia**:
  - `onChangeRating(value)`,
  - `onChangeContent(text)`,
  - `onSubmit()` → PUT,
  - `onDelete()` → DELETE,
  - `onCancelEdit()` (opcjonalnie: reset do wartości z serwera).
- **Walidacja (zgodna z API)**:
  - **rating**:
    - wymagany,
    - liczba całkowita,
    - zakres 1–6.
  - **content**:
    - wymagany po `trim()`,
    - długość 1–5000 znaków po `trim()`.
  - Blokady przycisków:
    - `Zapisz`: disabled gdy invalid / brak zmian / trwa zapis/usuwanie.
    - `Usuń`: disabled gdy brak recenzji z serwera lub trwa zapis/usuwanie.
- **Typy**:
  - DTO: `PzkMyReviewDto`, `PzkReviewUpsertRequest`, `ApiResponse<PzkMyReviewDto | null>`.
  - VM: `PzkMyReviewVM`, `PzkMyReviewEditorVM`, `PzkFormErrorVM`.
- **Props**:
  - `initialMyReview: PzkMyReviewVM | null` (z hooka),
  - `onUpsert: (req: PzkReviewUpsertRequest) => Promise<void>`,
  - `onDelete: () => Promise<void>`.

### `PzkRatingInput`

- **Cel**: dostępny (A11y) wybór oceny 1–6.
- **Rekomendacja A11y**: radio group (nie “gwiazdki” jako czyste przyciski bez semantyki).
- **Główne elementy**:
  - `fieldset` + `legend` (“Ocena”),
  - `input type="radio"` dla 1..6 + `label`,
  - opcjonalnie: wizualizacja (np. kropki/gwiazdki) ale semantyka pozostaje radiowa.
- **Zdarzenia**:
  - `onChange(value: 1|2|3|4|5|6)`.
- **Walidacja**:
  - wartość tylko 1..6; brak wartości = invalid.
- **Typy**:
  - `PzkRating = 1 | 2 | 3 | 4 | 5 | 6`.
- **Props**:
  - `value: PzkRating | null`,
  - `onChange: (value: PzkRating) => void`,
  - `disabled?: boolean`,
  - `errorId?: string` (dla `aria-describedby`).

### `PzkReviewsList`

- **Cel**: render listy recenzji + CTA do paginacji.
- **Główne elementy**:
  - `section` z `aria-label="Recenzje"`,
  - `ul`/`ol` z `li` jako `PzkReviewCard`,
  - empty state (gdy `items.length === 0`).
- **Zdarzenia**:
  - `onLoadMore()` (jeśli `nextCursor != null`).
- **Walidacja**: brak (render-only).
- **Typy**:
  - DTO: `PzkReviewDto`, `PzkReviewsList`.
  - VM: `PzkReviewListItemVM`, `PzkReviewsListVM`.
- **Props**:
  - `items: PzkReviewListItemVM[]`,
  - `hasMore: boolean`,
  - `isLoadingMore: boolean`,
  - `onLoadMore: () => void`,
  - `error?: PzkInlineErrorVM | null` (opcjonalnie błąd “load more”).

### `PzkReviewCard`

- **Cel**: pojedyncza recenzja w liście (US-019).
- **Główne elementy**:
  - autor (tylko `firstName`): fallback “Anonim” gdy `null`,
  - ocena 1–6 (np. “Ocena: 5/6” + wizualny badge),
  - treść,
  - daty:
    - `createdAt` (zawsze),
    - `updatedAt` (opcjonalnie: “zaktualizowano” jeśli różni się od createdAt).
- **Zdarzenia**: brak.
- **Walidacja**: brak.
- **Typy**: `PzkReviewListItemVM`.
- **Props**: `review: PzkReviewListItemVM`.

### `PzkReviewsLoadingState`

- **Cel**: skeleton/loader dla widoku (pierwsze ładowanie).
- **Wzorzec**: analogiczny do `PzkCatalogLoadingState` / `PzkMaterialDetailsLoadingState`.
- **Zdarzenia**: brak.

### `PzkReviewsErrorState`

- **Cel**: spójny ekran błędu dla widoku recenzji.
- **Wzorzec**: analogiczny do `PzkCatalogErrorState`, z:
  - login CTA dla 401,
  - CTA do `/pzk/kup` dla 403/braku dostępu,
  - retry tylko jeśli `retryable`.
- **Typy**: `PzkReviewsErrorVM` (nowy, strukturalnie zgodny z obecnymi ErrorVM).
- **Props**:
  - `error: PzkReviewsErrorVM`,
  - `onRetry: () => void`.

## 5. Typy

### Istniejące DTO (użyć bez zmian)

Z `src/types/pzk-dto.ts`:

- `ApiResponse<T>`
- `PzkReviewDto`
- `PzkReviewsList` (`{ items: PzkReviewDto[]; nextCursor: string | null }`)
- `PzkMyReviewDto`
- `PzkReviewUpsertRequest` (`{ rating: number; content: string }`)
- `PzkReviewsQueryParams` (`cursor?`, `limit?`, `sort?`)

### Nowe ViewModel (do dodania w `src/types/pzk-vm.ts`)

Rekomendacja: trzymać VM-y PZK w jednym pliku (`src/types/pzk-vm.ts`), tak jak katalog i material-details.

#### `PzkRating`

- `type PzkRating = 1 | 2 | 3 | 4 | 5 | 6`

#### `PzkReviewListItemVM`

- **Pola**:
  - `id: string`
  - `authorFirstName: string` (po mapowaniu; fallback “Anonim”)
  - `rating: PzkRating`
  - `content: string`
  - `createdAtIso: string`
  - `updatedAtIso: string`
  - `createdAtLabel: string` (np. `toLocaleDateString('pl-PL')`)
  - `updatedAtLabel?: string` (jeśli pokazywane)

#### `PzkReviewsListVM`

- **Pola**:
  - `items: PzkReviewListItemVM[]`
  - `nextCursor: string | null`
  - `sort: 'createdAtDesc' | 'updatedAtDesc'`
  - `limit: number`

#### `PzkMyReviewVM`

- **Pola**:
  - `id: string`
  - `rating: PzkRating`
  - `content: string`
  - `createdAtIso: string`
  - `updatedAtIso: string`
  - `metaLabel?: string` (np. “Ostatnio aktualizowano: …”)

#### `PzkMyReviewEditorVM`

Stan formularza (lokalny, UI-specific):

- **Pola**:
  - `rating: PzkRating | null`
  - `content: string`
  - `isDirty: boolean`
  - `isSubmitting: boolean`
  - `isDeleting: boolean`
  - `fieldErrors?: { rating?: string; content?: string }`
  - `submitError?: { message: string; retryable: boolean }`
  - `deleteError?: { message: string; retryable: boolean }`

#### `PzkReviewsErrorVM`

Analogiczny do istniejących:

- **Pola**:
  - `kind: 'unauthorized' | 'forbidden' | 'validation' | 'not_found' | 'server' | 'network' | 'unknown'`
  - `message: string`
  - `statusCode?: number`
  - `retryable: boolean`

## 6. Zarządzanie stanem

### Podejście

Trzymać stan w 2 niezależnych “kawałkach”:

1. **Lista recenzji** (paginowana):
   - `items[]`, `nextCursor`, `sort`, `limit`,
   - `isLoadingInitial`, `isLoadingMore`,
   - `errorInitial`, `errorLoadMore` (opcjonalnie osobno).
2. **Moja recenzja** (formularz):
   - `myReview: PzkMyReviewVM | null`,
   - `editor: PzkMyReviewEditorVM`,
   - `isLoadingMyReview`.

### Custom hooki (rekomendowane)

Utworzyć dwa hooki, analogicznie do istniejących `usePzkCatalog` i `usePzkNote`:

1. `src/hooks/pzk/usePzkReviewsList.ts`:
   - fetch `GET /api/pzk/reviews`,
   - obsługa cursor pagination i sort,
   - expose: `items`, `nextCursor`, `isLoading`, `isLoadingMore`, `error`, `reload()`, `loadMore()`, `setSort()`.
2. `src/hooks/pzk/usePzkMyReview.ts`:
   - fetch `GET /api/pzk/reviews/me`,
   - akcje `upsert(rating, content)` (PUT) i `delete()` (DELETE),
   - lokalna walidacja (rating/content),
   - zachowanie treści formularza przy błędach.

Uwaga: obecne hooki PZK często używają:

- `AbortController` + `isMountedRef` (dla fetch na mount),
- mapowania błędów przez `mapPzkError(status, message)`.

W hookach recenzji zachować ten sam wzorzec (dla spójności i uniknięcia setState-after-unmount).

## 7. Integracja API

### 7.1. GET `/api/pzk/reviews`

- **Frontend akcja**: pobierz listę recenzji na mount oraz przy zmianie sort.
- **Query params**:
  - `sort`: `'createdAtDesc' | 'updatedAtDesc'` (default `'createdAtDesc'`)
  - `limit`: number (default 20, max 50)
  - `cursor`: string | undefined (opaque; zwracany przez backend)
- **Typ odpowiedzi**:
  - `ApiResponse<PzkReviewsList>`
- **Zasady**:
  - traktować `nextCursor` jako **opaque** (nie parsować),
  - przy `loadMore`: wysłać `cursor=nextCursor` i dopisać `items`.

### 7.2. GET `/api/pzk/reviews/me`

- **Frontend akcja**: pobierz “moją recenzję” na mount.
- **Typ odpowiedzi**:
  - `ApiResponse<PzkMyReviewDto | null>`
- **Zasady**:
  - `data === null` oznacza brak recenzji → pokaż formularz dodania (US-016).

### 7.3. PUT `/api/pzk/reviews/me`

- **Frontend akcja**: upsert (create/update) po kliknięciu “Zapisz” (US-016/017).
- **Body**: `PzkReviewUpsertRequest`
  - `{ rating: number; content: string }`
- **Typ odpowiedzi**: `ApiResponse<PzkMyReviewDto>`
- **CSRF**:
  - endpoint wykonuje `checkCsrfForUnsafeRequest(request)`;
  - z przeglądarkowego `fetch()` (same-origin) nagłówki `Sec-Fetch-Site` / `Origin` będą spełnione — nie trzeba tokena.
- **Zasady UI**:
  - na sukces:
    - zaktualizować `myReview` i zsynchronizować `editor` (isDirty=false),
    - opcjonalnie: odświeżyć listę (żeby user widział swoją recenzję w liście) lub zrobić optymistyczny update.

### 7.4. DELETE `/api/pzk/reviews/me`

- **Frontend akcja**: usuń po potwierdzeniu (US-018).
- **Response**: `204 No Content` (bez JSON).
- **Błędy**:
  - `404` jeśli recenzja nie istnieje → UI powinien przejść do stanu “brak recenzji” i nie traktować tego jako krytycznego problemu (zależy od UX; rekomendacja: pokazać informację “Recenzja już została usunięta.”).

## 8. Interakcje użytkownika

### Lista recenzji

- **Wejście na stronę**:
  - widzi loader,
  - potem listę recenzji (lub empty state).
- **Zmiana sortowania**:
  - reset listy (items=[], cursor=null),
  - pobranie pierwszej strony z nowym `sort`.
- **Załaduj więcej**:
  - dopisuje kolejne elementy,
  - blokuje przycisk podczas `isLoadingMore`.

### Moja recenzja

- **Brak recenzji**:
  - formularz “Dodaj recenzję”.
- **Jest recenzja**:
  - formularz wypełniony danymi,
  - informacja o dacie utworzenia/aktualizacji.
- **Zapis**:
  - walidacja po stronie klienta,
  - loading state na przycisku,
  - na sukces: komunikat inline “Zapisano” lub timestamp.
- **Błąd zapisu**:
  - pokaz komunikat, **nie czyść** pól,
  - umożliw retry.
- **Usunięcie**:
  - wymagane potwierdzenie (inline confirm, jak w `PzkNotePanel`),
  - na sukces: formularz pusty (możliwość ponownego dodania).

## 9. Warunki i walidacja

### Warunki dostępu (US-015)

- Widok dostępny tylko gdy:
  - user jest zalogowany,
  - `role === 'patient'`,
  - ma `hasAnyActiveAccess === true`.
- Realizacja:
  - w SSR gating w `recenzje.astro`:
    - redirect do `/logowanie` dla niezalogowanego,
    - `403` dla dietetyka,
    - redirect do `/pzk/kup` dla pacjenta bez aktywnego dostępu.

### Walidacja formularza (zgodna z API)

- `rating`:
  - wymagany, `PzkRating (1..6)`,
  - komunikat: “Wybierz ocenę 1–6”.
- `content`:
  - `trim().length >= 1`,
  - `trim().length <= 5000`,
  - komunikat:
    - pusto: “Treść recenzji jest wymagana.”
    - za długo: “Recenzja jest za długa (X/5000).”
- Spójność z backendem:
  - backend waliduje Zod-em (`reviewUpsertBodySchema`), więc frontend walidacją ma przede wszystkim zapewnić UX i unikać `400`.

### Warunki API i ich mapowanie na UI

- `401`:
  - UI: komunikat o sesji + CTA “Zaloguj się”.
  - W praktyce SSR gating powinien eliminować 401 dla samej strony, ale API fetch może je dostać (np. wygasła sesja po wejściu).
- `403`:
  - UI: komunikat “Brak dostępu” + CTA do `/pzk/kup`.
  - SSR gating powinien eliminować przypadek braku dostępu, ale może wystąpić po czasie (wygasł dostęp).
- `400`:
  - UI: pokaż błąd walidacji inline i nie wysyłaj requestu ponownie, dopóki user nie poprawi.
- `500+` / network:
  - UI: retry.

## 10. Obsługa błędów

### Błędy pobierania listy (GET `/api/pzk/reviews`)

- **Pierwsze ładowanie**:
  - `PzkReviewsErrorState` (pełnoekranowy, jak katalog).
- **Load more**:
  - rekomendacja: błąd inline pod listą (nie “wywracać” całego widoku),
  - przycisk “Spróbuj ponownie” wywołuje `loadMore()` ponownie.

### Błędy pobierania “mojej recenzji” (GET `/api/pzk/reviews/me`)

- Jeśli lista działa, a “moja recenzja” nie:
  - pokaz błąd w panelu “Moja recenzja” (inline) + retry (reload tylko my-review).

### Błędy zapisu (PUT)

- `400`:
  - potraktować jako walidacja (wyświetlić `errorBody.error.message` + `details.field` jeśli jest).
- `401/403`:
  - inline komunikat + CTA (logowanie / zakup),
  - disable dalszych prób zapisu do czasu zmiany stanu (np. przejścia przez gating).
- `500/network`:
  - inline + retry.

### Błędy usunięcia (DELETE)

- `404`:
  - UX rekomendacja: potraktować jako “już usunięto” → przejść do stanu “brak recenzji”.
- `401/403/500/network`:
  - inline + retry.

## 11. Kroki implementacji

1. **Dodać route Astro**:
   - utworzyć `src/pages/pacjent/pzk/recenzje.astro`,
   - skopiować wzorzec SSR gating z `katalog.astro`,
   - w success case wyrenderować `PzkReviewsPage client:load`.

2. **Dodać katalog komponentów widoku**:
   - utworzyć `src/components/pzk/reviews/` i w nim:
     - `PzkReviewsPage.tsx`,
     - `PzkReviewsHeader.tsx`,
     - `PzkMyReviewPanel.tsx`,
     - `PzkRatingInput.tsx`,
     - `PzkReviewsList.tsx`,
     - `PzkReviewCard.tsx`,
     - `PzkReviewsLoadingState.tsx`,
     - `PzkReviewsErrorState.tsx`.

3. **Dodać ViewModel i mapowanie DTO → VM**:
   - rozszerzyć `src/types/pzk-vm.ts` o typy recenzji (sekcja 5),
   - dodać w `src/lib/pzk/mappers.ts` funkcje mapujące:
     - `mapPzkReviewDtoToVm(dto: PzkReviewDto): PzkReviewListItemVM`,
     - `mapPzkMyReviewDtoToVm(dto: PzkMyReviewDto): PzkMyReviewVM`,
     - ewentualnie `mapPzkReviewsListToVm(dto: PzkReviewsList, sort, limit): PzkReviewsListVM`.
   - do błędów:
     - wykorzystać istniejące `mapPzkError(status, message)` i dopasować typ do `PzkReviewsErrorVM` (strukturalnie zgodny).

4. **Dodać hook listy recenzji**:
   - utworzyć `src/hooks/pzk/usePzkReviewsList.ts`:
     - stan `items`, `nextCursor`, `sort`, `limit`,
     - `fetchInitial()`, `loadMore()`, `reload()`, `setSort()`,
     - obsługa błędów i abort na unmount (jak `usePzkCatalog`).

5. **Dodać hook “moja recenzja”**:
   - utworzyć `src/hooks/pzk/usePzkMyReview.ts`:
     - `myReview` + `editor`,
     - `reload()`,
     - `upsert()` (PUT) z walidacją klienta i zachowaniem treści przy błędzie,
     - `delete()` (DELETE) z confirm flow (logika confirm w komponencie).

6. **Złożyć widok w `PzkReviewsPage`**:
   - wyrenderować `PzkInternalNav active="reviews"`,
   - lewy panel: `PzkMyReviewPanel`,
   - prawy panel: `PzkReviewsList`,
   - dodać sort selector i “Załaduj więcej”.

7. **Dopracować UX/A11y**:
   - zapewnić focus states (jak w innych PZK komponentach),
   - `fieldset/legend` dla ratingu,
   - `aria-live="polite"` dla komunikatów “Zapisano / Błąd”.

8. **Dodać minimalne testy (rekomendowane)**:
   - E2E (Playwright):
     - pacjent z dostępem: widzi `/pacjent/pzk/recenzje`, może dodać/edytować/usunąć recenzję,
     - pacjent bez dostępu: redirect do `/pzk/kup`,
     - dietetyk: 403.
   - Unit:
     - mapowanie DTO→VM (fallback dla `author.firstName`),
     - walidacja klienta (rating/content).


