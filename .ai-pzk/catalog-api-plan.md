## API Endpoint Implementation Plan: GET `/api/pzk/catalog`

## 1. Przegląd punktu końcowego

Endpoint `GET /api/pzk/catalog` zwraca katalog PZK (Przestrzeń Zdrowej Kobiety) pogrupowany hierarchicznie jako **moduły → kategorie → materiały**, przeznaczony do UI pacjenta.

- **Cel**: zasilić UI listy materiałów informacją o dostępności (locked), aktywności modułów (czy pacjent ma aktywny dostęp do modułu), oraz wygenerować link CTA zakupu dla zablokowanych materiałów.
- **Kontrakt odpowiedzi**: koperta `ApiResponse<T>` z `src/types/pzk-dto.ts` (tj. `{ data: ..., error: null }` lub `{ data: null, error: { code, message, details? } }`).
- **AuthN/AuthZ**:
  - **401 Unauthorized**: brak sesji (`locals.user` nieustawione przez middleware Lucii).
  - **403 Forbidden**: użytkownik zalogowany, ale nie ma roli `patient`.
  - **Ważne**: katalog jest dostępny także dla pacjenta bez aktywnego dostępu do modułów (wtedy materiały `published` będą locked, `publish_soon` zawsze locked).

### Kluczowe reguły biznesowe (ze specyfikacji)

- **Widoczność**: zwracaj wyłącznie materiały o statusie `published` i/lub `publish_soon` (domyślnie oba).
- **`published`**:
  - jeśli pacjent **nie ma aktywnego dostępu** do modułu materiału → `isLocked: true`, `isActionable: false`, `ctaUrl: <purchaseUrl>?module=<n>`
  - jeśli pacjent **ma aktywny dostęp** → `isLocked: false`, `isActionable: true`, `ctaUrl: null`
- **`publish_soon`**:
  - zawsze `isLocked: true`, `isActionable: false`, `ctaUrl: null` (materiał widoczny, ale nieklikalny)
- **Sortowanie**:
  - kategorie: `display_order ASC`
  - materiały: `order ASC` w obrębie `(module, category)`
- **Wydajność**: jedna kwerenda (lub mała, ograniczona liczba kwerend) + grupowanie in-memory.

## 2. Szczegóły żądania

- **Metoda HTTP**: `GET`
- **Ścieżka**: `/api/pzk/catalog`
- **Request body**: brak
- **Wymagane parametry**: brak
- **Opcjonalne parametry query** (wg spec):
  - **`modules`**: string, lista rozdzielona przecinkami, np. `1,2,3` (filtr modułów)
  - **`includeStatuses`**: string, lista rozdzielona przecinkami, domyślnie `published,publish_soon` (filtr statusów; dozwolone tylko te 2 wartości dla katalogu pacjenta)
  - **`locale`**: string (np. `pl`) – w MVP ignorowany w logice danych, ale akceptowany/parsowany (przyszłe i18n)

### Walidacja wejścia (Zod)

Walidacja musi być spójna z wymaganymi kodami statusów:

- **400 Bad Request** dla nieprawidłowych wartości query (np. `modules=4`, `includeStatuses=draft`).
- Brak parametru = wartości domyślne.

Proponowany model walidacji (logika, nie kod):

- `modules`:
  - `undefined` → `[1,2,3]` (albo „bez filtra”)
  - string → split po `,`, trim, odrzuć puste segmenty
  - każda wartość musi być w `{1,2,3}`
  - opcjonalnie: deduplikuj i posortuj
- `includeStatuses`:
  - `undefined` → `['published','publish_soon']`
  - każda wartość musi być w `{'published','publish_soon'}`
  - jeśli po filtracji lista jest pusta → **400** (brak sensu odpowiedzi)
- `locale`:
  - `undefined` → `'pl'` (domyślnie)
  - w MVP: ogranicz do krótkiego stringa (np. max 10) i traktuj jako informację diagnostyczną, bez wpływu na DB query

### Wykorzystywane typy (DTO i modele wewnętrzne)

DTO z `src/types/pzk-dto.ts`:

- **`ApiResponse<T>`**, **`ApiError`**
- **`PzkCatalog`**, **`PzkPurchaseCta`**
- **`PzkCatalogModule`**, **`PzkCatalogCategory`**, **`PzkCatalogMaterial`**
- **`PzkCatalogQueryParams`** (pomocniczo jako „shape” parametrów)
- **`PzkModuleNumber`**, **`PzkMaterialStatus`** (`'draft'|'published'|'archived'|'publish_soon'`)

