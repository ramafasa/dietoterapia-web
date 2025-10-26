# Dokument wymagań produktu (PRD) - Dietoterapia Waga

## 1. Przegląd produktu

Cel: Rozwinięcie aktulnej aplikacji webowej Pauliny (dietetyk) o funkjonalność do regularnego raportowania masy ciała pacjentów oraz dla Pauliny do monitorowania postępów i domykania braków danych bez konieczności ręcznego upominania w komunikatorach.

Zakres MVP:

* Brak wsparcia dla multi-tenant - Single-tenant dla Dietoterapia (Paulina jako jedyny dietetyk-administrator).
* Tylko web (desktop + mobile-web).
* Konta pacjentów i konto dietetyka.
* Codzienne wpisy wagi, 1/dzień, edycja i backfill.
* Automatyczne przypomnienia piątek 19:00 i niedziela 11:00, strefa Europe/Warsaw, tydzień: poniedziałek 00:00 – niedziela 23:59.
* Widoki: pacjent (dodawanie, historia), dietetyk (per pacjent: dziś/ten tydzień/zakres dat, wykres).
* Analityka i KPI: ≥1 wpis pacjenta/tydzień; raporty kohortowe.
* Compliance: RODO, hosting w UE (Vercel), szyfrowanie, retencja, anonimizacja.

Kluczowe decyzje operacyjne:

* Przypomnienia: e-mail + web push (pre-CTA po pierwszym dodaniu; fallback e-mail). Harmonogram: pt 19:00 i nd 11:00; jeśli pacjent doda wagę po pt 19:00, pomiń oba przypomnienia; jeśli doda do nd 11:00, pomiń niedzielne.
* Walidacje wagi: dokładność 0,1 kg; zakres 30–250 kg; jeden wpis/dzień; edycja do końca następnego dnia; backfill do 7 dni z oznaczeniem; flagowanie skoku >3 kg/24h z prośbą o potwierdzenie.
* Tagowanie źródła wpisu (pacjent/dietetyk). Wpis dietetyka zwalnia z obowiązku tygodniowego.
* Onboarding przez zaproszenia e-mail; rejestracja z hasłem; zgody na przetwarzanie danych zdrowotnych.
* Statusy pacjenta: aktywny, wstrzymany, zakończony (wstrzymany wyłącza przypomnienia i wyklucza z KPI).
* Wykres 30/90 dni z MA7, outliery, wyróżnienie wpisów dietetyka, opcjonalna linia celu.

Interesariusze:

* Dietetyk (Paulina) – właścicielka procesu, odbiorca panelu.
* Pacjenci – użytkownicy raportujący wagę.
* PM/Analityk (w MVP to konto Payliny) – odbiorca panelu KPI i raportów.
* Zespół techniczny – implementacja, utrzymanie, bezpieczeństwo.

Założenia:

* Strefa czasowa stała: Europe/Warsaw (z obsługą DST).
* Nadawca e-mail: [dietoterapia@paulinamaciak.pl](mailto:dietoterapia@paulinamaciak.pl) (SMTP istnieje).
* Baza danych: Postgres (preferencja; dostawca do wyboru), hosting w UE.

## 2. Problem użytkownika

Paulina regularnie prosi pacjentów o przesłanie aktualnej wagi przez komunikator, jednak część osób zapomina lub nie odpowiada, przez co brakuje danych do monitoringu postępów. P
aulina traci czas na ręczne upomnienia i ręczne przepisywanie/porządkowanie danych. Pacjentom brakuje prostego rytuału wprowadzania wagi i czytelnej historii postępów.

Cele rozwiązania:

* Zwiększyć odsetek tygodni z ≥1 wpisem pacjenta dzięki automatycznym przypomnieniom i szybkiemu dodawaniu wagi.
* Zapewnić Paulinie przejrzysty podgląd postępów per pacjent i możliwość uzupełniania danych po rozmowach telefonicznych.
* Zmniejszyć obciążenie Pauliny powtarzalną komunikacją i przetwarzaniem danych.
* Zapewnić zgodność z RODO i bezpieczeństwo danych zdrowotnych.

