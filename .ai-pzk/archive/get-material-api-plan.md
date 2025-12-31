## API Endpoint Implementation Plan: GET `/api/pzk/materials/:materialId`

## 1. Przegląd punktu końcowego

Endpoint `GET /api/pzk/materials/:materialId` zwraca widok pojedynczego materiału PZK w wariancie:

- **unlocked**: materiał ma status `published` i pacjent ma aktywny dostęp do modułu materiału
- **locked**: materiał ma status `published`, ale pacjent **nie** ma dostępu do modułu
- **publish_soon**: materiał ma status `publish_soon` i jest widoczny, ale **nieakcyjny** (zwracamy 200, lecz z zablokowaną treścią)
- **draft/archived**: zawsze **404** (bez ujawniania metadanych)

Najważniejszy wymóg bezpieczeństwa: **brak wycieków metadanych dla `draft` i `archived`** (zachowanie jak „nie istnieje”).

Docelowa lokalizacja pliku endpointu (Astro routing):

- `src/pages/api/pzk/materials/[materialId].ts` → `GET /api/pzk/materials/:materialId`

Konwencje PZK w repo:

- **koperta odpowiedzi**: `ApiResponse<T>` z `src/types/pzk-dto.ts`
- helpery: `ok()` i `ErrorResponses` z `src/lib/pzk/api.ts`
- nagłówki: `Content-Type: application/json` i `Cache-Control: no-store`
- auth: `locals.user` (Lucia) wypełniane przez middleware

---

## 2. Szczegóły żądania

- **Metoda HTTP**: `GET`
- **URL**: `/api/pzk/materials/:materialId`

### Parametry

- **Wymagane**:
  - **`materialId`** (path param): UUID
- **Opcjonalne**:
  - **`include`** (query): string, lista rozdzielona przecinkami z dozwolonych wartości: `pdfs`, `videos`, `note`
    - **domyślnie**: `pdfs,videos,note`
    - **cel**: możliwość wyłączenia kosztownych fragmentów (np. `include=pdfs` bez notatki)

### Request body

- **brak**

---

## 3. Szczegóły odpowiedzi

### Sukces: `200 OK`

Zwracamy `ApiResponse<PzkMaterialDetails>`:

- **unlocked (`published` + dostęp)**:
  - `access.isLocked = false`
  - `ctaUrl = null`
  - `contentMd` może być tekstem lub `null`
  - `pdfs`, `videos`, `note` zgodnie z `include`
- **locked (`published` bez dostępu)**:
  - `access.isLocked = true`
  - `access.reason = "no_module_access"`
  - `access.ctaUrl` zbudowane na bazie konfiguracji CTA (np. `PZK_PURCHASE_LANDING_URL + ?module=2`)
  - `contentMd = null`, `pdfs = []`, `videos = []`, `note = null`
  - rekomendacja: `category = null` (spójność z `PzkMaterialDetails`)
- **publish_soon** (rekomendowane zachowanie):
  - `200`, ale:
    - `access.isLocked = true`
    - `access.reason = "publish_soon"`
    - `ctaUrl = null` (bo to nie jest „brak dostępu”, tylko „wkrótce”)
    - brak treści akcyjnej: `contentMd=null`, `pdfs=[]`, `videos=[]`, `note=null`, `category=null`

### Stany restrykcyjne: `404 Not Found`

- **nie istnieje**
- **status `draft` lub `archived`** (zawsze 404, niezależnie od dostępu pacjenta)

### Błędy

- **`400 Bad Request`**: nieprawidłowy `materialId` (np. nie-UUID) lub nieprawidłowy `include`
- **`401 Unauthorized`**: brak zalogowania (`!locals.user`)
- **`403 Forbidden`**: użytkownik zalogowany, ale rola != `patient`
- **`500 Internal Server Error`**: błąd nieoczekiwany

**Uwaga o 403**: repo ma już `ErrorResponses.FORBIDDEN_PATIENT_ROLE` (PZK), więc plan zakłada konsekwentne użycie tego stylu.

---

## 4. Przepływ danych

### Przepływ wysokiego poziomu (request → response)

