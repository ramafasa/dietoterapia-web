# Dokument wymagań produktu (PRD) - PZK (Przestrzeń Zdrowej Kobiety)

## 1. Przegląd produktu

### 1.1. Kontekst i cel

PZK (Przestrzeń Zdrowej Kobiety) to zamknięta część platformy dietetycznej, w której pacjenci z przyznanym dostępem uzyskują dostęp do materiałów edukacyjnych przygotowanych przez dietetyka (Paulina). 
ateriały obejmują pliki PDF do pobrania, lekcje wideo (YouTube osadzone na stronie) oraz treści tekstowe (notatki do materiału).

Celem MVP jest:
- udostępnienie treści w uporządkowany, przewidywalny sposób (moduły → kategorie → materiały),
- egzekwowanie dostępu per moduł (1/2/3),
- zapewnienie podstawowego poziomu bezpieczeństwa plików (presigned URL o krótkim TTL),
- zapewnienie minimalnej obserwowalności operacyjnej (logi pobrań, błędów i podstawowy audyt),
- umożliwienie pacjentom dodawania recenzji PZK.

### 1.2. Użytkownicy i role

- Pacjent (konto pacjenta): konsumuje treści PZK, pobiera PDF, ogląda wideo, dodaje notatki, przegląda notatki, dodaje recenzję.
- Dietetyk / operacje (konto dietetyka lub rola administracyjna): w MVP nie ma panelu CMS; operacje wykonywane są ręcznie w bazie (nadanie dostępu, publikacja materiałów, ustawianie kolejności).

### 1.3. Zakres MVP (high level)

- Dostęp per moduł (1/2/3), ważny 12 miesięcy od daty startu dostępu dla danego modułu.
- Widoczność wszystkich materiałów dla pacjenta, z blokadą (kłódka) i CTA dla niekupionych modułów.
- Stałe kategorie z twardą kolejnością; materiał ma dokładnie jedną kategorię i ręczną kolejność w ramach listy.
- Statusy publikacji materiałów: draft/published/archived/publish_soon.
- PDF udostępniany przez presigned URL (TTL 1 minuta).
- Wideo YouTube osadzone na stronie materiału; odtwarzanie bez logowania w YouTube; materiał nie powinien być listowany na kanale.
- Recenzje PZK: 1 recenzja na pacjenta, skala 1–6, edycja/usunięcie wyłącznie własnej.
- Minimalna obserwowalność: logowanie pobrań i błędów presigned URL oraz podstawowy audyt.

### 1.4. Założenia i zależności

- Brak płatności w aplikacji w MVP; dostęp jest ustawiany ręcznie w bazie.
- Pliki PDF są przechowywane na zewnętrznym storage (np. AWS S3); aplikacja generuje presigned URL.
- Istnieją konta użytkowników i mechanizmy uwierzytelniania; PZK wymaga ograniczeń dostępu.
- CTA do zakupu prowadzi do jednego wspólnego landing page, z parametrem określającym moduł; link otwierany w nowej karcie.
- Kategorie są z góry zdefiniowane (lista stała), z twardą kolejnością i bez UI do edycji w MVP.

## 2. Problem użytkownika

### 2.1. Problem pacjenta

- Pacjent potrzebuje jednego miejsca, w którym szybko znajdzie materiały edukacyjne dopasowane do wykupionego zakresu (moduły), bez chaosu informacyjnego.
- Pacjent chce widzieć pełny program PZK (co jest dostępne w kolejnych modułach), ale mieć jasne, czytelne oznaczenie, które elementy są już dostępne, 
- a które zablokowane, oraz gdzie może kupić dostęp.
- Pacjent potrzebuje prostego i niezawodnego sposobu na pobieranie materiałów PDF i oglądanie wideo w aplikacji.
- Pacjent chce mieć możliwość podzielenia się opinią o PZK (recenzja) i zobaczyć recenzje innych osób korzystających z PZK.

### 2.2. Problem dietetyka/operacji

- Dietetyk chce dystrybuować treści do pacjentów w kontrolowany sposób, bez budowania pełnego systemu płatności i bez panelu CMS w MVP.
- Dietetyk potrzebuje mechanizmu przyznawania dostępu per moduł i publikowania/ukrywania materiałów.
- Operacyjnie ważne jest, aby mieć podstawową obserwowalność: kto pobiera pliki, jakie występują błędy dostępu (presigned URL) oraz podstawowy ślad działań.