## 3. Wymagania funkcjonalne

3.1 Konta i role

* Role: pacjent, dietetyk (administrator single-tenant).
* Zaproszenia e-mail od dietetyka; rejestracja pacjenta: imię, nazwisko, wiek, płeć, e-mail, hasło (≥8 znaków), zgody RODO (log treści i momentu).
* Logowanie hasłem; sesja 30 dni z rotacją tokenu; reset hasła linkiem czasowym; 2FA poza MVP.
* Autoryzacja: pacjent widzi i edytuje wyłącznie własne wpisy; dietetyk widzi wpisy i metryki pacjentów.

3.2 Wprowadzanie wagi

* Jeden wpis na dzień (z możliwością edycji do końca następnego dnia).
* Backfill do 7 dni wstecz, oznaczony jako backfill.
* Walidacje: 30–250 kg; dokładność 0,1 kg; format liczbowy; odrzucenie wielokrotnych wpisów w tym samym dniu (chyba że edycja).
* Pola i metadane: waga, czas pomiaru, czas dodania, źródło (pacjent/dietetyk), notatka opcjonalna, flagi (backfill, outlier), pełny audit log (tworzenie, edycje, kto/kiedy).
* Wpis dietetyka zwalnia z obowiązku tygodniowego pacjenta.

3.3 Przypomnienia

* Kanały: web push (po pre-CTA) z fallbackiem na e-mail.
* Harmonogram: piątek 19:00 i niedziela 11:00 (Europe/Warsaw, z DST).
* Logika pominięć: jeśli pacjent doda wpis po piątku 19:00 – pominąć oba; jeśli doda do niedzieli 11:00 – pominąć niedzielne.
* Warunki wysyłki: tylko status aktywny; status wstrzymany wyłącza przypomnienia; zakończony – brak wysyłek.
* Idempotencja i deduplikacja wysyłek; retry/backoff dla push; rejestrowanie reminder_sent/open/click.

3.4 Interfejs pacjenta

* Szybkie dodanie wagi w 1–2 kliknięciach (mobile-first).
* Historia pomiarów z możliwością edycji w dozwolonym oknie; oznaczenia backfill/outlier/źródło.
* Informacja o spełnieniu obowiązku tygodniowego.
* Pre-CTA do włączenia web push po pierwszym dodaniu wagi; ustawienia preferencji kanału.

3.5 Interfejs dietetyka

* Widok per pacjent: zakładki „Dziś”, „Ten tydzień”, zakres dat; lista wpisów i możliwość dodania wagi w imieniu pacjenta (z notatką).
* Wykres: 30/90 dni, linia trendu (MA7), oznaczenia outlierów i wpisów dietetyka, opcjonalna linia celu (per pacjent).
* Zarządzanie statusem pacjenta: aktywny/wstrzymany/zakończony (reaktywacja zachowuje historię).
* Uwaga: dashboard zbiorczy „kto dodał/kto nie” pozostaje do decyzji; w MVP widok per pacjent.

3.6 Anomalie i jakość danych

* Automatyczne flagowanie skoku >3 kg/24 h; prośba o potwierdzenie/zamianę wpisu.
* Ostrzeżenia UI przy nietypowych wartościach w dopuszczalnym zakresie.
* Audit log wszystkich zmian (kto, co, kiedy, przed/po).

3.7 Analityka i raportowanie

* Instrumentacja eventów: view_add_weight, add_weight_patient, add_weight_dietitian, edit_weight, reminder_sent, reminder_open, reminder_click, login, signup, consent_accept.
* KPI: odsetek tygodni z ≥1 wpisem pacjenta (liczony per pacjent; status wstrzymany wykluczony); panel PM z przeglądem KPI.
* Raporty kohortowe tygodniowe (okna 4-tygodniowe) z porównaniem skuteczności przypomnień.

3.8 Bezpieczeństwo i RODO

