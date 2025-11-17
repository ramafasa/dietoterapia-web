# Invitation Testing Guide

Instrukcja testowania systemu zaproszeń dla aplikacji Dietoterapia.

## 📦 Wygenerowane przykładowe zaproszenie

### Token Details
- **Email:** `pacjent@example.com`
- **Token:** `1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a`
- **Wygasa:** 2025-11-20T19:17:04.871Z (7 dni od utworzenia)
- **Status:** Aktywne (nie wykorzystane)

## 🔗 Linki testowe (localhost)

### Strona rejestracji (signup page)
```
http://localhost:4323/auth/signup?token=1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a
```

**Co powinieneś zobaczyć:**
- ✅ Formularz rejestracji z wypełnionym emailem (`pacjent@example.com`)
- ✅ Pole email jest zablokowane (readonly)
- ✅ Alert z informacją o dacie wygaśnięcia: "Zaproszenie ważne do: 20 listopada 2025"
- ✅ Pola: Imię, Nazwisko, Wiek (opcjonalnie), Płeć (opcjonalnie), Hasło
- ✅ Sekcja zgód RODO z dwoma wymaganymi zgodami
- ✅ Przycisk "Utwórz konto"

### API endpoint (walidacja tokenu)
```
http://localhost:4323/api/invitations/1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a
```

**Oczekiwana odpowiedź (200 OK):**
```json
{
  "valid": true,
  "email": "pacjent@example.com",
  "expiresAt": "2025-11-20T19:17:04.871Z"
}
```

## 🧪 Scenariusze testowe

### ✅ Test 1: Walidacja prawidłowego tokenu (curl)
```bash
curl -s http://localhost:4323/api/invitations/1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a | jq
```

**Wynik:** ✅ Passed
```json
{
  "valid": true,
  "email": "pacjent@example.com",
  "expiresAt": "2025-11-20T19:17:04.871Z"
}
```

---

### ✅ Test 2: Strona rejestracji renderuje się poprawnie
```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:4323/auth/signup?token=1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a"
```

**Wynik:** ✅ Passed (HTTP 200)

---

### ✅ Test 3: Nieprawidłowy token (404 Not Found)
```bash
curl -s http://localhost:4323/api/invitations/invalid-token-12345 | jq
```

**Oczekiwana odpowiedź:**
```json
{
  "error": "not_found",
  "message": "Invitation not found.",
  "statusCode": 404
}
```

**Wynik:** ✅ Passed

---

### ✅ Test 4: Brak parametru token w URL (redirect)
```bash
curl -s -I "http://localhost:4323/auth/signup" | grep -i location
```

**Oczekiwane przekierowanie:**
```
location: /auth/invitation-invalid?reason=missing
```

**Wynik:** ✅ Passed

---

### 🔄 Test 5: Rejestracja z prawidłowym tokenem (E2E)

**Kroki:**
1. Otwórz w przeglądarce:
   ```
   http://localhost:4323/auth/signup?token=1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a
   ```

2. Sprawdź czy formularz się załadował z emailem `pacjent@example.com`

3. Wypełnij formularz:
   - **Imię:** Jan
   - **Nazwisko:** Kowalski
   - **Wiek:** 30 (opcjonalnie)
   - **Płeć:** Mężczyzna (opcjonalnie)
   - **Hasło:** TestPassword123!
   - **Zgody RODO:** Zaznacz obie wymagane zgody

4. Kliknij "Utwórz konto"

**Oczekiwany wynik:**
- ✅ Użytkownik zostaje utworzony w bazie danych
- ✅ Sesja zostaje utworzona (automatyczne logowanie)
- ✅ Zaproszenie zostaje oznaczone jako wykorzystane (`usedAt` != null)
- ✅ Przekierowanie do `/pacjent/waga` (dashboard pacjenta)

**Test programowy (curl):**
```bash
curl -X POST http://localhost:4323/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "invitationToken": "1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "age": 30,
    "gender": "male",
    "password": "TestPassword123!",
    "consents": [
      {
        "type": "data_processing",
        "accepted": true
      },
      {
        "type": "health_data",
        "accepted": true
      }
    ]
  }'
```

**Status:** ⏳ Do przetestowania manualnie

---

### 🔄 Test 6: Próba ponownego użycia tokenu po rejestracji

Po wykonaniu Test 5, sprawdź czy token został unieważniony:

```bash
curl -s http://localhost:4323/api/invitations/1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a | jq
```

**Oczekiwana odpowiedź:**
```json
{
  "valid": false,
  "reason": "expired_or_used"
}
```

**Status:** ⏳ Do przetestowania po wykonaniu Test 5

