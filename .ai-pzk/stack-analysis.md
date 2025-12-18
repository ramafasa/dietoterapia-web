# Stack analysis vs PRD: PZK (Przestrzeń Zdrowej Kobiety)

## 1) Aktualny stos technologiczny (stan projektu)

### Aplikacja / runtime
- **Astro 5 (SSR)**, `output: 'server'`, **adapter Vercel** (`@astrojs/vercel`) — aplikacja działa jako SSR + funkcje serverless.
- UI: **Astro + React 19** (`@astrojs/react`, `react`, `react-dom`) + **TailwindCSS**.
- Walidacja: **Zod**.
- Email: `nodemailer`, `react-email` / `@react-email/*`.

### Baza danych i warstwa serwerowa
- **Postgres** + **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`) + klient `postgres` (postgres-js).
- Schemat DB (`src/db/schema.ts`) zawiera m.in.:
  - `users` (role `patient` | `dietitian`, statusy konta),
  - `sessions` (Lucia),
  - `events` (tabela zdarzeń / analytics),
  - `audit_log` (tabela audytowa before/after),
  - pozostałe: waga, zgody, zaproszenia, reset hasła, push.
- Jest wyraźny podział na **repozytoria** (`src/lib/repositories/*`) i **serwisy** (`src/lib/services/*`) + część endpointów mapuje błędy domenowe przez `mapErrorToApiError()` (`src/lib/errors.ts`).

### Uwierzytelnianie i autoryzacja
- **Lucia** (sesje cookie) + middleware `src/middleware/auth.ts` wypełnia `Astro.locals.user/session`.
- RBAC na poziomie routingu UI: `src/middleware/rbac.ts` blokuje `/pacjent/*` i `/dietetyk/*`.
- Endpointy `/api/*` robią **własne** checki `locals.user` + rola (wzorzec powtarzany w kodzie).

### Testy i jakość
- Unit/integration: **Vitest**.
- E2E: **Playwright**.
- Jest już infrastruktura testów bazodanowych (`testcontainers`).

### Deploy/operacje
- Docelowo Vercel + serverless.
- DB: wygląda na Neon/Vercel-friendly config (`max: 1` w prod, `prepare: false`, timeouts).

## 2) Wymagania PRD (skrót w kontekście stacku)

MVP PZK wymaga w szczególności:
- **Model treści**: moduły 1/2/3 → stałe kategorie (twarda kolejność) → materiały (ręczny `order`).
- **Statusy materiału**: `draft`, `published`, `archived`, `publish_soon` (wg PRD).
- **Dostęp per moduł**: ręcznie w DB; ważny **12 miesięcy** od `startAt` (per moduł).
- **Widoczność list**: pacjent widzi wszystkie `published` + `publish_soon`; brak dostępu → kłódka + CTA do zakupu (nowa karta, parametr modułu).
- **Materiał (details)**: jeśli brak dostępu → widok zablokowany; draft/archived niewidoczne (i najlepiej “nie ujawniać metadanych”).
- **PDF**: presigned URL (TTL 60s) tylko dla uprawnionych; logi pobrań/błędów.
- **Wideo**: YouTube embed w materiale; błędy odtwarzania obsłużone UI.
- **Notatki**: prywatne per pacjent + materiał.
- **Recenzje PZK**: 1 na pacjenta, skala 1–6, edycja/usunięcie tylko własnej, widoczne tylko w PZK.
- **Minimum observability**: logi pobrań i błędów presigned + podstawowy audyt.

## 3) Krytyczna ocena: czy obecny stack adresuje potrzeby PRD?

### 3.1. Co pasuje bardzo dobrze (mocne strony)
- **Astro SSR na Vercel + API routes**: naturalnie wspiera “aplikację z częścią zamkniętą” i endpointy typu `/api/pzk/...` (materiały, presigned URL, notatki, recenzje).
- **Drizzle + Postgres**: dobry fit do modelu treści/relacji (materiał ↔ moduł ↔ kategoria, access per user, notatki, recenzje, logi).
- **Lucia + middleware**: macie gotową bazę do autoryzacji “każde żądanie wymaga zalogowania” (US-020).
- **Istniejące `events` i `audit_log`**: da się na nich oprzeć “minimum observability” (US-021..023) bez wdrażania zewnętrznych narzędzi na start.
- **Zod + istniejący styl API**: łatwo utrzymać walidację wejścia (recenzje 1–6, notatki, itp.).
- **Playwright/Vitest**: rozsądny fundament do kryteriów akceptacji (E2E flow: widok list, lock/CTA, dodanie/edycja recenzji).

### 3.2. Główne luki (to nie jest “gotowe” pod PRD)

#### A) Brak modeli DB dla PZK (blokujące)
W aktualnym `schema.ts` nie ma bytów:
- dostępy per moduł (np. `pzk_module_access`),
- materiały PZK,
- notatki per pacjent/materiał,
- recenzje PZK.

To jest **największa** brakująca część — bez tego nie da się zaimplementować logiki PRD.

#### B) Brak integracji ze storage (presigned URL) (blokujące)
W `package.json` nie ma AWS SDK / klienta S3/R2.
- Presigned URL (TTL 60s) wymaga dodatkowej biblioteki i konfiguracji sekretów.
- Trzeba też doprecyzować: czy storage jest faktycznie AWS S3, czy alternatywa (np. R2 z S3 API) — PRD mówi “np. S3”.

#### C) Autoryzacja per-moduł “end-to-end” nie istnieje (blokujące)
Macie RBAC po roli i ochronę `/pacjent/*`, ale PRD wymaga:
- uprawnień **per moduł** oraz **per materiał**,
- zabezpieczenia także dla endpointu generowania presigned URL,
- zachowania “nie ujawniaj metadanych draft/archived bez uprawnień”.

To wymaga wspólnego guardu / serwisu autoryzacji PZK oraz konsekwentnego użycia w UI i `/api/pzk/*`.

#### D) “Logi pobrań: sukces/porażka” — presigned URL ma ograniczenia (ryzyko)
Presigned URL zwykle pozwala serverowi stwierdzić:
- **sukces/porażkę wygenerowania URL**,
- **odmowę** (brak uprawnień) na etapie generowania.

Natomiast “czy użytkownik skutecznie pobrał plik” jest trudne do potwierdzenia bez:
- proxy-download przez aplikację (server streamuje plik), albo
- logów po stronie storage (S3 access logs / CloudTrail / R2 logs), albo
- dodatkowego “client callback” (mało wiarygodne).

PRD dopuszcza “o ile aplikacja może to stwierdzić” — ale warto to jawnie opisać w implementacji i/lub wzmocnić później.

#### E) Spójność błędów/kontraktów API (nieblokujące, ale ważne)
W repo widać 2 style:
- część endpointów mapuje błędy domenowe przez `mapErrorToApiError`,
- część buduje odpowiedzi “ręcznie”.

Dla PZK (sporo edge-case’ów: brak dostępu, draft/archived, publish_soon, presigned errors) spójność obsługi błędów bardzo pomoże.

#### F) Nawigacja warunkowa w `Header.astro` nie ma jak sprawdzić dostępu (nieblokujące, ale wymagane przez PRD)
Header jest renderowany SSR i ma dostęp do `Astro.locals.user`, ale **nie** ma informacji “czy user ma aktywny dostęp do co najmniej 1 modułu PZK”.
To oznacza, że warunek “menu widoczne tylko gdy ma dostęp” wymaga:
- dodatkowego zapytania do DB w Header (koszt per request), albo
- (lepiej) wzbogacenia `locals` w middleware o “PZK access summary”.

#### G) YouTube “nie listowany” nie jest zabezpieczeniem (ryzyko produktu)
“Unlisted” spełnia UX (“nie widać na kanale”), ale **nie** zapewnia poufności (link można udostępnić).
To nie jest problem stacku, tylko **ryzyko biznesowe** PRD — warto odnotować jako akceptowalne ryzyko MVP.

## 4) Lista zmian koniecznych do implementacji PRD (MVP)

Poniżej lista zmian jako “checklista wdrożeniowa” — nie wszystkie są trudne, ale większość jest **konieczna**.

### 4.1. Schemat DB + migracje (Drizzle)
1. **Tabela dostępu per moduł** (np. `pzk_module_access`):
   - `id`, `userId`, `module` (1/2/3), `startAt` (manual), opcjonalnie `createdAt/updatedAt`.
   - Unikalność: `(userId, module)`; dostęp aktywny jeśli `startAt + 12 months > now`.
2. **Tabela materiałów PZK** (np. `pzk_materials`):
   - `id`, `title`, `description`, `module` (1/2/3),
   - `category` (enum/varchar) — materiał ma dokładnie 1 kategorię,
   - `order` (int) — ręczna kolejność w ramach kategorii,
   - `status` (enum/varchar): `draft|published|archived|publish_soon`,
   - typy treści:
     - PDF: `pdfObjectKey` (lub `pdfPath`) + `pdfFileName` (opcjonalnie),
     - YouTube: `youtubeVideoId` lub `youtubeUrl`,
     - notatki “template” (tekst od Pauliny) — jeśli w PRD ma być “notatka do materiału” od autora, dodaj pole np. `contentMarkdown`/`contentHtml`.
3. **Tabela notatek pacjenta** (np. `pzk_notes`):
   - `id`, `userId`, `materialId`, `content` (text), timestamps.
   - Unikalność: `(userId, materialId)` (jeśli ma być jedna notatka na materiał).
4. **Tabela recenzji PZK** (np. `pzk_reviews`):
   - `id`, `userId` (unikalne), `rating` (1–6), `content` (text), timestamps.
5. **(Opcjonalnie) tabele logów PZK**:
   - Można użyć obecnego `events` do `pzk_pdf_download_*`, `pzk_access_denied`, `pzk_presign_error`.
   - Jeśli chcesz rozdzielić “analytics” od “operational logs”, dodaj dedykowane `pzk_download_logs`.

### 4.2. Zależności / integracje (storage)
1. Dodać SDK do presigned URL:
   - typowo: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (AWS SDK v3),
   - lub kompatybilny klient jeśli storage to R2 (S3 API).
2. Dodać konfigurację env:
   - `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
   - ewentualnie `S3_ENDPOINT` (jeśli nie AWS), `S3_FORCE_PATH_STYLE`.
3. Ustawić **CORS** na buckecie pod pobrania z przeglądarki oraz rozsądny `Content-Disposition`.

### 4.3. Warstwa domenowa: serwisy + repozytoria PZK
1. Repozytoria:
   - `pzkMaterialRepository`, `pzkAccessRepository`, `pzkNoteRepository`, `pzkReviewRepository`.
2. Serwisy:
   - `pzkAccessService` (obliczanie aktywności: 12 miesięcy, check per moduł),
   - `pzkMaterialService` (listy: filtr statusów, sortowanie kategorii + `order`),
   - `pzkDownloadService` (presign + logi + obsługa odmów),
   - `pzkReviewService` (1 per user, CRUD własnej),
   - `pzkNoteService` (CRUD własnych notatek per materiał).
3. Błędy domenowe:
   - wykorzystać istniejące `AuthorizationError`, `NotFoundError`, `ValidationError` z `src/lib/errors.ts` (albo rozszerzyć o kody specyficzne dla PZK).

### 4.4. API routes (`src/pages/api/pzk/*`)
Minimalny zestaw endpointów:
1. **GET** `/api/pzk/materials`:
   - zwraca strukturę: moduły → kategorie → materiały (tylko `published` + `publish_soon`),
   - z polami do UI: `isLocked`, `status`, `ctaUrl`.
2. **GET** `/api/pzk/materials/:id`:
   - jeśli `published` i user ma dostęp do modułu → pełne dane,
   - jeśli `published` i brak dostępu → “locked view” (bez URL/pdf/youtube),
   - jeśli `draft/archived` → 404 (rekomendacja bezpieczeństwa zgodna z PRD: bez metadanych).
3. **POST** `/api/pzk/materials/:id/presign`:
   - generuje presigned URL TTL=60s tylko dla uprawnionych,
   - loguje: sukces/porażkę generowania, odmowy, błędy.
4. **GET/PUT/DELETE** `/api/pzk/materials/:id/note` (lub `/api/pzk/notes`):
   - tylko właściciel notatki; tylko jeśli user ma dostęp do modułu materiału.
5. **GET** `/api/pzk/reviews` + **GET** `/api/pzk/reviews/me`:
   - dostęp tylko dla userów z aktywnym dostępem do ≥ 1 modułu,
   - `me` zwraca recenzję własną (lub null).
6. **POST/PATCH/DELETE** `/api/pzk/reviews/me`:
   - rating 1–6, wymagane treść, 1 per user.

Uwagi implementacyjne:
- Każdy endpoint powinien robić:
  - `locals.user` check,
  - `role === 'patient'`,
  - check dostępu per moduł (gdy dotyczy),
  - spójną mapę błędów (najlepiej przez `mapErrorToApiError`).

### 4.5. UI: strony i komponenty PZK
1. Nowe route’y (propozycja):
   - `/pacjent/pzk` (lub `/pzk`) jako landing PZK,
   - `/pacjent/pzk/material/:id` (szczegóły materiału),
   - `/pacjent/pzk/recenzje` (sekcja recenzji).
2. Widoki:
   - start: wybór modułu 1/2/3,
   - w module: lista kategorii (stała kolejność) + listy materiałów (sort `order`),
   - locked state: kłódka + CTA do zakupu (param modułu, nowa karta),
   - `publish_soon`: widoczne jako wyszarzone, bez możliwości akcji,
   - detail: embed YouTube + notatki + download PDF (jeśli dostęp).
3. CTA link:
   - wprowadzić konfigurację `PZK_PURCHASE_LANDING_URL` + parametr (np. `?module=1`).
4. Nawigacja:
   - dodać pozycję “Przestrzeń Zdrowej Kobiety” w `Header.astro` **tylko** gdy user ma aktywny dostęp ≥ 1 moduł.

### 4.6. Middleware / locals enrichment (zalecane)
Żeby spełnić “menu widoczne tylko przy dostępie” bez dodatkowych zapytań w każdym komponencie:
- dodać middleware (np. `src/middleware/pzk.ts`) które:
  - dla zalogowanego pacjenta pobierze “PZK access summary” (np. aktywne moduły) i zapisze do `context.locals.pzk = { hasAnyAccess, activeModules }`.
- złożyć to w `src/middleware/index.ts` (sequence).

### 4.7. Observability (logi/audyt) — minimalny zakres
1. **Logi pobrań i błędów presign**:
   - wykorzystać `events`:
     - `pzk_pdf_presign_success`,
     - `pzk_pdf_presign_error`,
     - `pzk_pdf_presign_forbidden`,
   - `properties`: `{ materialId, module, reason, storageProvider, ttlSeconds }`.
2. **Podstawowy audyt**:
   - wykorzystać `audit_log` dla zmian wykonywanych przez “operacje” (manualnie w DB) — tego aplikacja nie zobaczy automatycznie,
   - albo (jeżeli planujecie choć minimalne endpointy administracyjne w przyszłości) — wtedy audyt przez `auditLogRepository`.

### 4.8. Testy (rekomendowane jako “must-have” dla MVP)
1. Unit/integration:
   - testy `pzkAccessService` (12 miesięcy, granice czasowe, per moduł),
   - testy `pzkReviewService` (1 recenzja, walidacja 1–6),
   - testy autoryzacji endpointów (401/403/404 dla draft/archived).
2. E2E Playwright:
   - pacjent z dostępem: widzi PZK w menu, może pobrać PDF (mock presign), może dodać/edytować/usunąć recenzję,
   - pacjent bez dostępu: widzi lock + CTA, brak możliwości akcji, bez wycieku danych.

## 5) Werdykt: czy ten stos jest “odpowiedni” pod PRD?

**Tak — obecny stos jest dobrym fundamentem pod PZK**, szczególnie przez:
- SSR (Astro/Vercel) + wygodne API routes,
- Drizzle/Postgres (model danych i relacje),
- Lucia + middleware (auth),
- istniejące `events` i `audit_log` (minimum observability).

Jednocześnie, żeby dowieźć PRD MVP, potrzebujecie **koniecznie**:
- dobudować model DB PZK + migracje,
- dodać integrację S3/presigned,
- dołożyć autoryzację per-moduł w serwisach i endpointach,
- uzupełnić UI + nawigację o PZK i “locked states”.

## 6) Najważniejsze ryzyka / decyzje do podjęcia przed implementacją

1. **Statusy materiału**: PRD wymaga `publish_soon` (w rozmowach wcześniej było 3 statusy). Rekomendacja: wprowadzić 4 statusy jak w PRD.
2. **Log “sukcesu pobrania”**: do uzgodnienia czy w MVP logujemy tylko “presign attempt/success/failure”, czy inwestujemy w proxy-download / storage access logs.
3. **YouTube prywatność**: “unlisted” ≠ zabezpieczenie. Do zaakceptowania w MVP albo rozważyć alternatywę (np. platforma wideo z token gated).
4. **Kategoria jako enum vs tabela**: PRD mówi “stałe kategorie” — enum/varchar z walidacją jest OK; tabela daje większą elastyczność, ale to już zalążek CMS.
5. **Źródło imienia do recenzji**: w DB `users.firstName` istnieje i przy signup jest wymagane — w praktyce spełnia PRD, ale warto potwierdzić co w przypadku braków danych (legacy users).


