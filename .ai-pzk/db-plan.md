# Schemat bazy danych PostgreSQL — PZK (Przestrzeń Zdrowej Kobiety)

Poniższy schemat jest zaprojektowany pod istniejący stack: **PostgreSQL + Drizzle ORM** (`src/db/schema.ts`) oraz istniejące tabele `users` i `events`. Nazewnictwo i typy są dopasowane do aktualnych konwencji repozytorium (UUID PK, `snake_case`, `timestamp with time zone`).

---

## 1. Lista tabel (kolumny, typy, ograniczenia)

### 1.1. `pzk_categories`

Stała lista kategorii (zarządzana ręcznie w DB w MVP), z twardą kolejnością wyświetlania.

- **`id`**: `uuid` **PK**, default `gen_random_uuid()`
- **`slug`**: `varchar(80)` **NOT NULL**, **UNIQUE**
  - stabilny identyfikator techniczny kategorii (np. `start`, `hormony`, `jelita`)
- **`label`**: `varchar(160)` **NOT NULL**
  - etykieta do UI (PL)
- **`description`**: `text` NULL
- **`display_order`**: `integer` **NOT NULL**
  - **CHECK** (`display_order > 0`)
  - **UNIQUE** (twarda kolejność bez duplikatów)
- **`created_at`**: `timestamptz` **NOT NULL**, default `now()`
- **`updated_at`**: `timestamptz` **NOT NULL**, default `now()`

**Uwagi**:
- Kategorie są “globalne” (niezależne od modułu). Materiały wiążą się z kategorią przez FK.

---

### 1.2. `pzk_materials`

Materiał edukacyjny w PZK. Może łączyć wiele typów treści: **wiele PDF**, **wiele filmów (YouTube)** oraz treść Markdown.

- **`id`**: `uuid` **PK**, default `gen_random_uuid()`
- **`module`**: `smallint` **NOT NULL**
  - **CHECK** (`module IN (1,2,3)`)
- **`category_id`**: `uuid` **NOT NULL**, **FK** → `pzk_categories(id)` **ON DELETE RESTRICT**
- **`status`**: `varchar(20)` **NOT NULL**
  - dozwolone wartości: `draft`, `published`, `archived`, `publish_soon`
  - **CHECK** (`status IN ('draft','published','archived','publish_soon')`)
- **`order`**: `integer` **NOT NULL**
  - ręczna kolejność w obrębie `(module, category)`
  - **CHECK** (`order > 0`)
- **`title`**: `varchar(200)` **NOT NULL**
- **`description`**: `text` NULL
- **`content_md`**: `text` NULL
  - treść autora w Markdown (opcjonalna)
- **`created_at`**: `timestamptz` **NOT NULL**, default `now()`
- **`updated_at`**: `timestamptz` **NOT NULL**, default `now()`

**Ograniczenia unikalności**:
- **UNIQUE** (`module`, `category_id`, `order`)

**Zasady widoczności (kontrakt aplikacji)**:
- Na listach dla pacjenta zwracane są wyłącznie `published` oraz `publish_soon`.
- Dla `draft` i `archived` aplikacja powinna zachowywać się jak dla “braku zasobu” (np. 404), bez ujawniania metadanych.

---

### 1.3. `pzk_material_pdfs`

Lista plików PDF przypiętych do materiału (0..N). Każdy PDF jest osobnym obiektem w storage (S3/R2).

- **`id`**: `uuid` **PK**, default `gen_random_uuid()`
- **`material_id`**: `uuid` **NOT NULL**, **FK** → `pzk_materials(id)` **ON DELETE CASCADE**
- **`object_key`**: `text` **NOT NULL**
  - klucz obiektu w storage (S3/R2); prywatny bucket
- **`file_name`**: `varchar(255)` NULL
  - sugerowana nazwa pliku do `Content-Disposition`
- **`content_type`**: `varchar(100)` NULL
  - opcjonalnie, np. `application/pdf` (jeśli chcecie wymuszać nagłówki na presign)
- **`display_order`**: `integer` **NOT NULL**
  - ręczna kolejność wyświetlania w obrębie materiału
  - **CHECK** (`display_order > 0`)
- **`created_at`**: `timestamptz` **NOT NULL**, default `now()`
- **`updated_at`**: `timestamptz` **NOT NULL**, default `now()`

**Ograniczenia unikalności**:
- **UNIQUE** (`material_id`, `display_order`)
- (opcjonalnie) **UNIQUE** (`material_id`, `object_key`)

---

### 1.4. `pzk_material_videos`

Lista filmów (YouTube) przypiętych do materiału (0..N).

- **`id`**: `uuid` **PK**, default `gen_random_uuid()`
- **`material_id`**: `uuid` **NOT NULL**, **FK** → `pzk_materials(id)` **ON DELETE CASCADE**
- **`youtube_video_id`**: `varchar(32)` **NOT NULL**
  - ID filmu (nie URL); embed po ID
