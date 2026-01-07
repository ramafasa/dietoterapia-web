# Architektura UI dla PZK (Przestrzeń Zdrowej Kobiety)

## 1. Przegląd struktury UI

PZK to zamknięty obszar dla pacjentów z hierarchią **Moduł → Kategoria → Materiały → Szczegóły materiału**, plus sekcja **Recenzje**. Architektura UI jest SSR‑first (katalog i szczegóły po stronie serwera), z minimalną hydratacją dla akcji (download/notatki/recenzje).

### Kluczowe wymagania (PRD + notatki z sesji)

- **Wejście i role**:
  - pozycja menu „Przestrzeń Zdrowej Kobiety” widoczna dla wszystkich **poza dietetykiem**,
  - pacjent z aktywnym dostępem → katalog PZK,
  - pacjent bez dostępu oraz niezalogowany → landing zakupu,
  - dietetyk → brak menu; wejście bezpośrednie kończy się **403**.
- **Widoczność programu**:
  - pacjent (po loginie) widzi wszystkie materiały w statusach `published` i `publish_soon`,
  - materiały `draft` i `archived` są niewidoczne i nie mogą „wyciekać” przez URL (traktowane jak 404).
- **Blokady i CTA**:
  - `published` bez dostępu do modułu: widoczne jako preview + kłódka + CTA „Kup moduł X” (w nowej karcie), bez akcji,
  - `publish_soon`: widoczne, wyszarzone, bez akcji; w szczegółach stały komunikat „Dostępny wkrótce”.
- **PDF**:
  - pobranie przez presigned URL generowany na klik (TTL 60s), bez eksponowania TTL w UI,
  - stany i błędy 401/403/404/429/500 z retry, bez ujawniania detali technicznych.
- **Notatki**:
  - jedna notatka na materiał na pacjenta (upsert), tylko dla odblokowanych materiałów (`published` + dostęp),
  - czytelne stany: zapisuję / zapisano / błąd + retry.
- **Recenzje**:
  - 1 recenzja na pacjenta, rating 1–6, edycja/usunięcie tylko własnej,
  - recenzje widoczne wyłącznie w obrębie PZK.
- **Niefunkcjonalne**:
  - responsywność (mobile), dostępność (klawiatura, focus), spójność komunikatów z resztą aplikacji.

### Główne endpointy API (i do czego służą w UI)

- **GET `/api/pzk/access`**: decyzje wejścia (gating), uprawnienia (np. mutacje recenzji).
- **GET `/api/pzk/catalog`**: dane katalogu (moduły→kategorie→materiały) z `isLocked/isActionable/ctaUrl` i `status`.
- **GET `/api/pzk/materials/:materialId`**: dane szczegółów materiału (wariant: odblokowany / locked / publish_soon / 404).
- **POST `/api/pzk/materials/:materialId/pdfs/:pdfId/presign`**: pobranie PDF (presign + logging + rate limit).
- **GET/PUT/DELETE `/api/pzk/materials/:materialId/note`**: notatki pacjenta (tylko odblokowane).
- **GET `/api/pzk/reviews`**: lista recenzji (w API plan: wymaga aktywnego dostępu do ≥1 modułu).
- **GET/PUT/DELETE `/api/pzk/reviews/me`**: moja recenzja (wymaga aktywnego dostępu do ≥1 modułu).

---

## 2. Lista widoków

### Widok: Landing zakupu PZK (publiczny)

- **Nazwa widoku**: Landing zakupu PZK
- **Ścieżka widoku**: `/pzk/kup`
- **Główny cel**: cel dla niezalogowanych i pacjentów bez dostępu; przedstawienie oferty i przekierowanie do zakupu poza aplikacją.
- **Kluczowe informacje do wyświetlenia**:
  - opis programu i modułów,
  - CTA do zakupu (zewnętrzny link),
  - opcjonalnie CTA „Zaloguj / Załóż konto”.
