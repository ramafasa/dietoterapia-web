# Polityka prywatności – zmiany związane ze sklepem – PROJEKT

> Dotyczy: `src/pages/polityka-prywatnosci.astro` (ostatnia aktualizacja: 7 stycznia 2026).
> **Status:** projekt, nie porada prawna. Do akceptacji przez Paulinę, zalecany przegląd prawnika razem z regulaminem.
> Zmiany oznaczone jako **[NOWE]**, **[ZMIANA]** lub **[NAPRAWA]** (niezgodność istniejąca już dziś).

---

## [NAPRAWA] Meta Pixel jest nieopisany

Polityka w sekcji 8c mówi: *„Obecnie nie wykorzystujemy narzędzi marketingowych/remarketingowych”*, ale strona ładuje **Meta Pixel** (`src/components/MetaPixel.astro`, po zgodzie w `CookieBanner`). To trzeba poprawić niezależnie od sklepu, a sklep dokłada zdarzenia zakupowe.

---

## Sekcja 2. Podstawy prawne – [ZMIANA]

W punkcie **lit. b** zamień przykład na:

> Art. 6 ust. 1 lit. b RODO – wykonanie umowy lub podjęcie działań na żądanie osoby przed zawarciem umowy (np. utworzenie konta, zakup dostępu do platformy Przestrzeń Zdrowej Kobiety (PZK), **zakup e-booków w sklepie internetowym**, konsultacje dietetyczne)

W punkcie **lit. f** dopisz przykład: *„…dochodzenie lub obrona roszczeń, **wykazanie złożenia oświadczeń wymaganych przy zakupie treści cyfrowych**)”*.

---

## Sekcja 3. Cele i zakres przetwarzania

### e) – [ZMIANA] tytuł i treść

> **e) Konto użytkownika (Strefa Pacjenta, PZK, konto w sklepie)**
> Dane zbierane: adres e-mail, hasło (w postaci zaszyfrowanego skrótu), imię i nazwisko (opcjonalnie), historia dostępu do PZK, **historia zakupów w sklepie**, zgody (RODO)
> Cel: utworzenie i utrzymanie konta, logowanie, udostępnienie funkcji Strefy Pacjenta, materiałów PZK **oraz zakupionych e-booków**
> Podstawa prawna: wykonanie umowy (Art. 6 ust. 1 lit. b RODO)
> **Konto w sklepie jest dobrowolne. Zakup e-booka jest możliwy bez zakładania konta.**

### f) – [ZMIANA] tytuł i treść

> **f) Realizacja zamówień i płatności (PZK, sklep z e-bookami)**
> Dane zbierane: adres e-mail, imię (opcjonalnie), **numer i treść zamówienia, treść i data oświadczeń złożonych przy zamówieniu (akceptacja regulaminu, zgoda na dostarczenie treści cyfrowej przed upływem terminu odstąpienia), dane do faktury, jeśli zażądano faktury (nazwa firmy, NIP, adres)**, dane transakcyjne (identyfikator transakcji, status, kwota)
> Cel: zawarcie i wykonanie umowy, **dostarczenie e-booka (link do pobrania wysyłany e-mailem)**, aktywacja dostępu do PZK, **wystawienie faktury**, obsługa reklamacji, **wykazanie złożenia wymaganych oświadczeń**, dochodzenie lub obrona roszczeń
> Podstawa prawna: wykonanie umowy (Art. 6 ust. 1 lit. b RODO), obowiązek prawny – przepisy podatkowe i rachunkowe (Art. 6 ust. 1 lit. c RODO), prawnie uzasadniony interes – dowód oświadczeń i obrona roszczeń (Art. 6 ust. 1 lit. f RODO)

### i) – [NOWE]

> **i) Pomiar skuteczności reklam (Meta Pixel)**
> Narzędzie: Meta Pixel (Meta Platforms Ireland Ltd.)
> Dane: identyfikatory plików cookies, adres IP, informacje o przeglądarce i urządzeniu, zdarzenia na stronie: wyświetlenie strony, wyświetlenie produktu, dodanie do koszyka, rozpoczęcie zamówienia, zakup (wraz z wartością zamówienia). **Nie przekazujemy Meta adresu e-mail ani innych danych z formularza zamówienia.**
> Cel: mierzenie skuteczności reklam w serwisach Facebook i Instagram oraz kierowanie reklam do osób, które odwiedziły serwis
> Podstawa prawna: zgoda (Art. 6 ust. 1 lit. a RODO), wyrażana w banerze cookies. Narzędzie nie jest uruchamiane bez zgody.