## 3. Wymagania funkcjonalne

### 3.1. Nawigacja i dostęp do PZK

1. Pozycja menu "Przestrzeń Zdrowej Kobiety" jest widoczna dla pacjenta który jest zalogowany i ma dostęp do conajmniej jednego modułu
2. Wejście do PZK prowadzi do widoku z listą modułów, rozwijaną do kategorii, rozwijanych do konkretnych materiałów.
3. Nawigacja w PZK ma hierarchię: Moduł → Kategoria → Lista materiałów → Szczegóły materiału.

### 3.2. Model modułów i reguły dostępu

1. Dostęp jest przyznawany per moduł (1/2/3).
2. Dostęp do modułu ma datę startu ustawianą ręcznie w bazie.
3. Dostęp do modułu jest ważny 12 miesięcy od daty startu (per moduł).
4. Reguła dostępu do materiału: pacjent ma dostęp do materiału wtedy i tylko wtedy, gdy ma aktywny dostęp do modułu przypisanego do materiału oraz materiał jest w statusie published.
5. Założenie operacyjne: nie występuje przypadek, że moduł 2 wygasł, a moduł 1 nie; jednak system nie może polegać na tym założeniu w logice bezpieczeństwa (autoryzacja nadal per moduł).

### 3.3. Widoczność treści i stany UI

1. Pacjent zawsze widzi pełną listę materiałów PZK (dla statusu published), niezależnie od wykupionych modułów.
2. Pacjent zawsze widzi pełną listę materiałów PZK (dla statusu publish_soon), niezależnie od wykupionych modułów.
3. Materiały z modułów, do których pacjent nie ma aktywnego dostępu ale są **published**, są widoczne jako zablokowane:
   - widoczna ikona kłódki,
   - akcje otwarcia/pobrania/wideo są niedostępne,
   - widoczne CTA do zakupu modułu.
4. CTA do zakupu:
   - prowadzi do jednego wspólnego landing page,
   - przekazuje parametr określający moduł,
   - otwiera się w nowej karcie.
5. Dla materiałów zablokowanych UI nie pokazuje komunikatu typu "odblokuje się za X dni"; zamiast tego zawsze pokazuje CTA do zakupu.
6. Materiały w statusie draft i archived są niewidoczne dla pacjentów w PZK.
7. Materiały w statusie "pubish_soon" są widoczne na liście jako wyszarzone i nie ma do nich dostępu dla pacjenta

### 3.4. Kategorie i kolejność

1. Kategorie są stałe (z góry zdefiniowane) i mają twardą kolejność wyświetlania.
2. Materiał ma dokładnie jedną kategorię.
3. Materiały w ramach listy mają ręczną kolejność (`order`) ustawianą przez operacje (w bazie).

### 3.5. Typy materiałów (PDF, wideo, notatki)

1. PDF:
   - materiał może wskazywać plik PDF do pobrania,
   - pobieranie odbywa się poprzez wygenerowanie presigned URL na żądanie.
2. Wideo (YouTube):
   - materiał może zawierać osadzony odtwarzacz YouTube na stronie materiału,
   - odtwarzanie działa bez logowania do YouTube,
   - wideo nie powinno być listowane na kanale (wymóg marketingowo-UX; do realizacji poprzez konfigurację po stronie YouTube).
3. Notatki:
   - materiał może mieć tekstowe notatki dodane przez danego pacjent, to których tylko on/ona ma dostęp

### 3.6. Bezpieczeństwo pobrań PDF (presigned URL)

1. Presigned URL:
   - generowany na kliknięcie użytkownika,
   - ważny 1 minutę od momentu wygenerowania.
2. Autoryzacja:
   - presigned URL może zostać wydany wyłącznie dla zalogowanego pacjenta, który ma aktywny dostęp do modułu materiału.
3. Wymagania operacyjne bezpieczeństwa:
   - założenie produktu: ograniczamy możliwość udostępniania plików; ryzyko udostępnienia linku w oknie 1 minuty jest akceptowane w MVP (z możliwością wzmocnienia w kolejnych iteracjach).

