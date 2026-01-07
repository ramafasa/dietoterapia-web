### Główny problem
Paulina (konto dietetyk) chce dostarczyć swoim klientom (konta pacjent) dostęp do platformy o nazwie "Przestrzen Zdrowej Kobiety" 
na której pacjenci z wykupionym dostepem mają dostęp do:
- różnego rodzaju  dokumenty PDF do ściągnięcia ze strony przygotowane przez Paulinę. Dokumenty będą przechowywane na zewnętrznym dysku (np. AWS s3)
- Lekcje wideo w formie osadzonych na stronie filmów na YouTube (prywatnych) + notatek do filmów


### Najmniejszy zestaw funkcjonalności
- Pacjent, którego konto ma dostęp do Przestrzeni Zdrowej Kobiety (PZD) widzi w menu górnym pozycję "Przestrzen Zdrowej Kobiety"
- Pacjent widzi materialy pogrupowane w odpowiednie kategorie np. (lista nie jest zamknięta, poxniej bedziemy doprecyzowywac)
  - Lekcje wideo
  - Diety
  - Plany treningowe
  - Plany suplementacji
- Caly cykl zycia PZD to 3 m-ce.
- Pacjent wykupuje dostep na 1-mc lub od razu na 3-mce.
- Materialy udostepnione przez Pauline beda przypisane do konkretnego m-ca
- Od razu po dodaniu dostepu widzi na liscie wszyskie materialy, ale moze otworzyc/sciagnac tylko te, za do ktorych ma w aktualnym momencie dostep
- Materialy do ktorych nie ma dostepu widzi na liscie z kłódką, co świadczy o tym, że nie ma do nich dostępu
- platforma PZD powinna miec moduł recenzji, na którym pacjentki pogą ocenić materiały (nie konkretne lecz zbiorczo) oraz napisać recenzję
- w MVP nie ma plastnosci na platformie - bedziemy recznie w bazie oznaczac pacjentki, ktore maja dostep do platformy i na który m-c (1, 2, lub 3)
- system powinien zachęcać do wykupienia dostępu do kolejnych modułów/miesiąców po zakoczeni aktualnego (o ile nie ostatni)

### Co NIE wchodzi w zakres MVP
- Płatność za dostęp do platformy
