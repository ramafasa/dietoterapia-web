<conversation_summary>

<decisions>

1. PZK część aplikacyjna ma być pod **`/pacjent/pzk`**. W środku ma być **osobna nawigacja PZK**, ale globalny nagłówek/nawigacja aplikacji zostaje (nawigacja PZK może być „pod spodem”).
2. Pozycja menu „Przestrzeń Zdrowej Kobiety” ma być **widoczna dla wszystkich**, ale **nie dla dietetyka**:
   - pacjent zalogowany z aktywnym dostępem → wejście do **`/pacjent/pzk`** (katalog/moduły),
   - pacjent zalogowany bez dostępu → przekierowanie na **publiczny landing zakupu**,
   - użytkownik niezalogowany → przekierowanie na **publiczny landing zakupu**,
   - dietetyk: **nie widzi menu**, a wejście w link ma skończyć się **403**.
3. Routing rozdzielamy na **publiczne** **`/pzk/kup`** (landing zakupu) oraz **aplikacyjne** **`/pacjent/pzk`** (katalog/obszar pacjenta).
4. W PZK ma być **jeden ekran katalogu** oparty o **`GET /api/pzk/catalog`** z selektorem modułu (tabs/segmented control) oraz rozwijanymi kategoriami w obrębie modułu.
5. Materiały zablokowane z powodu braku dostępu mają być widoczne na liście jako **preview** (tytuł + krótki opis), ale:
   - **bez routingu do szczegółów**,
   - **bez zasobów/akcji** (PDF/wideo/notatki),
   - z wyraźnym CTA **„Kup moduł X”** otwieranym w **nowej karcie**.
6. `publish_soon`:
   - widoczne **tylko po loginie** (w obszarze pacjenta),
   - **można wejść w szczegóły** i przeczytać tytuł/opis,
   - w szczegółach stały komunikat **„Dostępny wkrótce”**, bez dat i bez CTA do działań.
7. Stan UI dla katalogu (wybrany moduł/rozwinięte sekcje) może być **tylko w pamięci** (reset po odświeżeniu); nie ma wymogu kodowania stanu w URL.
8. Recenzje:
   - osobna strona **`/pacjent/pzk/recenzje`**,
   - **odczyt (read-only)**: dostępny dla „każdego” kto może wejść na stronę (w rozmowie: bez wymogu aktywnego dostępu),
   - **dodanie/edycja/usunięcie**: tylko pacjent z aktywnym dostępem do co najmniej jednego modułu.
9. Notatki:
   - **jedna notatka na materiał** (upsert),
   - limit treści ok. **10k znaków**,
   - zapis ręczny z jednoznacznym stanem: „zapisuję / zapisano / błąd” + retry.
10. Pobieranie PDF:
   - download w **tej samej karcie**,
   - w UI **nie eksponujemy TTL**, ale zapewniamy loading, retry i czytelną obsługę błędów **401/403/404/429/500**.
11. Obsługa błędów i komunikatów w PZK ma być **spójna z aktualnym zachowaniem aplikacji** (bez wprowadzania nowego stylu).
12. Integracja i stan:
   - katalog i szczegóły renderowane **SSR (Astro)**,
   - hydratacja minimalnych komponentów React tylko dla akcji (download/notatka/recenzja),
   - dla akcji i odświeżania danych: lekki cache w kliencie (np. **React Query**) z invalidacją po **PUT/DELETE**.
13. CSRF i wspólny klient API:
   - preferowany mechanizm: **token CSRF + nagłówek**,
   - w UI: **jeden wspólny wrapper `fetch`** dodający wymagane nagłówki, obsługę 401/403 i mapowanie envelope API → UI.

</decisions>

<matched_recommendations>

1. Utrzymać obszar PZK jako zestaw route’ów pod **`/pacjent/pzk`** z dedykowanym layoutem (ale bez ruszania globalnego nagłówka aplikacji).
2. Wprowadzić **publiczny landing zakupu** pod **`/pzk/kup`** i traktować go jako domyślny cel dla użytkowników bez dostępu oraz niezalogowanych.
3. Zaimplementować **pojedynczy ekran katalogu** bazujący na **`GET /api/pzk/catalog`**, minimalizując liczbę round-tripów i ekranów.
4. W katalogu stosować czytelne stany listy:
   - locked (brak dostępu) → preview + CTA, bez routingu do szczegółów,
   - `publish_soon` → preview + dostępne szczegóły opisowe + komunikat „Dostępny wkrótce”.
5. Oprzeć UI o spójny kontrakt błędów (envelope) i istniejące wzorce aplikacji; ustandaryzować komunikaty dla **401/403/404/429/500**.
6. Zastosować podejście **SSR-first + minimalna hydratacja** oraz dodać prostą warstwę cache dla mutacji (React Query) z invalidacją.
7. Zapewnić spójny i bezpieczny mechanizm wywołań API: **wspólny wrapper HTTP** + **CSRF token header** dla metod nie-GET.
8. Uwzględnić ograniczenia bezpieczeństwa w UI:
   - brak ujawniania szczegółów dla stanów, których nie wolno eksponować (np. 404 dla draft/archived),
   - dietetyk nie widzi menu, a bezpośrednie wejście w PZK kończy się **403**.
9. Dla notatek przyjąć MVP-upsert (1 notatka/materiał) i jasne stany zapisu.
10. Dla pobrań PDF: w tej samej karcie, z retry i bez ujawniania TTL (operacyjnie opieramy się na statusach i komunikatach).

</matched_recommendations>

<ui_architecture_planning_summary>