### 3.7. Recenzje PZK

1. Dostęp do sekcji recenzji mają wyłącznie pacjenci z dostępem do co najmniej jednego modułu PZK (aktywnego).
2. Każdy pacjent może mieć maksymalnie jedną recenzję.
3. Recenzja zawiera:
   - ocenę w skali 1–6,
   - treść recenzji,
   - datę dodania/aktualizacji,
   - imię pacjenta (źródło: profil pacjenta).
4. Pacjent może:
   - dodać recenzję, jeśli jeszcze jej nie ma,
   - edytować tylko własną recenzję,
   - usunąć tylko własną recenzję.
5. Brak moderacji recenzji w MVP.
6. Recenzje są widoczne wyłącznie w obszarze PZK.

### 3.8. Minimalna obserwowalność i audyt

1. Logi pobrań plików:
   - kto pobrał (identyfikator użytkownika),
   - jaki plik/materiał,
   - kiedy (timestamp),
   - wynik (sukces/porażka).
2. Logi błędów presigned URL:
   - nieudane generowanie presigned URL,
   - próby pobrania bez uprawnień,
   - wygaśnięcie URL (jeśli wykrywalne w aplikacji),
   - inne istotne błędy dostępu.
3. Podstawowy audyt:
   - minimalny zestaw zdarzeń do audytu w MVP obejmuje pobrania oraz błędy dostępu; pozostałe zdarzenia (np. zmiany dostępu, zmiany materiałów) są pożądane, ale mogą wymagać doprecyzowania zakresu i retencji.

### 3.9. Wymagania niefunkcjonalne (MVP)

1. Responsywność: widoki PZK muszą być czytelne i używalne na mobile i desktop.
2. Dostępność: podstawowa obsługa klawiaturą oraz czytelność elementów (kontrasty, focus states) dla list materiałów i CTA.
3. Stabilność: błędy pobrania lub błędy wideo muszą mieć komunikaty dla użytkownika i nie mogą blokować całej strony.

## 4. Granice produktu

### 4.1. W zakresie MVP

- Ręczne przyznawanie dostępu w bazie (moduł + data startu).
- Struktura: moduły (1/2/3), kategorie stałe, materiały z ręczną kolejnością.
- Wyświetlanie materiałów zablokowanych (kłódka + CTA).
- Wyświetlanie materiałów w statuse publish_soon jako wyszarzonych z brakiem mozliwosci otworzenia
- Generowanie presigned URL na kliknięcie (TTL 1 minuta) i logowanie pobrań/błędów.
- Odtwarzanie wideo YouTube osadzone na stronie materiału.
- Recenzje PZK (1 na pacjenta, edycja/usunięcie własnej, skala 1–6).

### 4.2. Poza zakresem MVP

- Płatności w aplikacji, subskrypcje, fakturowanie.
- Panel administracyjny/CMS do zarządzania treściami i dostępami (zarządzanie wykonywane ręcznie w bazie).
- Zaawansowana analityka produktowa (event tracking, lejki, kohorty).
- Moderacja recenzji, zgłaszanie nadużyć, automatyczna filtracja treści.
- Zaawansowane zabezpieczenia anty-udostępnianie plików (np. watermarking, wiązanie presigned URL z IP/UA, limity pobrań na użytkownika).
- Publiczna strona recenzji (poza PZK).

## 5. Historyjki użytkowników

### US-001: Wejście do PZK z menu

- ID: US-001
- Tytuł: Wejście do Przestrzeni Zdrowej Kobiety
- Opis: Jako pacjent chcę móc wejść do PZK z menu aplikacji, aby przeglądać materiały.
- Kryteria akceptacji:
  - Gdy pacjent jest zalogowany, widzi w nawigacji pozycję prowadzącą do PZK.
  - Kliknięcie pozycji PZK otwiera widok startowy PZK.
  - Jeśli pacjent nie jest zalogowany i wejdzie bezpośrednio na URL PZK, zostaje przekierowany do logowania lub otrzymuje ekran wymagający logowania.

### US-002: Widok startowy PZK z wyborem modułu