Command modele:

- Ten endpoint jest tylko-odczytowy, więc **nie tworzy command modeli mutacji**.
- Wewnątrz implementacji warto wprowadzić lekkie modele wewnętrzne:
  - **`GetPzkCatalogQuery`**: `{ modules: PzkModuleNumber[]; includeStatuses: Array<'published'|'publish_soon'>; locale: string }`
  - **`PzkCatalogRow`** (wynik repo): pojedynczy rekord „spłaszczony” z joinów + agregacje `hasPdf/hasVideos`

## 3. Szczegóły odpowiedzi

### Sukces — 200 OK

Zwracaj `ApiResponse<PzkCatalog>`:

- `data.purchaseCta.baseUrl`: URL landing page zakupu (konfigurowalny)
- `data.purchaseCta.paramName`: zwykle `"module"`
- `data.modules[]`:
  - `module`: `1|2|3`
  - `isActive`: czy użytkownik ma **aktywny** dostęp do modułu (na `now`)
  - `categories[]`:
    - pola z tabeli `pzk_categories` + `materials[]`
  - `materials[]`:
    - `hasPdf`, `hasVideos`: bool na bazie istnienia rekordów w `pzk_material_pdfs` / `pzk_material_videos`
    - `isLocked`, `isActionable`, `ctaUrl`: obliczone wg reguł biznesowych

### Błędy

Wszystkie błędy zwracają kopertę `ApiResponse<null>`:

- **400 Bad Request**: walidacja query nie przeszła (`error.code = 'validation_error'`)
- **401 Unauthorized**: `locals.user` brak (`error.code = 'unauthorized'`)
- **403 Forbidden**: rola inna niż `patient` (`error.code = 'forbidden'`)
- **500 Internal Server Error**: błąd nieoczekiwany (`error.code = 'internal_server_error'`)

Uwaga spójności: istniejące PZK endpointy korzystają z helperów z `src/lib/pzk/api.ts` (`ok()`, `fail()`, `ErrorResponses`). Dla `400` należy dodać analogiczny, standardowy response (patrz „Kroki implementacji”).

## 4. Przepływ danych

### 4.1. Kontrola dostępu (middleware → endpoint)

1. Middleware auth (Lucia) ustawia `locals.user` (patrz istniejące endpointy np. `src/pages/api/pzk/access.ts`).
2. Endpoint:
   - jeśli `!locals.user` → zwróć **401**
   - jeśli `locals.user.role !== 'patient'` → zwróć **403**

### 4.2. Ustalenie „now” i aktywnych modułów

1. Ustal pojedynczy timestamp `now = new Date()` na cały request (spójność logiczna).
2. Pobierz aktywne moduły pacjenta przez istniejącą warstwę:
   - preferowane: `PzkAccessRepository.listActiveAccessByUserId(userId, now)` i zmapowanie do `Set<module>`
   - alternatywnie: `PzkAccessService.getAccessSummary(userId, now)` i wzięcie `activeModules`

Wynik: `activeModulesSet` do obliczeń `isActive` i `isLocked` dla `published`.

### 4.3. Pobranie katalogu (repozytorium)

W repozytorium katalogu wykonaj jedną kwerendę (lub małą liczbę kwerend) opartą o `pzk_materials` + `pzk_categories`, z uwzględnieniem filtrów:

- `WHERE pzk_materials.status IN includeStatuses`
- `AND pzk_materials.module IN modules` (jeśli filtr podany)
- `JOIN pzk_categories ON pzk_materials.category_id = pzk_categories.id`
- `ORDER BY pzk_materials.module ASC, pzk_categories.display_order ASC, pzk_materials.order ASC`

Wyliczenie `hasPdf` / `hasVideos`:

- Opcja A (jedna kwerenda): `LEFT JOIN` na `pzk_material_pdfs` i `pzk_material_videos` + agregacja `COUNT(...) > 0` per `material_id` (uwaga na mnożenie wierszy; preferuj pre-agregacje/subquery).
- Opcja B (2–3 kwerendy bounded):
  - kwerenda 1: lista materiałów + kategorie (bez joinów do pdf/video)
  - kwerenda 2: `SELECT material_id, true as hasPdf FROM pzk_material_pdfs WHERE material_id IN (...) GROUP BY material_id`
  - kwerenda 3: analogicznie dla video
  - potem merge in-memory