- **Kluczowe komponenty widoku**:
  - sekcja hero + opis,
  - karty modułów,
  - przycisk/link CTA zakupu,
  - link do logowania.
- **UX, dostępność i względy bezpieczeństwa**:
  - CTA zakupu zawsze w nowej karcie,
  - brak danych chronionych; w pełni publiczny.

### Widok: Wejście do PZK (gating/redirect)

- **Nazwa widoku**: Wejście do PZK (gating)
- **Ścieżka widoku**: `/pacjent/pzk`
- **Główny cel**: rozstrzygnąć rolę i dostęp; przekierować do katalogu albo na landing zakupu; dla dietetyka wyświetlić 403.
- **Kluczowe informacje do wyświetlenia**: opcjonalnie krótki stan „Sprawdzam dostęp…”.
- **Kluczowe komponenty widoku**:
  - bramka dostępu oparta o sesję + `GET /api/pzk/access`.
- **UX, dostępność i względy bezpieczeństwa**:
  - niezalogowany → `/pzk/kup` (zgodnie z notatkami),
  - pacjent bez aktywnego dostępu → `/pzk/kup`,
  - dietetyk → 403,
  - brak ujawniania informacji o materiałach na etapie gatingu.

### Widok: Katalog PZK (moduły → kategorie → materiały)

- **Nazwa widoku**: Katalog PZK
- **Ścieżka widoku**: `/pacjent/pzk` (po pozytywnym gatingu) lub `/pacjent/pzk/katalog`
- **Główny cel**: przegląd programu i przejście do dostępnych materiałów.
- **Kluczowe informacje do wyświetlenia** (z `GET /api/pzk/catalog`):
  - selektor modułu (1/2/3) z informacją, czy moduł jest aktywny,
  - kategorie w twardej kolejności,
  - materiały w kolejności `order`, z `status`, `isLocked`, `isActionable`, `ctaUrl`, `hasPdf`, `hasVideos`.
- **Kluczowe komponenty widoku**:
  - nawigacja wewnętrzna PZK,
  - selektor modułów (tabs/segmented control),
  - akordeony kategorii (A11y),
  - wiersz materiału w 3 stanach: dostępny / zablokowany / dostępny wkrótce,
  - stan pustej kategorii.
- **UX, dostępność i względy bezpieczeństwa**:
  - `published` bez dostępu: **preview + kłódka + CTA zakupu**, bez linku do szczegółów,
  - `publish_soon`: widoczne, wyszarzone, bez akcji,
  - pełna obsługa klawiaturą (tabs, akordeon), widoczne focus states.

### Widok: Szczegóły materiału (warianty: odblokowany / publish_soon / zablokowany)

- **Nazwa widoku**: Szczegóły materiału PZK
- **Ścieżka widoku**: `/pacjent/pzk/material/:id`
- **Główny cel**: konsumpcja treści (PDF/wideo) i notatki, z poprawnym zachowaniem dla lock/publish_soon.
- **Kluczowe informacje do wyświetlenia** (z `GET /api/pzk/materials/:id`):
  - zawsze: tytuł, opis, (opcjonalnie) treść,
  - tylko odblokowany: lista PDF, lista wideo, notatka,
  - locked: wyłącznie info + CTA zakupu,
  - publish_soon: banner „Dostępny wkrótce”, bez akcji.
- **Kluczowe komponenty widoku**:
  - nagłówek materiału + breadcrumbs,
  - sekcja PDF (przyciski pobrania),
  - sekcja wideo (embed),
  - panel notatek (edytor + zapis/usuń),
  - komponent stanu zablokowanego,
  - komponent „dostępny wkrótce”.
- **UX, dostępność i względy bezpieczeństwa**:
  - pobranie PDF: loading, retry, komunikaty błędów (401/403/404/429/500),
  - brak ujawniania `objectKey` i szczegółów błędów presign/storage,
  - `draft/archived`: traktowane jak 404 (bez metadanych),
  - publish_soon: brak CTA do działań.