---

## Sekcja 4. Okres przechowywania – [ZMIANA]

Zastąp punkt „Zakupy i dane transakcyjne” i dopisz nowe:

> - **Zamówienia, dane transakcyjne i dane do faktur: 5 lat od końca roku kalendarzowego, w którym dokonano zakupu** (przepisy podatkowe), następnie dane osobowe są anonimizowane. W tym okresie zakupione e-booki można ponownie pobrać.
> - **Link do pobrania e-booka: ważny 30 dni od wygenerowania**
> - **Konto w sklepie niepotwierdzone w ciągu 30 dni: usuwane automatycznie**
> - Konto użytkownika (Strefa Pacjenta/PZK/sklep): do czasu usunięcia konta. **Usunięcie konta nie powoduje usunięcia danych zamówień przed upływem okresu wskazanego wyżej.**

---

## Sekcja 5. Odbiorcy danych – [ZMIANA]

- **Płatności:** `Tpay S.A.` → **[nazwa operatora do weryfikacji z umową, np. Krajowy Integrator Płatności S.A., Poznań]** (operator płatności) – Polska. *Ta sama poprawka co w regulaminie.*
- **Przechowywanie plików:** „Przechowywanie plików PZK (PDF)” → **„Przechowywanie plików PZK i e-booków (PDF): Cloudflare R2 (Cloudflare, Inc.) – [region bucketu do sprawdzenia w panelu Cloudflare]”**. *Obecny tekst „np. Cloudflare R2 lub AWS S3 – w zależności od konfiguracji” jest za ogólny. Wpisać faktycznego dostawcę.*
- **[NOWE] Reklama:** **Meta Platforms Ireland Ltd. (Meta Pixel) – Irlandia; możliwe przekazanie do Meta Platforms, Inc. (USA) na podstawie decyzji Komisji Europejskiej w sprawie odpowiedniego stopnia ochrony (EU-US Data Privacy Framework) lub standardowych klauzul umownych.**

---

## Sekcja 6. Prawa osób – [DOPISEK]

Pod listą praw dopisz:

> **Konto w sklepie możesz usunąć samodzielnie w ustawieniach konta (Moje konto → Ustawienia → Usuń konto).** Kopię swoich danych (prawo dostępu i przenoszenia) otrzymasz po wysłaniu prośby na adres dietoterapia@paulinamaciak.pl.

---

## Sekcja 8. Pliki cookies – [ZMIANA]

### a) Cookies niezbędne – dopisz

> W ramach sklepu stosujemy także:
> - **plik cookie `sklep_checkout`** (ważny 24 godziny), który pozwala wyświetlić status płatności i pobrać e-book bezpośrednio po zakupie,
> - **zapis zawartości koszyka w pamięci przeglądarki (localStorage)**: lista wybranych produktów przechowywana wyłącznie na Twoim urządzeniu, nieprzesyłana na nasz serwer do czasu złożenia zamówienia.

### c) Cookies marketingowe – [NAPRAWA] zastąp całą treść

> **c) Cookies marketingowe**
> Za Twoją zgodą wyrażoną w banerze cookies uruchamiamy Meta Pixel (patrz pkt 3 lit. i), który zapisuje pliki cookies dostawcy (Meta) w celu pomiaru skuteczności reklam i kierowania reklam. Zgodę możesz w każdej chwili wycofać, zmieniając ustawienia w banerze cookies lub usuwając pliki cookies w przeglądarce.

---

## Stopka – [ZMIANA]

- „Data ostatniej aktualizacji: 7 stycznia 2026” → **„1 listopada 2026”** (ta sama data co wejście regulaminu).
- Sprawdź niespójność adresu: meta `description` strony mówi „Gaj 5, 95-060 Brzeziny”, treść „Gaj 5, 95-060 Gaj”. Ujednolicić (ta sama wartość w regulaminie).

---

## Checklist zgodności przy wdrożeniu

- [ ] W formularzu zamówienia link do polityki prywatności przy checkboxie (Task 7.2).
- [ ] Meta Pixel: `content_ids` to slugi produktów, nigdy e-mail (Task 7.1).
- [ ] `CookieBanner.tsx`: opis kategorii marketingowej spójny z nową sekcją 8c (sprawdzić tekst w linii ~148).
- [ ] Rejestr czynności przetwarzania (jeśli Paulina go prowadzi): dopisać „sprzedaż e-booków”.