W MVP rekomendacja: **Opcja A z subquery agregującym** (czytelna i stabilna wydajnościowo) lub **Opcja B** jeśli Drizzle/SQL ma być maksymalnie prosty.

### 4.4. Grupowanie in-memory i mapowanie do DTO

Po pobraniu „spłaszczonych” rekordów:

1. Zainicjalizuj `modulesMap` dla modułów (1–3 lub tylko przefiltrowanych).
2. Dla każdej krotki (material + category + flags):
   - dodaj/odszukaj moduł w mapie, ustaw:
     - `module`
     - `isActive = activeModulesSet.has(module)`
   - dodaj/odszukaj kategorię w mapie modułu (klucz: `category.id`), ustaw pola kategorii
   - zbuduj `PzkCatalogMaterial`:
     - `status` z DB (`published`/`publish_soon`)
     - jeśli `status === 'publish_soon'`:
       - `isLocked=true`, `isActionable=false`, `ctaUrl=null`
     - jeśli `status === 'published'`:
       - `isLocked = !activeModulesSet.has(module)`
       - `isActionable = activeModulesSet.has(module)`
       - `ctaUrl = isLocked ? buildPurchaseUrl(module) : null`
     - `hasPdf`, `hasVideos` z agregacji/merge
   - dodaj materiał do `category.materials`
3. Na końcu zamień mapy na tablice:
   - kategorie w kolejności `displayOrder ASC`
   - moduły w kolejności `module ASC`

Decyzja dot. „pustych kategorii”:

- Domyślnie: **zwracaj tylko kategorie, które mają co najmniej 1 materiał** spełniający filtry (mniejsze payloady, prostsze UI).
- Jeśli UI wymaga pełnej listy kategorii zawsze: dodaj opcję w przyszłości (np. `includeEmptyCategories=true`) i osobną kwerendę po kategoriach.

### 4.5. Konfiguracja CTA

`purchaseCta` nie pochodzi z DB w MVP — powinna być konfigurowana env:

- `PUBLIC_PZK_PURCHASE_CTA_BASE_URL` (np. `https://example.com/pzk`)
- `PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME` (domyślnie `module`)

Budowanie `ctaUrl`:

- `ctaUrl = baseUrl + '?' + paramName + '=' + module`
- Należy użyć `new URL(baseUrl)` oraz `url.searchParams.set(paramName, String(module))`, aby poprawnie obsłużyć istniejące query w `baseUrl`.

## 5. Względy bezpieczeństwa

- **Autoryzacja roli**: endpoint dostępny tylko dla roli `patient` (403 dla innych).
- **Brak wycieku draft/archived**: nawet jeśli ktoś poda `includeStatuses=draft`, walidacja ma to odrzucić (400); dodatkowo repozytorium może hard-limitować statusy do dozwolonych.
- **Kontrola „locked state”**: nie wolno traktować katalogu jako autoryzacji do treści. Katalog może ujawniać tytuł/opis `published` nawet gdy locked (zgodnie ze specyfikacją), ale szczegóły materiału i presign muszą mieć osobne guardy.
- **Bezpieczna konstrukcja CTA**: tylko z zaufanego env; nie echo-uj arbitralnych URL-i od klienta.
- **Cache**: odpowiedź zależy od użytkownika (isActive/isLocked), więc ustaw:
  - `Cache-Control: no-store` (spójnie z `src/pages/api/pzk/access.ts`)
- **Rate limiting**: endpoint jest read-only; w MVP można pominąć, ale rozważyć później limitowanie publicznych endpointów API.

## 6. Obsługa błędów

### Scenariusze błędów i statusy

- **401 Unauthorized**
  - warunek: `locals.user` brak
  - body: `ErrorResponses.UNAUTHORIZED`
- **403 Forbidden**
  - warunek: `locals.user.role !== 'patient'`
  - body: `ErrorResponses.FORBIDDEN_PATIENT_ROLE`
- **400 Bad Request**
  - warunek: nieprawidłowe query (np. `modules=0`, `includeStatuses=archived`)
  - body: `fail('validation_error', 'Nieprawidłowe parametry zapytania', { ... })`
  - `details` (zalecane): np. `{ field: 'modules', reason: 'allowed: 1,2,3' }` lub lista błędów z Zod