### Widok: Recenzje PZK

- **Nazwa widoku**: Recenzje PZK
- **Ścieżka widoku**: `/pacjent/pzk/recenzje`
- **Główny cel**: social proof w obrębie PZK oraz dodanie/edycja/usunięcie własnej recenzji.
- **Kluczowe informacje do wyświetlenia**:
  - lista recenzji (imię, rating 1–6, treść, daty),
  - „moja recenzja” (formularz lub podgląd + edycja/usunięcie).
- **Kluczowe komponenty widoku**:
  - lista recenzji (cursor/paginacja),
  - panel „moja recenzja” (rating input + textarea + akcje),
  - komunikat o braku uprawnień do mutacji.
- **UX, dostępność i względy bezpieczeństwa**:
  - walidacja rating 1–6 i wymagany tekst,
  - obsługa błędów API bez utraty treści w formularzu,
  - **uwaga o zgodności z API planem**: `GET /api/pzk/reviews` wymaga aktywnego dostępu do ≥1 modułu; jeśli produktowo ma być read‑only bez aktywnego dostępu (jak sugerują notatki), konieczna zmiana API lub osobny endpoint.

### Widok: Ekrany błędów PZK (wspólne)

- **Nazwa widoku**: Stany błędów PZK
- **Ścieżka widoku**: wspólne ekrany/sekcje dla 401/403/404/429/500 w obrębie `/pacjent/pzk/**`
- **Główny cel**: spójne, bezpieczne komunikaty i możliwość ponowienia.
- **Kluczowe informacje do wyświetlenia**:
  - komunikat zależny od statusu,
  - CTA „Spróbuj ponownie”, „Wróć”, ewentualnie „Kup moduł”.
- **Kluczowe komponenty widoku**:
  - komponent error state + retry/back.
- **UX, dostępność i względy bezpieczeństwa**:
  - 404 nie rozróżnia „nie istnieje” vs „draft/archived” (brak wycieku),
  - 403 dla dietetyka i braku roli.

---

## 3. Mapa podróży użytkownika

### Główny przypadek: pacjent z dostępem konsumuje materiał i dodaje notatkę

1. Menu „Przestrzeń Zdrowej Kobiety” → wejście do `/pacjent/pzk`.
2. Gating:
   - pacjent + aktywny dostęp → katalog,
   - pacjent bez dostępu / niezalogowany → `/pzk/kup`,
   - dietetyk → 403.
3. Katalog:
   - wybór modułu (1/2/3),
   - rozwinięcie kategorii,
   - wybór materiału:
     - dostępny (`published` + access) → szczegóły,
     - zablokowany (`published` bez access) → CTA zakupu (bez routingu),
     - `publish_soon` → szczegóły informacyjne.
4. Szczegóły materiału (odblokowany):
   - pobranie PDF → presign → download,
   - odtworzenie wideo (embed),
   - edycja notatki → zapis → potwierdzenie.
5. Przy błędach akcji: komunikat + retry bez opuszczania widoku.

### Przypadek: pacjent bez dostępu

1. Menu PZK → `/pacjent/pzk` → przekierowanie na `/pzk/kup`.
2. Landing → CTA zakupu (nowa karta).

### Przypadek: wejście bezpośrednie w URL materiału bez dostępu

1. `/pacjent/pzk/material/:id` → wariant „zablokowany” + CTA zakupu, bez zasobów/akcji.

---

## 4. Układ i struktura nawigacji

### Globalna nawigacja (nagłówek aplikacji)

- **Menu PZK**:
  - widoczne dla wszystkich poza dietetykiem,
  - prowadzi do `/pacjent/pzk` (jeden punkt wejścia), gdzie rozstrzygany jest gating.

### Nawigacja wewnętrzna PZK