### a) Główne wymagania dotyczące architektury UI
- **Routing i layout**: PZK jako obszar pacjenta pod `/pacjent/pzk`, z własną nawigacją wewnętrzną, ale przy zachowaniu globalnego nagłówka aplikacji.
- **Wejście z menu**: menu PZK widoczne dla wszystkich użytkowników poza dietetykiem; wejście prowadzi do katalogu tylko wtedy, gdy pacjent ma aktywny dostęp; w pozostałych przypadkach prowadzi do landingu zakupu.
- **Stany materiałów**: widoczność programu (preview) przy zachowaniu restrykcji akcji i routingu:
  - locked (brak dostępu) → brak szczegółów, CTA zakupu,
  - `publish_soon` → szczegóły opisowe + komunikat „Dostępny wkrótce”.
- **Spójność UX**: błędy i komunikaty jak w reszcie aplikacji; jeden kontrakt komunikacji z API.

### b) Kluczowe widoki, ekrany i przepływy użytkownika
- **Publiczne**
  - `GET /pzk/kup` (public): landing zakupu (cel dla niezalogowanych i pacjentów bez dostępu; także fallback dla wejścia z menu).
- **Aplikacyjne (pacjent)**
  - `GET /pacjent/pzk`:
    - ekran „Katalog PZK” (SSR) oparty o `/api/pzk/catalog`,
    - selektor modułu (1/2/3) + rozwijane kategorie,
    - lista materiałów z rozróżnieniem: dostępne / zablokowane / publish_soon.
  - `GET /pacjent/pzk/material/:id` (szczegóły):
    - dostępne dla materiałów odblokowanych oraz dla `publish_soon` (wariant informacyjny),
    - **niedostępne** (brak routingu) dla materiałów zablokowanych z powodu braku dostępu.
  - `GET /pacjent/pzk/recenzje`:
    - read-only lista recenzji dla osób mogących wejść na tę stronę,
    - edycja/dodanie/usunięcie tylko dla pacjentów z aktywnym dostępem do ≥1 modułu.
- **Przepływy**
  - menu → (pacjent z dostępem) → `/pacjent/pzk` → wybór modułu → kategorie → (klik materiał dostępny lub publish_soon) → szczegóły → akcje (download/note),
  - menu → (niezalogowany lub pacjent bez dostępu) → `/pzk/kup`,
  - katalog → materiał zablokowany → CTA „Kup moduł X” (nowa karta),
  - katalog → publish_soon → szczegóły → komunikat „Dostępny wkrótce”.

### c) Strategia integracji z API i zarządzania stanem
- **SSR (Astro)**:
  - `/pacjent/pzk` oraz widoki szczegółów renderowane po stronie serwera.
- **Hydratacja React tylko dla akcji**:
  - pobranie PDF (presign + start download),
  - notatki (GET/PUT/DELETE note),
  - recenzje (GET list + PUT/DELETE dla „me”, jeśli dozwolone).
- **Cache dla mutacji**:
  - użycie React Query (lub podobnie lekkiego rozwiązania) do obsługi mutacji i odświeżeń po PUT/DELETE.
- **Stan UI katalogu**:
  - stan selektora modułu i rozwinięć tylko w pamięci (reset po refresh).
- **Wspólny klient HTTP**:
  - wrapper `fetch` dodający nagłówki (CSRF), obsługę 401/403 i mapowanie envelope API na ustandaryzowane błędy UI.

### d) Responsywność, dostępność i bezpieczeństwo
- **Responsywność**:
  - katalog modułów/kategorii/materiałów musi działać na mobile (czytelne listy, duże targety tap, brak poziomego scrolla).
- **Dostępność**:
  - selektor modułów i akordeony kategorii obsługiwalne klawiaturą,
  - widoczne focus states,
  - czytelne stany disabled (szczególnie `publish_soon`) i jasne CTA.
- **Bezpieczeństwo / auth / authZ**:
  - dietetyk: brak linku w menu; bezpośrednie wejście w PZK → 403,
  - UI nie powinno ujawniać danych dla stanów, które backend zwraca jako 404 (draft/archived),
  - CSRF: token + nagłówek dla wszystkich endpointów mutujących.

### e) Spójność designu i obsługa błędów
- PZK ma używać tych samych wzorców co reszta aplikacji (alerty/toasty/ekrany błędów).
- Wymagane czytelne mapowanie statusów:
  - 401 → wymagane logowanie / przekierowanie,
  - 403 → brak dostępu (w tym rola),
  - 404 → brak zasobu (również dla draft/archived),
  - 429 → limit, komunikat + retry,
  - 500 → błąd systemu + retry.

</ui_architecture_planning_summary>

<unresolved_issues>

1. Czy `/pacjent/pzk/recenzje` ma być dostępne dla pacjentów **bez aktywnego dostępu** (read-only) również wtedy, gdy zgodnie z decyzją 1 pacjenci bez dostępu są kierowani na `/pzk/kup` (potrzebne doprecyzowanie reguły wejścia i linkowania).
2. Czy pozycja menu „PZK” ma prowadzić zawsze do `/pzk/kup` (z serwerowym redirectem dla uprawnionych), czy bezpośrednio do `/pacjent/pzk` i dopiero tam rozwiązywać przekierowania (wymaga wyboru mechaniki).
3. Czy CTA „Kup moduł X” ma zawsze otwierać nową kartę (jak w PRD) oraz jaka jest dokładna baza URL zakupu i parametr modułu (konfiguracja + nazwa parametru).
4. Jak dokładnie ma wyglądać „osobna nawigacja PZK” (tabs w obrębie PZK vs sidebar vs breadcrumbs) oraz jakie linki poza „Katalog” i „Recenzje” mają się w niej znaleźć w MVP.

</unresolved_issues>

</conversation_summary>