- ID: US-002
- Tytuł: Wybór modułu w PZK
- Opis: Jako pacjent chcę wybrać moduł (1/2/3), aby przeglądać materiały w ramach danego modułu.
- Kryteria akceptacji:
  - Widok startowy PZK prezentuje wybór modułu 1/2/3.
  - Wybór modułu przenosi użytkownika do listy kategorii w tym module.
  - W UI jest jasno widoczne, który moduł jest aktualnie wybrany.

### US-003: Przegląd kategorii w module

- ID: US-003
- Tytuł: Lista kategorii w module
- Opis: Jako pacjent chcę widzieć kategorie w ramach wybranego modułu, aby łatwo znaleźć interesujące mnie materiały.
- Kryteria akceptacji:
  - Kategorie są wyświetlane w stałej, z góry określonej kolejności.
  - Kliknięcie kategorii rozwija listę materiałów w tej kategorii.
  - Jeżeli w danej kategorii nie ma materiałów, UI wyświetla komunikat o braku materiałów.

### US-004: Lista materiałów w kategorii z ręczną kolejnością

- ID: US-004
- Tytuł: Lista materiałów w kategorii
- Opis: Jako pacjent chcę widzieć listę materiałów w wybranej kategorii w ustalonej kolejności, aby przechodzić przez program logicznie.
- Kryteria akceptacji:
  - Materiały są sortowane według pola `order` rosnąco.
  - Materiały w statusie draft i archived nie są widoczne.
  - Dla każdego materiału widoczne są co najmniej: tytuł i krótki opis (jeśli istnieje).

### US-005: Widoczność zablokowanych materiałów z kłódką

- ID: US-005
- Tytuł: Oznaczenie zablokowanych materiałów
- Opis: Jako pacjent chcę widzieć materiały z niewykupionych modułów jako zablokowane, aby rozumieć co jest dostępne, a co wymaga zakupu.
- Kryteria akceptacji:
  - Jeśli pacjent nie ma aktywnego dostępu do modułu materiału, materiał ma stan zablokowany.
  - W stanie zablokowanym widoczna jest ikona kłódki.
  - Akcje otwarcia/pobrania/odtworzenia nie są dostępne dla zablokowanego materiału.

### US-006: CTA do zakupu modułu z parametrem i nową kartą

- ID: US-006
- Tytuł: Przekierowanie do zakupu modułu
- Opis: Jako pacjent chcę móc kliknąć CTA przy zablokowanym materiale, aby przejść do strony zakupu właściwego modułu.
- Kryteria akceptacji:
  - Dla zablokowanego materiału wyświetlane jest CTA do zakupu modułu.
  - Kliknięcie CTA otwiera landing page w nowej karcie.
  - URL landing page zawiera parametr określający moduł (1/2/3) odpowiadający modułowi materiału.

### US-007: Wejście w szczegóły odblokowanego materiału

- ID: US-007
- Tytuł: Otwieranie materiału dostępnego
- Opis: Jako pacjent chcę otworzyć szczegóły materiału z modułu, do którego mam dostęp, aby skorzystać z treści.
- Kryteria akceptacji:
  - Jeśli pacjent ma aktywny dostęp do modułu materiału, może otworzyć stronę szczegółów materiału.
  - Strona szczegółów pokazuje tytuł, opis i treści dostępne dla typu materiału (PDF/wideo/notatki).
  - Jeżeli pacjent wejdzie bezpośrednio na URL materiału bez dostępu, widzi wersję zablokowaną (kłódka + CTA), bez możliwości pobrania/odtworzenia.

### US-008: Pobranie PDF przez presigned URL

- ID: US-008
- Tytuł: Pobieranie PDF
- Opis: Jako pacjent chcę pobrać PDF z materiału, aby móc korzystać z dokumentu offline.
- Kryteria akceptacji:
  - Dla materiału typu PDF widoczny jest przycisk pobrania.
  - Kliknięcie pobrania wywołuje wygenerowanie presigned URL i rozpoczęcie pobierania.
  - Presigned URL ma TTL 1 minuta od wygenerowania.
  - Jeśli pacjent nie ma dostępu do modułu, przycisk pobrania nie jest dostępny.

### US-009: Obsługa błędów pobrania PDF