- **`title`**: `varchar(200)` NULL
  - opcjonalny tytuł do UI (jeśli nie chcecie go pobierać z YouTube)
- **`display_order`**: `integer` **NOT NULL**
  - ręczna kolejność wyświetlania w obrębie materiału
  - **CHECK** (`display_order > 0`)
- **`created_at`**: `timestamptz` **NOT NULL**, default `now()`
- **`updated_at`**: `timestamptz` **NOT NULL**, default `now()`

**Ograniczenia unikalności**:
- **UNIQUE** (`material_id`, `display_order`)
- (opcjonalnie) **UNIQUE** (`material_id`, `youtube_video_id`)

---

### 1.5. `pzk_module_access`

Dostęp pacjenta do modułu 1/2/3. W MVP nadawany ręcznie w DB.

- **`id`**: `uuid` **PK**, default `gen_random_uuid()`
- **`user_id`**: `uuid` **NOT NULL**, **FK** → `users(id)` **ON DELETE CASCADE**
- **`module`**: `smallint` **NOT NULL**
  - **CHECK** (`module IN (1,2,3)`)
- **`start_at`**: `timestamptz` **NOT NULL**
  - data startu dostępu (manual)
- **`expires_at`**: `timestamptz` **NOT NULL**
  - rekomendacja operacyjna: przechowywać jawnie, żeby unikać warunków typu `start_at + interval '12 months' > now()` w zapytaniach i móc indeksować po dacie
  - **CHECK** (`expires_at > start_at`)
- **`revoked_at`**: `timestamptz` NULL
  - cofnięcie dostępu bez kasowania rekordu (przyszłościowe, zgodnie z notatkami)
- **`created_at`**: `timestamptz` **NOT NULL**, default `now()`
- **`updated_at`**: `timestamptz` **NOT NULL**, default `now()`

**Ograniczenia unikalności**:
- **UNIQUE** (`user_id`, `module`, start_at)


**Uwagi implementacyjne**:
- Przy insert/aktualizacji rekomendowane jest ustawianie `expires_at = start_at + interval '12 months'` (w aplikacji i/lub przez trigger w migracji).

---

### 1.6. `pzk_notes`

Prywatne notatki pacjenta do materiału (1 notatka na parę `(user, material)`).

- **`id`**: `uuid` **PK**, default `gen_random_uuid()`
- **`user_id`**: `uuid` **NOT NULL**, **FK** → `users(id)` **ON DELETE CASCADE**
- **`material_id`**: `uuid` **NOT NULL**, **FK** → `pzk_materials(id)` **ON DELETE CASCADE**
- **`content`**: `text` **NOT NULL**
- **`created_at`**: `timestamptz` **NOT NULL**, default `now()`
- **`updated_at`**: `timestamptz` **NOT NULL**, default `now()`

**Ograniczenia unikalności**:
- **UNIQUE** (`user_id`, `material_id`)

---

### 1.7. `pzk_reviews`

Recenzje PZK: maksymalnie 1 recenzja na pacjenta, skala 1–6.

- **`id`**: `uuid` **PK**, default `gen_random_uuid()`
- **`user_id`**: `uuid` **NOT NULL**, **FK** → `users(id)` **ON DELETE CASCADE**
- **`rating`**: `smallint` **NOT NULL**
  - **CHECK** (`rating BETWEEN 1 AND 6`)
- **`content`**: `text` **NOT NULL**
- **`created_at`**: `timestamptz` **NOT NULL**, default `now()`
- **`updated_at`**: `timestamptz` **NOT NULL**, default `now()`

**Ograniczenia unikalności**:
- **UNIQUE** (`user_id`)

**Uwagi**:
- Imię autora do UI pochodzi z `users.first_name` (join w zapytaniu / widoku API).
- Usunięcie recenzji w MVP: **hard delete** (po usunięciu user może dodać ponownie).

---

### 1.8. Wykorzystanie istniejącej tabeli `events` (bez nowych tabel logów)

Zgodnie z notatkami, “minimum observability” dla presigned URL realizujemy przez istniejącą tabelę:

- `events.event_type`:
  - `pzk_pdf_presign_success`
  - `pzk_pdf_presign_error`
  - `pzk_pdf_presign_forbidden`
- `events.properties` (JSONB) — rekomendowane klucze:
  - `materialId` (uuid jako string)
  - `pdfId` (uuid jako string) — dla presign konkretnego PDF (przy wielu PDF na materiał)
  - `module` (1/2/3)
  - `ttlSeconds` (60)
  - `reason` (np. `no_access`, `material_not_found`, `storage_error`, `invalid_state`)
  - `storageProvider` (np. `r2`, `s3`) — opcjonalnie

---

## 2. Relacje między tabelami (kardynalność)

- `users` **1 — N** `pzk_module_access`
  - jeden użytkownik może mieć dostępy do wielu modułów; dopuszczona jest też **historia dostępów per moduł** (np. kolejne starty w czasie)