- **1) AuthN**: sprawdź `locals.user`
  - brak → `401` (`ErrorResponses.UNAUTHORIZED`)
- **2) AuthZ**: sprawdź rolę `locals.user.role === 'patient'`
  - brak → `403` (`ErrorResponses.FORBIDDEN_PATIENT_ROLE`)
- **3) Walidacja wejścia**:
  - `materialId` jako UUID
  - `include` jako lista dozwolonych tokenów
  - błędy → `400` (`ErrorResponses.BAD_REQUEST(...)`)
- **4) Pobranie materiału** (DB, Drizzle):
  - pobierz materiał + minimalne pola do odpowiedzi (id/module/status/order/title/description/contentMd/categoryId)
  - jeśli brak → `404`
  - jeśli `status in ('draft','archived')` → `404` (bez ujawniania)
- **5) Ocena stanu dostępu**:
  - jeśli `status === 'publish_soon'` → traktuj jako locked (reason `publish_soon`) i **nie pobieraj** PDF/video/note
  - jeśli `status === 'published'`:
    - sprawdź „active module access” pacjenta dla `material.module` (DB: `pzk_module_access`, reguła aktywności identyczna jak w `PzkAccessRepository`)
    - brak → locked (reason `no_module_access`) i **nie pobieraj** PDF/video/note
    - jest → unlocked i pobierz dodatki zależnie od `include`
- **6) Pobranie powiązanych danych (tylko gdy unlocked i include)**:
  - **kategoria**: `pzk_categories` (id/slug/label/displayOrder)
  - **pdfs**: `pzk_material_pdfs` (id/fileName/displayOrder), sort po `display_order`
  - **videos**: `pzk_material_videos` (id/youtubeVideoId/title/displayOrder), sort po `display_order`
  - **note**: `pzk_notes` dla `(userId, materialId)` (content/updatedAt)
- **7) Mapowanie do DTO** (`PzkMaterialDetails`) i `ok(dto)`
- **8) Odpowiedź**: `200` + nagłówki `Content-Type` i `Cache-Control: no-store`

### Proponowany podział odpowiedzialności (warstwy)

- **API route** (`src/pages/api/pzk/materials/[materialId].ts`):
  - AuthN/AuthZ
  - walidacja (Zod)
  - wywołanie serwisu
  - mapowanie błędów na `ErrorResponses` i statusy HTTP
- **Service** (nowy): `src/lib/services/pzkMaterialService.ts`
  - zasady widoczności (`draft/archived` → 404)
  - zasady lock/unlock (access vs status)
  - obsługa `include`
  - budowa `ctaUrl`
  - mapowanie encji DB → `PzkMaterialDetails`
- **Repositories** (nowe, rekomendowane):
  - `src/lib/repositories/pzkMaterialRepository.ts`
  - `src/lib/repositories/pzkMaterialPdfRepository.ts`
  - `src/lib/repositories/pzkMaterialVideoRepository.ts`
  - `src/lib/repositories/pzkNoteRepository.ts`
  - **rozszerzenie istniejącego** `PzkAccessRepository` o metodę szybkiego sprawdzenia dostępu do jednego modułu (szczegóły w krokach implementacji)

---

## 5. Względy bezpieczeństwa

- **Brak wycieku metadanych `draft/archived`**:
  - endpoint nie może zwrócić nawet `title`/`module`/`order` dla tych statusów; zawsze 404
- **IDOR** (Insecure Direct Object Reference) dla notatek:
  - notatka pobierana wyłącznie po `(locals.user.id, materialId)` (nigdy po samym `materialId`)
- **Ukrycie sekretów storage**:
  - endpoint materiału **nigdy** nie zwraca `object_key` z `pzk_material_pdfs`
  - pobranie PDF odbywa się wyłącznie przez osobny endpoint presign (poza zakresem tego planu)
- **Walidacja `include`**:
  - tylko whitelist (`pdfs|videos|note`), aby uniknąć niejawnych rozszerzeń/SSR‑DoS
- **Brak cache**:
  - `Cache-Control: no-store` (dane zależne od usera, notatki prywatne)
