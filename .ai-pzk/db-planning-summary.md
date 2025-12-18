<conversation_summary>

<decisions>

1. Moduły PZK są stałe i mają wartości **1/2/3**; w DB reprezentowane jako **liczba** (`smallint`) w tabelach PZK.
2. Dostęp per moduł: w MVP przyjmujemy model „jeden rekord dostępu na moduł”, z `start_at` i regułą aktywności: `start_at + interval '12 months' > now()`. Dodatkowo planowane pole `revoked_at` (cofnięcie dostępu bez kasowania).
3. Identyfikatory głównych encji (np. materiały) mają być **UUID** i URL ma bazować na UUID.
4. Kategorie: w MVP dodajemy tabelę `pzk_categories` z **`id uuid`** (PK) oraz m.in. `label`, `display_order` dla twardej kolejności i potencjalnych lokalizacji; `pzk_materials` trzyma FK do kategorii.
5. Materiał może zawierać **mix typów treści** (PDF + YouTube + tekst); modelujemy to opcjonalnymi polami w `pzk_materials`.
6. Statusy materiału: `draft | published | archived | publish_soon`.
7. Widoczność dla pacjenta:
   - `published` i `publish_soon` są widoczne na listach,
   - `draft` i `archived` **nigdy** nie są zwracane pacjentom (także na detail) — preferowane zachowanie jak „brak zasobu” (np. 404).
8. `publish_soon` na detail: ma zwracać widok disabled/locked bez dostępu do PDF/wideo/notatek, ale z metadanymi (tytuł/opis). Bez dodatkowych pól DB poza `status`.
9. PDF: minimalnie `pdf_object_key text` + opcjonalnie `pdf_file_name text` (pod `Content-Disposition`).
10. YouTube: przechowujemy `youtube_video_id text`; playlisty nie są wspierane.
11. Tekst materiału: `content_md text` (Markdown) + `updated_at`; wersjonowanie poza MVP.
12. Notatki pacjenta: **jedna notatka na (user_id, material_id)**, tabela `pzk_notes` z `UNIQUE(user_id, material_id)`, `content`, `updated_at`.
13. Recenzje PZK: tabela `pzk_reviews` z `UNIQUE(user_id)`, `rating` 1–6 (`CHECK`), `content`, timestamps; imię autora pobierane przez join do `users`. Recenzje widoczne dla wszystkich użytkowników z dostępem do PZK (≥1 aktywny moduł).
14. Logowanie presign: używamy istniejącej tabeli `events` dla zdarzeń `pzk_pdf_presign_success/error/forbidden` z `properties` zawierającymi co najmniej `material_id`, `module`, `reason`, `ttl_seconds`.
15. RLS: **nie stosujemy** w MVP; bezpieczeństwo egzekwowane w warstwie serwisów/API (wspólny user DB).
16. Kolejność materiałów: `order` ma być **unikalny w obrębie (module, category)**.
17. Dostęp per moduł dopuszcza historię startów: constraint `UNIQUE(user_id, module, start_at)`.
18. Metadane materiału: `title` jest **wymagane**, `description` jest **opcjonalne**.
19. Indeksy (krytyczne): `pzk_materials(status, module, category_id, "order")`, `pzk_notes` unikat `(user_id, material_id)`, `pzk_reviews` unikat `(user_id)`, indeks `pzk_module_access(user_id, module)` (dla szybkich checków).

</decisions>

<matched_recommendations>

1. Modelować moduły jako `smallint` z `CHECK (module in (1,2,3))` we wszystkich tabelach PZK.
2. Dodać tabelę dostępu per moduł (`pzk_module_access`) z regułą aktywności 12 miesięcy od `start_at` oraz opcjonalnym `revoked_at`.
3. Użyć UUID jako PK dla `pzk_materials` (i docelowo innych encji PZK), oraz bazować na UUID w routingu.
4. Zastosować tabelę `pzk_categories` z `display_order` i FK z `pzk_materials`, aby wymusić stałą kolejność kategorii.
5. W `pzk_materials` trzymać opcjonalne pola `pdf_object_key`, `pdf_file_name`, `youtube_video_id`, `content_md` (mix treści), plus `status/module/category/order`.
6. Wymusić deterministyczną kolejność materiałów: `UNIQUE(module, category_id, "order")` + `CHECK ("order" > 0)`.
7. Egzekwować bezpieczeństwo „draft/archived nie ujawniać” poprzez warunki zapytań i kontrakt API (listy tylko `published|publish_soon`, details: 404 dla `draft|archived`).
8. Notatki jako 1:1 per (user, material): `UNIQUE(user_id, material_id)` + FK do `users` i `pzk_materials`.
9. Recenzje jako 1:1 per user: `UNIQUE(user_id)` + `CHECK (rating between 1 and 6)`; autor prezentowany przez join do `users`.
10. Observability presign przez `events`: eventy `pzk_pdf_presign_*` + indeksy pod filtrowanie po `event_name`/czasie i ewentualnie po `properties`.
11. Skoro brak RLS: wzmocnić integralność w DB (FK/unikaty/checki) i rozważyć widok typu „public query surface” (np. `pzk_materials_public`) dla minimalizacji ryzyka przypadkowego wycieku statusów.