- `pzk_categories` **1 — N** `pzk_materials`
  - jedna kategoria zawiera wiele materiałów; materiał ma dokładnie jedną kategorię
- `pzk_materials` (moduł) — wartość skalarna `module` (1/2/3), bez osobnej tabeli modułów (zgodnie z decyzją o stałych modułach)
- `pzk_materials` **1 — N** `pzk_material_pdfs`
  - materiał może mieć 0..N PDF; każdy PDF jest niezależnym obiektem w storage
- `pzk_materials` **1 — N** `pzk_material_videos`
  - materiał może mieć 0..N filmów; filmy są embedowane po `youtube_video_id`
- `users` **1 — N** `pzk_notes`
  - użytkownik może mieć wiele notatek (po jednej na materiał)
- `pzk_materials` **1 — N** `pzk_notes`
  - materiał może mieć wiele notatek (od różnych użytkowników)
- `users` **1 — 1** `pzk_reviews`
  - jeden użytkownik ma maksymalnie jedną recenzję (UNIQUE na `user_id`)
- `events` opcjonalnie wiąże się z `users` (już istnieje FK `events.user_id → users.id`)
  - presign logi PZK są identyfikowane po `event_type` oraz `properties.materialId` i `properties.pdfId`

---

## 3. Indeksy (wydajność)

### 3.1. `pzk_categories`

- `UNIQUE (slug)`
- `UNIQUE (display_order)`
- (opcjonalnie) `INDEX (display_order)` — zwykle zbędne, bo unikat już indeksuje; zostawić tylko jeśli planujecie częste zakresy.

### 3.2. `pzk_materials`

Krytyczne ścieżki: listowanie w module po kategoriach i `order`, filtrowanie po statusie.

- `UNIQUE (module, category_id, order)` — gwarantuje deterministyczną kolejność
- `INDEX (status, module, category_id, order)`
  - typowy query: `WHERE module = $1 AND status IN ('published','publish_soon') ORDER BY category.display_order, materials.order`
- (opcjonalnie) `INDEX (module, category_id)` jeśli często pobieracie całe kategorie bez statusu (np. operacje)

### 3.3. `pzk_material_pdfs`

- `UNIQUE (material_id, display_order)` (implikuje indeks)
- (opcjonalnie) `UNIQUE (material_id, object_key)` (implikuje indeks)
- `INDEX (material_id)`

### 3.4. `pzk_material_videos`

- `UNIQUE (material_id, display_order)` (implikuje indeks)
- (opcjonalnie) `UNIQUE (material_id, youtube_video_id)` (implikuje indeks)
- `INDEX (material_id)`

### 3.5. `pzk_module_access`

Krytyczne ścieżki: szybkie sprawdzenie dostępu per `(user, module)` i “czy ma jakikolwiek aktywny dostęp”.

- `UNIQUE (user_id, module, start_at)` (implikuje indeks)
- `INDEX (user_id, expires_at)` — wspiera query “czy user ma jakikolwiek aktywny dostęp”: `WHERE user_id = $1 AND revoked_at IS NULL AND now() < expires_at`
- `INDEX (user_id, revoked_at)` — opcjonalnie, jeśli często filtrujecie po revoked

### 3.6. `pzk_notes`

- `UNIQUE (user_id, material_id)` (implikuje indeks)
- `INDEX (material_id)` — opcjonalnie (diagnostyka/operacje), zwykle niepotrzebne w MVP

### 3.7. `pzk_reviews`

- `UNIQUE (user_id)` (implikuje indeks)
- (opcjonalnie) `INDEX (created_at DESC)` jeśli często stronicujecie recenzje po dacie

### 3.8. `events` (istniejące)

Jeśli raportowanie presign ma być realnie używane operacyjnie, rekomendowane jest dodanie indeksów pod filtrowanie po `event_type` + czasie:

- `INDEX (event_type, timestamp DESC)`

*(To jest zmiana istniejącej tabeli, nie nowa encja PZK.)*

---


## 5. Dodatkowe uwagi / decyzje projektowe

- **Normalizacja (3NF)**: encje są rozdzielone (kategorie, materiały, dostęp, notatki, recenzje). Brak denormalizacji poza świadomym przechowywaniem `expires_at` (wydajność i prostota zapytań).
- **Moduły jako `smallint`**: zgodnie z decyzją “stałe 1/2/3” — bez tabeli `pzk_modules` (mniej joinów, prostsze constraints).
- **Brak RLS w MVP**: bezpieczeństwo egzekwowane w serwisach/API; DB wzmacnia integralność przez FK/unikaty/CHECK.
- **Draft/archived bez wycieku danych**: kluczowe jest zachowanie w warstwie API (404/NotFound) — DB nie powinna udostępniać “publicznych” widoków bez filtrów, jeśli query będą współdzielone.
- **Observability**: presign logi w `events` spełniają MVP. “Download success” pozostaje best-effort (presign success/failure/forbidden); realne potwierdzenie pobrania wymaga access logs storage lub proxy-download.