* Hosting w UE (Vercel); szyfrowanie TLS in-transit i at-rest.
* Retencja: 24 miesiące od nadania statusu „zakończony”.
* Usunięcie konta: anonimizacja PII + pseudonimizacja identyfikatorów; logowanie treści i momentu zgód.
* Role i separacja dostępu; dzienniki bezpieczeństwa.
* Wiek: w MVP brak mechanizmu opiekuńczego; temat do DPIA.

3.9 Operacje i niezawodność

* Harmonogram CRON jako źródło prawdy dla przypomnień; joby idempotentne z ochroną przed duplikatami.
* Monitoring i alerting awarii wysyłek; raport błędów w panelu ops.
* E-mail: integracja z istniejącym SMTP; deliverability (SPF/DKIM/DMARC) – do konfiguracji.

## 4. Granice produktu

Poza zakresem MVP:

* Aplikacje mobilne natywne (iOS/Android).
* Multi-tenant (więcej niż jeden dietetyk).
* 2FA.
* Eksport CSV/PDF raportów.
* Dashboard zbiorczy „kto dodał/kto nie” (wymaga decyzji).
* Pełne i18n (MVP tylko język polski).
* Zaawansowane preferencje komunikacyjne (np. opt-down dla e-mail przypomnień, jeśli uznane za transakcyjne; do decyzji).

Otwarte kwestie wymagające decyzji/analizy:

* Czy w MVP dodać dashboard zbiorczy dla dietetyka (lista wszystkich pacjentów z bieżącym statusem wpisu)?
* Konfiguracja SPF/DKIM/DMARC i polityki DMARC oraz monitoring odbić.
* Implementacja web push: szczegóły service workera, wersjonowanie, retry/backoff, fallback UX.
* Wybór i lokalizacja bazy danych (np. Postgres/Supabase/Neon), polityka backupów (RPO/RTO), monitoring.
* DPIA + polityka dla nieletnich (oświadczenie „≥16 lat”/zgoda opiekuna).
* Treści i branding e-maili/push; ewentualna obsługa rezygnacji; preferencje kanałów.
* Mechanika CRON: orkiestracja, idempotencja, retry, deduplikacja.
* Integracja baseline’u z obecnego procesu WhatsApp do porównań.
* Czy włączyć opcjonalną linię celu w wykresie w MVP (wymaga prostego formularza celu).

## 5. Historyjki użytkowników

US-001
Tytuł: Dietetyk zaprasza pacjenta
Opis: Jako dietetyk chcę wysłać zaproszenie e-mail do pacjenta, aby mógł utworzyć konto.
Kryteria akceptacji:

* Given posiadam e-mail pacjenta, When wyślę zaproszenie, Then pacjent otrzymuje e-mail z unikalnym linkiem rejestracyjnym ważnym min. 24 h.
* Link może być użyty tylko raz; ponowne wysłanie unieważnia poprzedni.
* Zdarzenie audit i event signup_invite_sent są rejestrowane.

US-002
Tytuł: Rejestracja pacjenta z hasłem i zgodami
Opis: Jako pacjent chcę zarejestrować konto i wyrazić wymagane zgody, aby korzystać z aplikacji.
Kryteria akceptacji:

* Formularz: imię, nazwisko, wiek, płeć, e-mail (z zaproszenia), hasło ≥8 znaków, checkboxy zgód.
* Brak możliwości kontynuacji bez wymaganych zgód; log treści i timestamp zgód.
* Po rejestracji automatyczne zalogowanie i ważność sesji 30 dni.
* Eventy signup_completed i consent_accept rejestrowane.

US-003
Tytuł: Logowanie pacjenta
Opis: Jako pacjent chcę zalogować się e-mailem i hasłem.
Kryteria akceptacji:

* Poprawne dane logują i tworzą sesję 30 dni z rotacją tokenu.
* 5 nieudanych prób blokuje logowanie na 15 minut.
* Event login_success/failed rejestrowane.

US-004
Tytuł: Wylogowanie
Opis: Jako użytkownik chcę się wylogować.
Kryteria akceptacji:

* Kliknięcie „Wyloguj” unieważnia bieżącą sesję.
* Brak dostępu do zasobów wymagających autoryzacji po wylogowaniu.