</matched_recommendations>

<database_planning_summary>

### a) Główne wymagania dotyczące schematu bazy danych

- **Hierarchia treści**: moduł (1/2/3) → kategorie (stałe, twarda kolejność) → materiały (ręczny `order` w obrębie moduł+kategoria).
- **Statusy materiałów**: `draft/published/archived/publish_soon` z regułą widoczności dla pacjenta (tylko `published` i `publish_soon` na listach).
- **Dostęp per moduł**: manualnie ustawiany `start_at`, aktywny 12 miesięcy; brak aktywnego dostępu blokuje akcje; `revoked_at` jako przyszłościowe cofnięcie.
- **Typy materiałów**: możliwość miksowania (PDF + YouTube + tekst Markdown) w jednym materiale.
- **Notatki pacjenta**: prywatne, 1 notatka per pacjent+materiał.
- **Recenzje PZK**: 1 recenzja per pacjent, rating 1–6, treść; widoczne wyłącznie dla użytkowników z aktywnym dostępem do PZK.
- **Presigned URL**: logowanie zdarzeń presign w `events` (sukces/błąd/forbidden) z właściwościami.

### b) Kluczowe encje i ich relacje

- `users` (istniejące) 1—N `pzk_module_access` (dostęp per moduł).
- `pzk_categories` (stałe) 1—N `pzk_materials` (materiał przypisany do dokładnie jednej kategorii).
- `pzk_materials`:
  - atrybuty: `id (uuid)`, `module (smallint)`, `category_id (FK -> pzk_categories.id uuid)`, `status`, `order`, `title` (wymagane), `description` (opcjonalne), `content_md`, `pdf_object_key`, `pdf_file_name`, `youtube_video_id`, timestamps.
  - unikalność kolejności: `UNIQUE(module, category_id, order)`.
- `users` 1—N `pzk_notes`, przy czym `pzk_notes` jest 1:1 względem `(user, material)` przez `UNIQUE(user_id, material_id)`.
- `users` 1—1 `pzk_reviews` przez `UNIQUE(user_id)`.
- `events` (istniejące): wpisy dla presign z `properties` (np. `material_id`, `module`, `reason`, `ttl_seconds`).

### c) Ważne kwestie dotyczące bezpieczeństwa i skalowalności

- **Brak RLS**: autoryzacja w serwisach/API; DB zabezpieczona przez FK/unikaty/checki i konsekwentne filtrowanie statusów.
- **Brak ujawniania draft/archived**: pacjenci nie dostają żadnych metadanych tych statusów; preferowane odpowiedzi jak „brak zasobu”.
- **`publish_soon`**: widoczne w listach i jako disabled detail (tytuł/opis tak, reszta nie).
- **Indeksy** pod krytyczne ścieżki: listowanie po `(status, module, category, order)`, szybkie checki dostępu po `(user_id, module)`, unikatowe indeksy dla notatek i recenzji.
- **Observability**: presign logowany w `events`; indeksy po `event_name` i czasie dla raportowania.

### d) Obszary wymagające doprecyzowania przed finalnym schematem/migracją Drizzle

- Wymaga dopięcia w definicjach tabel: spójne `CHECK` (np. `order > 0`) i dokładne zestawy `NOT NULL` (które pola są wymagane dla `published` vs opcjonalne dla `publish_soon`).

</database_planning_summary>

<unresolved_issues>

Brak.

</unresolved_issues>

</conversation_summary>