---

## 🛠️ Generowanie nowego zaproszenia

Jeśli chcesz wygenerować nowe zaproszenie (np. po wykorzystaniu poprzedniego), uruchom:

```bash
npx tsx scripts/create-sample-invitation.ts
```

Skrypt automatycznie:
- ✅ Sprawdzi czy istnieje dietetyk w bazie (jeśli nie, utworzy przykładowego)
- ✅ Wygeneruje kryptograficznie bezpieczny token (32 bajty hex)
- ✅ Ustawi datę wygaśnięcia (+7 dni)
- ✅ Zapisze zaproszenie w tabeli `invitations`
- ✅ Wyświetli gotowe linki do testowania

---

## 📊 Sprawdzanie bazy danych

### Drizzle Studio (GUI)
```bash
npm run db:studio
```

Otwiera się na `http://localhost:4983` - możesz przeglądać i edytować:
- Tabela `invitations` - wszystkie wygenerowane zaproszenia
- Tabela `users` - użytkownicy (po rejestracji)
- Tabela `sessions` - aktywne sesje
- Tabela `consents` - zapisane zgody RODO

### SQL Query (programowo)
```sql
-- Sprawdź wszystkie zaproszenia
SELECT id, email, token, expires_at, used_at, created_at
FROM invitations
ORDER BY created_at DESC;

-- Sprawdź czy użytkownik został utworzony
SELECT id, email, role, first_name, last_name, created_at
FROM users
WHERE email = 'pacjent@example.com';

-- Sprawdź zgody RODO dla użytkownika
SELECT consent_type, accepted, timestamp
FROM consents
WHERE user_id = 'USER_ID_HERE';
```

---

## 🔍 Debugowanie

### Problem: "Token nie istnieje" mimo że wygenerowałeś zaproszenie

**Sprawdź:**
1. Czy używasz prawidłowego portu (sprawdź logi `npm run dev`)
   - Może być 4321, 4322, 4323, etc.
2. Czy token w URL jest kompletny (64 znaki hex)
3. Czy zaproszenie rzeczywiście istnieje w bazie (Drizzle Studio)

### Problem: Formularz się nie ładuje

**Sprawdź:**
1. Czy parametr to `?token=...` a nie `?invitation=...`
2. Czy serwer deweloperski działa (`npm run dev`)
3. Sprawdź logi serwera w terminalu

### Problem: Rejestracja kończy się błędem 400/422

**Sprawdź:**
1. Czy hasło spełnia wymagania (min. 8 znaków, wielka/mała litera, cyfra)
2. Czy obie wymagane zgody RODO są zaznaczone
3. Czy imię i nazwisko są wypełnione
4. Sprawdź szczegóły błędu w konsoli przeglądarki (Network tab)

---

## 📝 Uwagi

### Parametr URL: `token` vs `invitation`
- ✅ **Prawidłowo:** `/auth/signup?token={TOKEN}`
- ❌ **Nieprawidłowo:** `/auth/signup?invitation={TOKEN}`

Strona `signup.astro` oczekuje parametru `token` (linia 18).

### Email w endpoint POST /api/dietitian/invitations
Kod w `src/pages/api/dietitian/invitations.ts` został poprawiony:
- **Przed:** `${appOrigin}/rejestracja?invitation=${invitation.token}`
- **Po:** `${appOrigin}/auth/signup?token=${invitation.token}`

### Bezpieczeństwo tokenu
- Token jest generowany kryptograficznie (`randomBytes(32).toString('hex')`)
- Prawdopodobieństwo kolizji: ~1 na 2^256
- Token jest unikalny w bazie (unique constraint na `invitations.token`)

---

## ✅ Checklist przed production

- [ ] Wszystkie testy E2E przechodzą pomyślnie
- [ ] Walidacja tokenów działa poprawnie (valid/not_found/expired_or_used)
- [ ] Email z zaproszeniem jest wysyłany (test SMTP)
- [ ] Rejestracja tworzy użytkownika z prawidłowymi danymi
- [ ] Zgody RODO są zapisywane w tabeli `consents`
- [ ] Token jest oznaczany jako wykorzystany po rejestracji
- [ ] Użytkownik jest automatycznie logowany po rejestracji
- [ ] Przekierowanie do dashboardu działa poprawnie
- [ ] Audit log rejestruje wszystkie operacje (invitations, users, consents)
- [ ] Analytics events są zapisywane (invitation_created, signup, etc.)

---

**Data utworzenia:** 2025-11-14
**Ostatnia aktualizacja:** 2025-11-14
**Status testów:** Częściowo przetestowane (curl API + renderowanie strony)