- ID: US-009
- Tytuł: Komunikaty przy błędach pobrania PDF
- Opis: Jako pacjent chcę otrzymać zrozumiały komunikat, gdy pobranie PDF się nie uda, aby wiedzieć co zrobić dalej.
- Kryteria akceptacji:
  - Gdy generowanie presigned URL się nie uda, UI pokazuje komunikat o błędzie i możliwość ponowienia.
  - Gdy pobranie nie powiedzie się z powodu braku uprawnień, UI pokazuje komunikat o braku dostępu i CTA do zakupu.
  - Błąd nie powoduje utraty stanu nawigacji (użytkownik pozostaje w materiale).

### US-010: Odtwarzanie wideo YouTube na stronie materiału

- ID: US-010
- Tytuł: Odtwarzanie wideo w materiale
- Opis: Jako pacjent chcę obejrzeć lekcję wideo w materiale, aby nie musieć przechodzić na YouTube.
- Kryteria akceptacji:
  - Dla materiału z wideo wyświetlany jest osadzony odtwarzacz YouTube.
  - Odtwarzanie działa bez potrzeby logowania do YouTube.
  - Jeśli pacjent nie ma dostępu do modułu, wideo nie jest odtwarzalne i UI pokazuje stan zablokowany z CTA.

### US-011: Obsługa błędów wideo

- ID: US-011
- Tytuł: Komunikaty przy błędach odtwarzania wideo
- Opis: Jako pacjent chcę otrzymać komunikat, gdy wideo nie może zostać odtworzone, aby wiedzieć co zrobić dalej.
- Kryteria akceptacji:
  - Jeśli osadzony odtwarzacz nie załaduje się, UI pokazuje komunikat o problemie i opcję odświeżenia.
  - Komunikat nie ujawnia informacji wrażliwych (np. szczegółów technicznych backendu).

### US-012: Dodanie notatek do materiału

- ID: US-012
- Tytuł: Notatki do materiału
- Opis: Jako pacjent chcę dodać notatki do materiału.
- Kryteria akceptacji:
    - Pacjent może dodac notatki do materiału w postaci tekstu..
    - notatka jest dodana tylko do materiału konkretnego pacjenta. Inni pacjenci jej nie widzą

### US-013: Wyświetlanie notatek do materiału

- ID: US-013
- Tytuł: Notatki do materiału
- Opis: Jako pacjent chcę przeczytać swoje notatki do materiału.
- Kryteria akceptacji:
  - Jeśli materiał ma notatki tekstowe dodane przez danego pacjenta, są one wyświetlane na stronie materiału.
  - Notatki są dostępne tylko dla pacjenta z dostępem do modułu materiału oraz jeśli notatka została dodana przez niego.

### US-014: Widoczność materiałów tylko w statusie published

- ID: US-014
- Tytuł: Ukrywanie materiałów nieopublikowanych
- Opis: Jako pacjent chcę widzieć tylko opublikowane materiały, aby nie trafiać na treści niegotowe.
- Kryteria akceptacji:
  - Materiały w statusie draft nie są widoczne na listach ani w wynikach nawigacji PZK.
  - Materiały w statusie archived nie są widoczne na listach ani w wynikach nawigacji PZK.
  - Bezpośrednie wejście na URL draft/archived zwraca odpowiedź jak dla braku zasobu lub brak uprawnień (zgodnie z decyzją bezpieczeństwa), bez ujawniania metadanych materiału.

### US-015: Dostęp do recenzji tylko dla pacjentów z dostępem do PZK

- ID: US-015
- Tytuł: Ograniczenie recenzji do użytkowników PZK
- Opis: Jako pacjent z dostępem do PZK chcę mieć możliwość przeglądania i dodania recenzji, aby podzielić się opinią.
- Kryteria akceptacji:
  - Sekcja recenzji jest widoczna tylko dla zalogowanych pacjentów z co najmniej jednym aktywnym dostępem do modułu PZK.
  - Próba wejścia na URL recenzji bez dostępu kończy się komunikatem o braku dostępu (bez ujawniania szczegółów).

### US-016: Dodanie recenzji (1 na pacjenta)