- Stała podnawigacja w `/pacjent/pzk/**`:
  - **Katalog** → `/pacjent/pzk`
  - **Recenzje** → `/pacjent/pzk/recenzje`
- W katalogu:
  - selektor modułu (tabs/segmented) + akordeon kategorii (stan może być tylko w pamięci).
- W szczegółach:
  - breadcrumbs „PZK / Moduł / Kategoria / Materiał”.

---

## 5. Kluczowe komponenty

### Komponenty wielokrotnego użytku

- **Bramka dostępu (Access Gate)**: rozstrzyga rolę i dostęp na wejściu, kieruje do katalogu/landingu/403.
- **Nawigacja wewnętrzna PZK**: linki Katalog/Recenzje, wspólne dla wszystkich widoków PZK.
- **Selektor modułu**: tabs/segmented control (A11y, focus states).
- **Akordeon kategorii**: semantyka `aria-expanded`, pełna obsługa klawiatury.
- **Wiersz materiału**: trzy warianty (dostępny / zablokowany / publish_soon) z czytelną semantyką i stanami disabled.
- **CTA zakupu modułu**: link w nowej karcie, z parametrem modułu (`ctaUrl` z API).
- **Download PDF**: komponent akcji presign + start download; obsługa 401/403/404/429/500; retry.
- **Embed wideo**: osadzanie YouTube + fallback błędu.
- **Notatki**: edytor notatki (upsert) + stany „zapisuję/zapisano/błąd” + retry.
- **Recenzje**:
  - lista recenzji (cursor/paginacja),
  - panel „moja recenzja” (rating 1–6, edycja/usunięcie).
- **Error/Empty state**: wspólne komponenty 401/403/404/429/500 + retry/back, bez ujawniania szczegółów.

### Mapowanie historyjek użytkownika (PRD) → elementy architektury UI

- **US-001** → menu + gating `/pacjent/pzk` + redirect `/pzk/kup` + 403 dla dietetyka.
- **US-002** → Katalog: selektor modułu.
- **US-003** → Katalog: lista kategorii (akordeon) + stan „brak materiałów”.
- **US-004** → Katalog: lista materiałów sortowana po `order`.
- **US-005** → Katalog: wariant zablokowany (kłódka + brak akcji).
- **US-006** → CTA zakupu (nowa karta, parametr modułu).
- **US-007** → Szczegóły materiału (odblokowany) z treścią i akcjami.
- **US-008** → Download PDF przez presign (w tej samej karcie).
- **US-009** → Obsługa błędów pobrania (401/403/404/429/500) + retry.
- **US-010** → Odtwarzanie wideo (embed) w szczegółach.
- **US-011** → Komunikat błędu wideo + odśwież.
- **US-012** → Notatki: możliwość dodania (upsert).
- **US-013** → Notatki: wyświetlanie własnej notatki.
- **US-014** → `draft/archived` niewidoczne; URL traktowany jak 404 bez metadanych.
- **US-015** → Recenzje dostępne tylko w PZK (gating zgodny z API planem).
- **US-016** → Dodanie recenzji (formularz + walidacja).
- **US-017** → Edycja własnej recenzji.
- **US-018** → Usunięcie własnej recenzji.
- **US-019** → Lista recenzji (imię, rating, treść, daty).
- **US-020** → Autoryzacja na każdym wejściu/akcji; brak wycieków.
- **US-021** → UI inicjuje pobrania; backend loguje zdarzenia (observability).
- **US-022** → UI obsługuje i prezentuje błędy; backend loguje błędy presign.
- **US-023** → Audit/zdarzenia: bez osobnego widoku w MVP (po stronie operacji).
- **US-024** → Nadanie dostępu ręcznie w DB; UI reaguje przez `GET /access` i `GET /catalog`.
- **US-025** → Wygaśnięcie dostępu: katalog i szczegóły przechodzą w locked; CTA zakupu.
- **US-026** → Responsywność i ergonomia na mobile dla katalogu/szczegółów/recenzji.