US-005
Tytuł: Reset hasła
Opis: Jako użytkownik chcę zresetować hasło linkiem czasowym.
Kryteria akceptacji:

* Żądanie resetu wysyła e-mail z linkiem ważnym 60 minut.
* Po zmianie hasła wszystkie aktywne sesje tracą ważność.
* Event password_reset_requested/completed rejestrowane.

US-006
Tytuł: RBAC i ograniczenie dostępu
Opis: Jako system chcę egzekwować role pacjent/dietetyk.
Kryteria akceptacji:

* Pacjent nie może przeglądać cudzych danych ani paneli dietetyka.
* Dietetyk nie ma dostępu do ustawień konta pacjenta poza przeglądem danych zdrowotnych i statusem.
* Próby naruszenia dostępu są logowane.

US-010
Tytuł: Szybkie dodanie dzisiejszej wagi
Opis: Jako pacjent chcę dodać dzisiejszą wagę w 1–2 kliknięciach.
Kryteria akceptacji:

* Pole liczby z walidacją 30–250 i krokiem 0,1 kg.
* Po zapisie widoczny komunikat sukcesu i aktualizacja historii.
* Event add_weight_patient rejestrowany z metadanymi.

US-011
Tytuł: Walidacja i jeden wpis dziennie
Opis: Jako system chcę wymusić 1 wpis/dzień i prawidłowy zakres.
Kryteria akceptacji:

* Drugi zapis tego samego dnia powoduje edycję istniejącego lub blokadę z komunikatem (zależnie od ścieżki edycji).
* Wartości poza zakresem odrzucane z informacją o akceptowalnym zakresie.

US-012
Tytuł: Edycja do końca następnego dnia
Opis: Jako pacjent chcę móc poprawić wczorajszy/dzisiejszy wpis.
Kryteria akceptacji:

* Edycja możliwa do 23:59 następnego dnia po dacie pomiaru.
* Audit log zapisuje starą i nową wartość, czas, użytkownika.
* Event edit_weight rejestrowany.

US-013
Tytuł: Backfill do 7 dni
Opis: Jako pacjent chcę uzupełnić brakujące dni do 7 dni wstecz.
Kryteria akceptacji:

* Wpisy >7 dni wstecz są blokowane z komunikatem.
* Wpisy backfill oznaczone flagą i widoczne w historii.

US-014
Tytuł: Notatka do wpisu
Opis: Jako pacjent chcę dodać krótką notatkę (np. „po treningu”).
Kryteria akceptacji:

* Pole notatki do 200 znaków; zapis wraz z wpisem; edytowalne zgodnie z oknem edycji.
* Widoczne dla dietetyka i pacjenta.

US-015
Tytuł: Historia pomiarów
Opis: Jako pacjent chcę przeglądać i filtrować historię.
Kryteria akceptacji:

* Lista z datą pomiaru, wagą, źródłem, flagami backfill/outlier.
* Filtry po zakresie dat; sortowanie malejąco po dacie.

US-016
Tytuł: Potwierdzanie anomalii
Opis: Jako pacjent chcę potwierdzić lub skorygować wpis oznaczony jako skok >3 kg/24 h.
Kryteria akceptacji:

* Widoczny baner przy wpisie z opcją „Potwierdź” lub „Popraw”.
* Po potwierdzeniu znika flaga outlier_confirmed; po poprawie liczy się nowa wartość.
* Eventy outlier_flagged/outlier_confirmed/outlier_corrected rejestrowane.

US-017
Tytuł: Włączenie web push po pierwszym dodaniu (pre-CTA)
Opis: Jako pacjent chcę łatwo włączyć powiadomienia push.
Kryteria akceptacji:

* Po pierwszym add_weight wyświetla się pre-CTA z wyjaśnieniem i przyciskiem „Włącz”.
* Jeśli przeglądarka nie wspiera push, pokazany fallback UX i ustawienie preferencji e-mail.

US-020
Tytuł: Widok dietetyka per pacjent – dziś/tydzień/zakres
Opis: Jako dietetyk chcę widzieć wpisy pacjenta dla wybranego zakresu.
Kryteria akceptacji:

* Zakładki „Dziś”, „Ten tydzień”, „Zakres dat”.
* Lista wpisów z notatkami, źródłem i flagami.
* Szybka informacja, czy obowiązek tygodniowy spełniony.

US-021
Tytuł: Dietetyk dodaje wagę za pacjenta
Opis: Jako dietetyk chcę wprowadzić wagę w imieniu pacjenta z notatką.
Kryteria akceptacji:

* Wpis oznaczony jako „dietetyk” i zalicza obowiązek tygodniowy.
* Walidacje jak dla pacjenta; audit log wskazuje dietetyka jako autora.

US-022
Tytuł: Wykres pacjenta
Opis: Jako dietetyk chcę zobaczyć wykres 30/90 dni z MA7 i oznaczeniami.
Kryteria akceptacji:

* Widoczna linia MA7; outliery wyróżnione; wpisy dietetyka oznaczone.
* Opcjonalna linia celu, jeśli cel ustawiony.

US-023
Tytuł: Zarządzanie statusem pacjenta
Opis: Jako dietetyk chcę zmieniać status na aktywny/wstrzymany/zakończony.
Kryteria akceptacji:

* Wstrzymany: brak przypomnień i wykluczenie z KPI.
* Zakończony: brak przypomnień, start liczenia retencji.
* Zmiany statusu w audit logu.

US-030
Tytuł: Przypomnienie w piątek 19:00
Opis: Jako system chcę wysłać przypomnienie do osób bez wpisu w tygodniu.
Kryteria akceptacji:

* Wysyłka 19:00 Europe/Warsaw z uwzględnieniem DST.
* Pomiń pacjentów, którzy dodali wpis po 19:00 tego dnia.
* Event reminder_sent zapisany per kanał.

US-031
Tytuł: Przypomnienie w niedzielę 11:00
Opis: Jako system chcę ponowić przypomnienie w niedzielę.
Kryteria akceptacji:

* Wysyłka 11:00 Europe/Warsaw tylko do osób nadal bez wpisu.
* Pomiń pacjentów, którzy dodali wpis do 11:00 w niedzielę.
* Event reminder_sent i open/click rejestrowane.

US-032
Tytuł: Preferencje kanałów przypomnień
Opis: Jako pacjent chcę zarządzać web push i fallback e-mail.
Kryteria akceptacji:

* Przełącznik w ustawieniach: włącz/wyłącz push; e-mail jako fallback gdy push niedostępny.
* Zmiany zapisane i respektowane przez harmonogram.

US-033
Tytuł: Suppression wg statusu i wpisu dietetyka
Opis: Jako system chcę nie wysyłać przypomnień, gdy nie trzeba.
Kryteria akceptacji:

* Status wstrzymany/zakonczony – brak wysyłek.
* Wpis dietetyka w tygodniu – brak wysyłek do końca tygodnia.
* Wpis pacjenta w tygodniu – brak wysyłek do końca tygodnia.

US-034
Tytuł: Harmonogram i idempotencja jobów
Opis: Jako system chcę bezpiecznie planować wysyłki.
Kryteria akceptacji:

* Każdy job posiada klucz idempotencji; ponowne uruchomienie nie duplikuje wysyłek.
* Retry/backoff dla błędów push

US-040
Tytuł: Instrumentacja eventów produktowych
Opis: Jako PM chcę mieć pełną telemetrię kluczowych akcji.
Kryteria akceptacji:

* Eventy z ustalonym schematem właściwości (user_id, timestamp, channel, source, flags).
* Dane dostępne do raportów tygodniowych.

US-041
Tytuł: Panel KPI i definicja sukcesu
Opis: Jako PM chcę widzieć odsetek tygodni z ≥1 wpisem pacjenta.
Kryteria akceptacji:

* KPI liczony per pacjent/tydzień; wstrzymani wykluczeni.
* Widok trendu 4-tygodniowego i porównania kohort.

US-042
Tytuł: Raport kohortowy tygodniowy
Opis: Jako PM chcę automatyczny raport skuteczności.
Kryteria akceptacji:

* Raport generowany co tydzień; zawiera KPI, open/click, skuteczność pt vs nd.
* Eksport podglądowy w UI (CSV/PDF post-MVP).

US-050
Tytuł: Anonimizacja przy usunięciu konta
Opis: Jako pacjent chcę usunąć konto w sposób zgodny z RODO.
Kryteria akceptacji:

* PII anonimizowane; identyfikatory pseudonimizowane; historia wag bez PII.
* Retencja dla „zakończony”: 24 mies. od nadania statusu; po tym okresie usunięcie/pseudonimizacja zgodnie z polityką.

US-051
Tytuł: Audit log zmian danych
Opis: Jako admin chcę pełny dziennik zmian.
Kryteria akceptacji:

* Każda operacja create/update/delete na wpisach i statusach ma rekord: kto, co, przed/po, kiedy.
* Możliwość filtrowania po użytkowniku i dacie.

US-052
Tytuł: Szyfrowanie danych
Opis: Jako system chcę szyfrować dane w tranzycie i spoczynku.
Kryteria akceptacji:

* TLS dla wszystkich połączeń; szyfrowanie at-rest na poziomie bazy/dostawcy.
* Testy penetracyjne podstawowe przed produkcją.

US-053
Tytuł: Konfiguracja SMTP nadawcy
Opis: Jako system chcę wysyłać e-maile z [dietoterapia@paulinamaciak.pl](mailto:dietoterapia@paulinamaciak.pl).
Kryteria akceptacji:

* Wysyłki przechodzą podstawowe kontrole; logujemy status dostarczeń/odbicia.
* [Do decyzji] SPF/DKIM/DMARC skonfigurowane i przetestowane.

US-060
Tytuł: Service worker i web push
Opis: Jako system chcę poprawnie rejestrować i aktualizować SW.
Kryteria akceptacji:

* Rejestracja SW, wersjonowanie, strategia retry/backoff, obsługa braku wsparcia.
* Tokeny push rotowane i unieważniane przy wylogowaniu.

US-090
Tytuł: Dostępność i responsywność UI pacjenta
Opis: Jako pacjent chcę wygodnego UI na telefonie i z klawiaturą.
Kryteria akceptacji:

* WCAG AA dla kluczowych przepływów; focus states; aria-label dla przycisku „Dodaj wagę”.
* Widoki działają poprawnie na szerokości 360–1440 px.

## 6. Metryki sukcesu

Metryka główna:

* ≥60% tygodni z ≥1 wpisem pacjenta (liczone per pacjent; tygodnie z pacjentem o statusie wstrzymany wykluczone).

Metryki wspierające:

* Odsetek pacjentów, którzy włączyli web push po pre-CTA.
* Skuteczność przypomnień: open rate/click rate piątek vs niedziela; lift vs brak przypomnień.
* Średni czas od przypomnienia do wpisu.
* Odsetek tygodni domkniętych wpisem przez dietetyka.
* Odsetek wpisów z flagą outlier oraz ich potwierdzeń/poprawek.
* Udział backfill w całości wpisów.
* Stabilność i niezawodność: błąd wysyłek <1%/tydzień; czas odpowiedzi UI P95 <300 ms dla kluczowych widoków; dostępność 99,5%.

Definicje i źródła:

* Eventy produktowe z sekcji 3.7 są jedynym źródłem dla KPI.
* Raporty kohortowe tygodniowe (okna 4-tygodniowe) publikowane w panelu PM.
* Wszystkie wskaźniki obliczane w strefie Europe/Warsaw, tydzień pn–nd.

Uwagi dot. weryfikacji:

* Każda historyjka posiada kryteria akceptacji w formie testowalnej (Given/When/Then).
* Pokrycie historyjek obejmuje uwierzytelnianie, autoryzację, wprowadzanie/edycję danych, przypomnienia, anomalie, wykresy, statusy, analitykę i compliance.
* Otwarte kwestie w sekcji 4 wymagają decyzji przed startem implementacji odpowiednich elementów.