- **500 Internal Server Error**
  - warunek: nieobsłużony wyjątek (DB error, błąd mapowania)
  - body: `ErrorResponses.INTERNAL_SERVER_ERROR`

### Logowanie błędów (observability)

Repo ma `events` (analytics/logi). Dla tego endpointu minimalnie:

- `console.error('[GET /api/pzk/catalog] Error:', error)` dla 500 (zgodnie z istniejącym stylem PZK).

Opcjonalnie (jeśli zespół chce mierzyć stabilność):

- zapis do `events` z `eventType='pzk_catalog_error'` oraz `properties` (np. `{ userId, modules, includeStatuses }`) — tylko jeśli nie zwiększa ryzyka PII i ma sens produktowy.

## 7. Wydajność

- **Indeksy**:
  - `pzk_materials(status, module, category_id, order)` — wspiera filtr status+module i sortowanie
  - `pzk_categories(display_order)` (unikalność/order)
  - `pzk_material_pdfs(material_id)` / `pzk_material_videos(material_id)` — szybkie wyliczanie `hasPdf/hasVideos`
- **Kwerendy**:
  - docelowo 2 kwerendy bounded:
    - aktywne moduły usera (z `pzk_module_access`), z filtrem na `now`
    - katalog (materiały+Kategorie+agregacje pdf/video) z filtrami status/module
- **Unikanie N+1**: nie pobieraj PDF/video per materiał osobnymi zapytaniami; użyj agregacji/subquery lub zbiorczego IN.
- **Payload**: domyślnie zwracaj tylko kategorie zawierające materiały spełniające filtry.

## 8. Kroki implementacji

1. **Utwórz plik endpointu**: `src/pages/api/pzk/catalog.ts`
   - `export const prerender = false`
   - nagłówki: `Content-Type: application/json`, `Cache-Control: no-store`
   - guardy: 401 (brak `locals.user`), 403 (rola != patient)
2. **Dodaj walidację query w endpointcie (Zod)**
   - parsuj `modules`, `includeStatuses`, `locale`
   - na błąd walidacji zwróć **400** w kopercie PZK
3. **Rozszerz helpery PZK dla 400**
   - w `src/lib/pzk/api.ts` dodaj standardową odpowiedź np. `ErrorResponses.BAD_REQUEST` (albo dedykowaną funkcję tworzącą validation error z details)
4. **Dodaj konfigurację CTA**
   - np. `src/lib/pzk/config.ts` (lub bezpośrednio w serwisie) z odczytem:
     - `import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL`
     - `import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME ?? 'module'`
   - dodaj fallbacki (bezpieczne) na środowiska dev/test
5. **Utwórz repozytorium katalogu**: `src/lib/repositories/pzkCatalogRepository.ts`
   - metoda: `listCatalogRows(query, now)` zwracająca spłaszczone rekordy (kategorie+materiały+hasPdf/hasVideos)
6. **Utwórz serwis katalogu**: `src/lib/services/pzkCatalogService.ts`
   - odpowiedzialność:
     - pobranie aktywnych modułów (reuse `PzkAccessRepository`/`PzkAccessService`)
     - pobranie danych katalogu (repozytorium katalogu)
     - mapowanie + grupowanie do `PzkCatalog`
     - konstrukcja CTA URL
7. **Zintegruj endpoint z serwisem**
   - w endpointcie zainicjalizuj serwis analogicznie do `src/pages/api/pzk/access.ts` (`new ...Service(db)`)
   - zwróć `ok(catalogDto)` z kodem **200**
8. **Testy (zalecane)**
   - **unit**: parser query (`modules`, `includeStatuses`) i logika `isLocked/isActionable/ctaUrl`
   - **integration** (DB testcontainers): seed minimalny `pzk_categories`, `pzk_materials`, `pzk_module_access`, `pzk_material_pdfs/videos` i asercje:
     - `publish_soon` zawsze locked
     - `published` locked zależnie od dostępu
     - sortowanie kategorii i materiałów
9. **Checklist wdrożeniowy**
   - upewnij się, że migracje dla PZK są zastosowane na środowisku docelowym
   - skonfiguruj `PUBLIC_PZK_PURCHASE_CTA_BASE_URL` na Vercel
   - zweryfikuj, że endpoint nie cache’uje odpowiedzi (nagłówki)