- **Ograniczenie enumeracji** (ryzyko przyszłościowe):
  - endpoint przyjmuje UUID, co utrudnia enumerację, ale nie eliminuje jej
  - rozważyć rate limiting / monitoring na poziomie edge (post‑MVP)

---

## 6. Obsługa błędów

### Scenariusze i mapowanie na statusy

- **401 Unauthorized**
  - warunek: `!locals.user`
  - response: `ErrorResponses.UNAUTHORIZED`
- **403 Forbidden**
  - warunek: `locals.user.role !== 'patient'`
  - response: `ErrorResponses.FORBIDDEN_PATIENT_ROLE`
- **400 Bad Request**
  - warunek: `materialId` nie jest UUID
  - warunek: `include` zawiera nieznane tokeny (np. `include=pdfs,secret`)
  - response: `ErrorResponses.BAD_REQUEST(message, details?)`
- **404 Not Found**
  - warunek: brak materiału w DB
  - warunek: `status` = `draft` albo `archived`
  - response: rekomendacja dodania `ErrorResponses.NOT_FOUND` (patrz kroki implementacji)
- **500 Internal Server Error**
  - warunek: wyjątek nieobsłużony (DB/network/bug)
  - response: `ErrorResponses.INTERNAL_SERVER_ERROR`

### Logowanie błędów / observability

W obecnym stylu PZK:

- loguj `console.error('[GET /api/pzk/materials/:materialId] Error:', error)` dla 500 (jak w `access.ts`)

Rekomendacja (MVP+):

- dla `500` dodać wpis do istniejącej tabeli `events` (np. `eventType: 'pzk_material_details_error'` z `properties: { materialId, userId }`)
  - **nie logować** wrażliwych danych (np. treści notatek)

---

## 7. Wydajność

- **Minimalizacja zapytań DB dla locked/publish_soon**:
  - najpierw pobierz materiał i oceń status + dostęp
  - dopiero dla unlocked wykonuj dodatkowe selecty (kategoria, pdfs, videos, note)
- **Parametr `include`**:
  - pozwala pominąć np. `note` (często najrzadziej potrzebne) i zmniejszyć czas odpowiedzi
- **Spójny „now”**:
  - użyj jednej wartości `now = new Date()` w całym request, aby uniknąć edge‑case’ów czasowych w ocenie aktywności dostępu
- **Indeksy**:
  - `pzk_materials` ma indeks `idx_pzk_materials_status_module` pod listowanie; dla `GET by id` kluczowe jest PK
  - `pzk_material_pdfs/material_videos` mają indeks po `material_id`
  - `pzk_notes` ma unique `(user_id, material_id)` (szybkie pobranie)

---

## 8. Kroki implementacji

### 8.1. Pliki i artefakty do dodania/zmiany

- **Nowy endpoint**:
  - `src/pages/api/pzk/materials/[materialId].ts`
- **Nowy serwis**:
  - `src/lib/services/pzkMaterialService.ts`
- **Nowe repozytoria** (rekomendowane):
  - `src/lib/repositories/pzkMaterialRepository.ts`
  - `src/lib/repositories/pzkMaterialPdfRepository.ts`
  - `src/lib/repositories/pzkMaterialVideoRepository.ts`
  - `src/lib/repositories/pzkNoteRepository.ts`
- **Rozszerzenie**:
  - `src/lib/repositories/pzkAccessRepository.ts` o metodę typu:
    - `hasActiveAccessToModule(userId: string, module: 1|2|3, now: Date): Promise<boolean>`
    - albo `getActiveModules(userId, now) → Set<module>` (w zależności od preferencji)
- **Uzupełnienie helperów błędów PZK**:
  - `src/lib/pzk/api.ts`: dodać `ErrorResponses.NOT_FOUND` (oraz ewentualnie `ErrorResponses.FORBIDDEN` ogólny, jeśli planujecie więcej ról)
- **Konfiguracja CTA** (MVP):
  - dodać env:
    - `PZK_PURCHASE_LANDING_URL` (np. `https://example.com/pzk`)
    - opcjonalnie `PZK_PURCHASE_PARAM_NAME` (domyślnie `module`)
  - udokumentować w README lub `.env.example` (jeśli istnieje w repo)

