# Sklep z ebookami – decyzje projektowe

Ustalone 2026-10-20 (sesja „grilling”). Źródło prawdy dla `plan.md`.

| # | Obszar | Decyzja |
|---|---|---|
| 1 | Konto a zakup | Zakup **bez konta**. Opcjonalne konto z historią zakupów. Ebooki i PZK są rozdzielone: każda sekcja panelu widoczna tylko przy posiadanym dostępie. |
| 2 | Panel klientki ebooków | Klientka samych ebooków widzi tylko **Moje zakupy** i **Ustawienia**. Bez Wagi, bez PZK. |
| 3 | Model ról | Nowa rola **`customer`**. Waga tylko dla `patient`. `/rejestracja` bez zmian (tworzy `patient`). Pacjent kupujący ebooka zostaje `patient`. |
| 4 | Dostarczenie pliku | Link z maila `/sklep/pobierz/{token}` ważny **30 dni**, bez limitu pobrań. Formularz **„Wyślij link ponownie”**. PDF przez presigned URL z R2 (TTL 5 min). Przez konto i „wyślij link” dostęp przez okres retencji zamówienia (5 lat od końca roku zakupu, regulamin § 7). Plik wydawany dopiero po wysłaniu potwierdzenia umowy mailem (art. 21 ust. 1 u.p.k.). |
| 5 | Formularz i faktury | E-mail (wymagany), imię (opcjonalne). Checkbox regulaminu i checkbox zgody na natychmiastowe dostarczenie / utratę prawa odstąpienia (art. 38 ust. 1 pkt 13 u.p.k.). **Faktura na żądanie**: checkbox „Chcę fakturę” (NIP, nazwa, adres), Paulina wystawia ręcznie. Sprzedawca na **zwolnieniu podmiotowym z VAT** (art. 113), czyli faktura „zw”. |
| 6 | Katalog | Tabela `products` (slug, cena, status, plik w R2). Treść strony produktu w **Astro Content Collection** (`src/content/ebooks/*.md`). Nowe ebooki dodaje programista. |
| 7 | Koszyk | **Koszyk w UI.** Model `shop_orders` + `shop_order_items`. Każdy ebook najwyżej raz, bez ilości. |
| 8 | Przechowywanie koszyka | **localStorage**, w koszyku tylko slugi. Ceny zawsze z serwera. |
| 9 | Zakładanie konta | (a) Link z maila zamówienia „Załóż konto” (token dowodzi własności skrzynki). (b) Checkbox **„Załóż konto”** z hasłem przy zamówieniu: konto `customer` niepotwierdzone (`emailVerifiedAt = NULL`), logowanie zablokowane do kliknięcia „Potwierdź konto” w mailu. Istniejące konto na ten e-mail: „Zaloguj się”, zakup przypisujemy po zalogowaniu i kliknięciu linku. Zalogowana osoba kupuje z e-mailem z konta, zamówienie od razu z `userId`. Niepotwierdzone konta usuwamy po 30 dniach. |
| 10 | Płatności | **Osobny webhook sklepu** `/api/sklep/platnosc/callback`, zawsze aktywny. Kod PZK bez zmian. `transactions.userId` nullable + `transactions.shopOrderId`. Nowa flaga **`FF_SKLEP`**. |
| 11 | URL-e | Publicznie `/sklep/*`. Panel: **`/konto/zakupy`**, **`/konto/ustawienia`** (obie role). Pacjent widzi link „Moje ebooki”, jeśli ma zakupy. |
| 12 | Znak wodny | **Brak** w MVP. Pole `shop_order_items.fileObjectKey` na przyszłość. |
| 13 | Obsługa przez Paulinę | Maile powiadomień (temat **[FAKTURA]** przy prośbie o fakturę) + **`/dietetyk/zamowienia`** tylko do odczytu, z przyciskiem „Wyślij link ponownie”. Zwroty ręcznie w panelu Tpay. |
| 14 | Meta Pixel | `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase` (raz na zamówienie). Tylko w przeglądarce, tylko za zgodą cookies. Bez Conversions API. |
| 15 | RODO | Zamówienia trzymamy **5 lat** (od końca roku podatkowego, art. 6 ust. 1 lit. c), potem anonimizacja. Po usunięciu konta zakupy zostają dostępne przez „Wyślij link ponownie”. |
| 16 | Promocje | **Brak** promocji i kodów w MVP. **`product_price_history`** od pierwszego dnia (Omnibus). |

## Domyślne rozwiązania techniczne (zaakceptowane)

- Nieopłacone zamówienia (`pending`) po 24 h zmieniają status na `expired`.
- Strona sukcesu odpytuje status zamówienia. Webhook jest idempotentny.
- Numer zamówienia `ZAM-RRRR-NNNNN` (sekwencja w Postgresie).
- Jeden dzienny cron `/api/cron/shop-maintenance`.
- Testy: Vitest (unit + integration z testcontainers) + 1 test E2E Playwright (sandbox Tpay).

## Ustalenia doprecyzowane przy pisaniu planu

- **Usunięcie konta:** w kodzie **nie ma** endpointów RODO (`/api/user/delete-account`, `/api/user/export-data` są w CLAUDE.md tylko jako „planned”). Plan dodaje usuwanie konta **tylko dla roli `customer`**. Eksport danych w MVP realizujemy na żądanie mailowe (tak już mówi polityka prywatności).
- **Pacjent bez PZK:** link „Przestrzeń Zdrowej Kobiety” w nawigacji pacjenta zostaje jak dziś, bo prowadzi do bramki zakupu PZK. Rozdzielenie dotyczy klientek `customer`: one nigdy nie widzą PZK ani Wagi.
- **Regulamin:** w serwisie nie ma żadnego regulaminu, także dla PZK. Plan tworzy `/regulamin-sklepu` dla ebooków. Regulamin PZK to osobny temat (patrz „Ryzyka” w planie).

## Ustalenia po review prawnym regulaminu (2026-10-20)

- **Trwały nośnik:** mail potwierdzający zawiera istotne postanowienia umowy w treści oraz regulamin jako załącznik PDF. Sam link do strony nie wystarcza (TSUE C‑49/11).
- **Kolejność:** plik jest dostępny (strona sukcesu, link, konto) dopiero po wysłaniu potwierdzenia (`shop_orders.confirmationSentAt`). Gdy wysyłka się nie uda, ponawia ją cron.
- **Model umowy:** prezentacja produktu z ceną = oferta (art. 66 k.c.). Kliknięcie „Zamawiam i płacę” = przyjęcie oferty, umowa zawarta.
- **Płatność po 24 h:** zwrot albo, na wniosek, realizacja. W MVP mail do Pauliny z prośbą o decyzję.
- **Do decyzji Pauliny:** czy wyraża zgodę na pozasądowe rozwiązywanie sporów (regulamin § 11). Informację trzeba umieścić w mailu odrzucającym reklamację.