- ID: US-016
- Tytuł: Dodanie recenzji PZK
- Opis: Jako pacjent chcę dodać jedną recenzję PZK, aby ocenić materiały i doświadczenie.
- Kryteria akceptacji:
  - Jeśli pacjent nie ma jeszcze recenzji, widzi formularz dodania recenzji.
  - Ocena jest wymagana i jest liczbą całkowitą w zakresie 1–6.
  - Treść recenzji jest wymagana.
  - Po zapisie recenzja jest widoczna na liście recenzji.

### US-017: Edycja własnej recenzji

- ID: US-017
- Tytuł: Edycja recenzji
- Opis: Jako pacjent chcę edytować swoją recenzję, aby zaktualizować opinię.
- Kryteria akceptacji:
  - Pacjent może edytować tylko swoją recenzję.
  - Po zapisaniu zmian zaktualizowana recenzja jest widoczna na liście recenzji.
  - Walidacja oceny 1–6 oraz wymagalność treści obowiązują także w edycji.

### US-018: Usunięcie własnej recenzji

- ID: US-018
- Tytuł: Usunięcie recenzji
- Opis: Jako pacjent chcę usunąć swoją recenzję, aby nie była już widoczna.
- Kryteria akceptacji:
  - Pacjent może usunąć tylko swoją recenzję.
  - Usunięta recenzja znika z listy recenzji.
  - Po usunięciu pacjent może ponownie dodać recenzję (ponieważ limit dotyczy aktywnej recenzji).

### US-019: Prezentacja recenzji na liście

- ID: US-019
- Tytuł: Wyświetlanie listy recenzji PZK
- Opis: Jako pacjent chcę widzieć listę recenzji PZK, aby poznać opinie innych użytkowników.
- Kryteria akceptacji:
  - Lista recenzji pokazuje dla każdej recenzji: imię pacjenta, datę dodania, ocenę (1–6) i treść.
  - Recenzje są widoczne wyłącznie w obszarze PZK.

### US-020: Autoryzacja dostępu do PZK (wymóg bezpieczeństwa)

- ID: US-020
- Tytuł: Kontrola dostępu do treści PZK
- Opis: Jako właściciel produktu chcę, aby dostęp do chronionych treści był kontrolowany, aby tylko uprawnieni pacjenci mogli je otwierać i pobierać.
- Kryteria akceptacji:
  - Każde żądanie dostępu do materiału (w tym generowanie presigned URL) wymaga zalogowanego użytkownika.
  - System odmawia dostępu do materiału, jeśli użytkownik nie ma aktywnego dostępu do modułu materiału.
  - System nie ujawnia wrażliwych informacji o zasobach przy braku uprawnień (np. nie zwraca presigned URL ani metadanych draft/archived).

### US-021: Logowanie pobrań plików

- ID: US-021
- Tytuł: Rejestrowanie pobrań PDF
- Opis: Jako operacje chcę mieć logi pobrań plików, aby móc diagnozować problemy i mieć podstawową obserwowalność.
- Kryteria akceptacji:
  - Każde pobranie PDF zapisuje wpis logu zawierający: identyfikator użytkownika, identyfikator materiału/pliku, timestamp i status.
  - Log jest zapisywany zarówno dla sukcesu, jak i porażki (o ile aplikacja może to stwierdzić).

### US-022: Logowanie błędów presigned URL

- ID: US-022
- Tytuł: Rejestrowanie błędów dostępu do PDF
- Opis: Jako operacje chcę mieć logi błędów generowania/wykorzystania presigned URL, aby szybko wykrywać i rozwiązywać problemy.
- Kryteria akceptacji:
  - Nieudane generowanie presigned URL zapisuje wpis logu z przyczyną błędu (w granicach bezpieczeństwa).
  - Próba pobrania bez uprawnień zapisuje wpis logu.

### US-023: Podstawowy audyt zdarzeń PZK

- ID: US-023
- Tytuł: Podstawowy audyt zdarzeń
- Opis: Jako operacje chcę mieć podstawowy ślad działań związanych z PZK, aby móc wyjaśniać incydenty i pytania użytkowników.
- Kryteria akceptacji:
  - System przechowuje zdarzenia związane z pobraniami i błędami dostępu (co najmniej).
  - Dane audytowe zawierają timestamp oraz identyfikator użytkownika (jeśli dotyczy).