### 8.2. Walidacja (Zod) w API route

- **Path param**:
  - `materialId`: `z.string().uuid()`
- **Query param `include`**:
  - dopuszczalne tokeny: `pdfs`, `videos`, `note`
  - normalizacja:
    - brak → domyślne `['pdfs','videos','note']`
    - split po `,`, trim, filter(Boolean), deduplikacja
  - błąd → `400` z komunikatem (spójnie z `catalog.ts`)

Rekomendacja: zwrócić `400` z `ErrorResponses.BAD_REQUEST('Nieprawidłowe parametry zapytania', { field: 'include' })`.

### 8.3. Implementacja logiki w `PzkMaterialService`

Implementować metodę w stylu:

- `getMaterialDetails(params: { userId: string; materialId: string; include: { pdfs: boolean; videos: boolean; note: boolean }; now?: Date }): Promise<PzkMaterialDetails>`

Zasady:

- jeśli materiał nie istnieje → rzucić błąd domenowy (np. `NotFoundError`) albo zwrócić `null` i mapować do 404 w API route
- jeśli `status` = `draft|archived` → **zachować się jak not found**
- jeśli `status` = `publish_soon` → zwrócić 200/locked (reason `publish_soon`), bez pobierania dodatków
- jeśli `status` = `published`:
  - sprawdzić dostęp do modułu
  - brak dostępu → zwrócić 200/locked (reason `no_module_access`) bez dodatków
  - dostęp → pobrać dodatki zależnie od `include`
- zawsze zwracać stały kształt pól:
  - `pdfs: []` i `videos: []` gdy locked albo `include` wyklucza
  - `note: null` gdy locked albo `include` wyklucza albo brak rekordu
  - `category: null` gdy locked albo `include` wyklucza (opcjonalnie), w unlocked zawsze zwracać

### 8.4. Implementacja repozytoriów (DB)

Minimalny zestaw zapytań:

- `pzkMaterialRepository.getById(materialId)` → `{ id, module, categoryId, status, order, title, description, contentMd } | null`
- `pzkCategoryRepository.getById(categoryId)` → `{ id, slug, label, displayOrder }`
  - (może być w `pzkMaterialRepository.getWithCategoryById` jako join)
- `pzkMaterialPdfRepository.listByMaterialId(materialId)` → `[{ id, fileName, displayOrder }]`
- `pzkMaterialVideoRepository.listByMaterialId(materialId)` → `[{ id, youtubeVideoId, title, displayOrder }]`
- `pzkNoteRepository.getByUserAndMaterial(userId, materialId)` → `{ content, updatedAt } | null`

### 8.5. Implementacja endpointu `GET` (API route)

Skeleton zgodny z istniejącymi PZK endpointami:

- `export const prerender = false`
- `export const GET: APIRoute = async ({ locals, params, url }) => { ... }`
- nagłówki w każdym return:
  - `Content-Type: application/json`
  - `Cache-Control: no-store`

Mapowanie wyników:

- sukces → `new Response(JSON.stringify(ok(dto)), { status: 200, headers })`
- 404 → `new Response(JSON.stringify(ErrorResponses.NOT_FOUND), { status: 404, headers })`
- walidacja → `ErrorResponses.BAD_REQUEST(...)` z `status: 400`
- wyjątek → `ErrorResponses.INTERNAL_SERVER_ERROR` z `status: 500`

### 8.6. Testy (rekomendacja dla zespołu)

- **Unit** (`vitest`):
  - `PzkMaterialService`:
    - `draft/archived` → not found
    - `publish_soon` → locked reason `publish_soon`
    - `published` + brak dostępu → locked reason `no_module_access`
    - `published` + dostęp → unlocked + include działa selektywnie
- **Integration** (DB test):
  - poprawne sortowanie `pdfs/videos` po `display_order`
  - `note` tylko dla ownera
- **E2E (Playwright)**:
  - pacjent bez dostępu: widzi tytuł/opis, ale brak treści i dodatków; CTA poprawne
  - pacjent z dostępem: widzi treść + dodatki; notatka wczytywana
  - `draft/archived`: 404 (UI: „nie znaleziono”)