### US-024: Ręczne nadanie dostępu do modułu (operacje)

- ID: US-024
- Tytuł: Nadanie dostępu w bazie danych
- Opis: Jako operacje chcę móc nadać pacjentowi dostęp do modułu poprzez wpis w bazie, aby uruchomić dostęp bez płatności w aplikacji.
- Kryteria akceptacji:
  - Dostęp jest przypisany do pacjenta i modułu (1/2/3).
  - Dostęp ma datę startu ustawianą ręcznie.
  - System interpretuje dostęp jako aktywny przez 12 miesięcy od daty startu.

### US-025: Wygasanie dostępu po 12 miesiącach

- ID: US-025
- Tytuł: Wygasanie dostępu do modułu
- Opis: Jako pacjent chcę, aby dostęp wygasał zgodnie z zasadami, aby system był przewidywalny i uczciwy.
- Kryteria akceptacji:
  - Po upływie 12 miesięcy od daty startu dostęp do modułu jest traktowany jako nieaktywny.
  - Materiały tego modułu przechodzą w stan zablokowany (kłódka + CTA), bez możliwości pobrania/odtworzenia.


### US-026: Zachowanie użyteczności na mobile

- ID: US-026
- Tytuł: Użyteczność PZK na urządzeniach mobilnych
- Opis: Jako pacjent korzystający z telefonu chcę wygodnie nawigować po modułach i materiałach, aby móc używać PZK w codziennym trybie.
- Kryteria akceptacji:
  - Widoki: wybór modułu, lista kategorii, lista materiałów i szczegóły materiału są responsywne i nie wymagają poziomego scrolla na typowych szerokościach mobile.
  - Elementy interaktywne (CTA, przyciski) mają odpowiednie rozmiary i odstępy.

## 6. Metryki sukcesu

### 6.1. Metryki operacyjne (MVP, wymagane)

- Liczba prób pobrania PDF (sukces/porażka) w ujęciu dziennym/tygodniowym.
- Odsetek błędów generowania presigned URL (błędy / wszystkie próby).
- Odsetek prób pobrania bez uprawnień (wskaźnik potencjalnych problemów z UX lub nadużyć).
- Liczba incydentów zgłoszonych przez użytkowników dotyczących dostępu do materiałów (manualny monitoring, jeśli brak systemu ticketowego).

### 6.2. Metryki jakości doświadczenia (MVP, opcjonalne do wyliczenia na bazie logów)

- Czas do pierwszego skutecznego pobrania po wejściu do materiału (proxy dla sprawności przepływu).
- Liczba użytkowników z dostępem, którzy obejrzeli przynajmniej jedno wideo lub pobrali przynajmniej jeden PDF w okresie 30 dni (proxy dla aktywacji).

### 6.3. Metryki recenzji (MVP)

- Liczba dodanych recenzji (łączna) i odsetek pacjentów z dostępem, którzy dodali recenzję.
- Średnia ocena (1–6) oraz rozkład ocen.

### 6.4. Kryteria sukcesu dla MVP (progi do ustalenia)

- Stabilność pobrań: odsetek sukcesów pobrań PDF na poziomie docelowym (próg do ustalenia).
- Niski poziom błędów presigned URL oraz szybka diagnozowalność dzięki logom.
- Powstanie wiarygodnej sekcji recenzji (liczba recenzji umożliwiająca społeczny dowód słuszności w obrębie PZK).

### 6.5. Lista kontrolna (weryfikacja PRD)

- Czy każdą historię użytkownika można przetestować? Tak: każda historia ma kryteria akceptacji weryfikowalne w UI i/lub poprzez logi.
- Czy kryteria akceptacji są jasne i konkretne? Tak: kryteria opisują warunki wejścia, zachowanie systemu i oczekiwany rezultat.
- Czy mamy wystarczająco dużo historyjek użytkownika, aby zbudować w pełni funkcjonalną aplikację? Tak: obejmują nawigację, dostęp, blokady, pobrania, wideo, recenzje, logowanie i operacje.
- Czy uwzględniliśmy wymagania dotyczące uwierzytelniania i autoryzacji? Tak: US-001 i US-019 obejmują logowanie i kontrolę dostępu do treści oraz presigned URL.

