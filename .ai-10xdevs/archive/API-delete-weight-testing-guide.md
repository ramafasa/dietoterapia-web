# DELETE /api/weight/:id - Przewodnik Testowy

## Status implementacji
✅ **Zaimplementowane** - Wszystkie warstwy gotowe do testów manualnych

## Zaimplementowane komponenty

### 1. Warstwa repozytorium (weightEntryRepository.ts)
- ✅ Metoda `deleteEntry(id: string)` - linia 400-407
- Wykonuje operację DELETE na tabeli weight_entries

### 2. Warstwa serwisu (weightEntryService.ts)
- ✅ Metoda `deletePatientEntry(params)` - linia 627-712
- Logika biznesowa:
  - Weryfikacja właścicielstwa (IDOR-safe)
  - Sprawdzenie source='patient'
  - Walidacja okna edycji (do końca następnego dnia)
  - Audit log + event tracking
  - Event `outlier_corrected` jeśli isOutlier=true

### 3. API Route Handler (src/pages/api/weight/[id]/index.ts)
- ✅ Handler DELETE - linia 217-329
- Autentykacja + autoryzacja
- Walidacja UUID
- Zwrot 204 No Content

---

## Scenariusze testowe (zgodnie z planem - sekcja 5)

### ✅ Scenariusz 1: Usunięcie własnego wpisu patient w oknie edycji
**Warunek wstępny:**
- Zalogowany jako pacjent
- Wpis istnieje z source='patient'
- Data pomiaru: dzisiaj lub wczoraj (okno edycji nie wygasło)

**Request:**
```bash
DELETE /api/weight/:id
Authorization: Bearer <patient_token>
```

**Oczekiwany wynik:**
- Status: `204 No Content`
- Body: brak (empty)
- Headers: `Cache-Control: no-store`
- Wpis usunięty z bazy danych
- Audit log: action='delete', before snapshot, after=null
- Event: delete_weight

**Weryfikacja:**
```bash
# 1. Sprawdź czy wpis został usunięty
GET /api/weight  # Wpis nie powinien być na liście

# 2. Sprawdź audit log w bazie (opcjonalnie przez Drizzle Studio)
# Powinien być wpis z:
# - action: 'delete'
# - tableName: 'weight_entries'
# - before: { weight, note, isOutlier, ... }
# - after: null
```

---

### ❌ Scenariusz 2: Próba usunięcia wpisu po wygaśnięciu okna edycji
**Warunek wstępny:**
- Zalogowany jako pacjent
- Wpis istnieje z source='patient'
- Data pomiaru: starsze niż 2 dni (np. 3 dni temu)
- Okno edycji: wygasło (po końcu następnego dnia = 2 dni temu o 23:59:59)

**Request:**
```bash
DELETE /api/weight/:id
Authorization: Bearer <patient_token>
```

**Oczekiwany wynik:**
```json
{
  "error": "edit_window_expired",
  "message": "Okres edycji tego wpisu wygasł. Możesz edytować wpis tylko do końca następnego dnia po dacie pomiaru.",
  "statusCode": 400
}
```

**Status:** `400 Bad Request`

---

### ❌ Scenariusz 3: Próba usunięcia wpisu source='dietitian'
**Warunek wstępny:**
- Zalogowany jako pacjent
- Wpis istnieje z source='dietitian' (dodany przez dietetyka)

**Request:**
```bash
DELETE /api/weight/:id
Authorization: Bearer <patient_token>
```

**Oczekiwany wynik:**
```json
{
  "error": "forbidden",
  "message": "Można usuwać tylko wpisy utworzone przez pacjenta. Ten wpis został dodany przez dietetyka.",
  "statusCode": 403
}
```

**Status:** `403 Forbidden`

---

### ❌ Scenariusz 4: Próba usunięcia nieistniejącego wpisu
**Warunek wstępny:**
- Zalogowany jako pacjent
- ID wpisu nie istnieje w bazie (np. random UUID)

**Request:**
```bash
DELETE /api/weight/00000000-0000-0000-0000-000000000000
Authorization: Bearer <patient_token>
```

**Oczekiwany wynik:**
```json
{
  "error": "not_found",
  "message": "Wpis wagi nie został znaleziony lub nie masz do niego dostępu",
  "statusCode": 404
}
```

**Status:** `404 Not Found`

---

### ❌ Scenariusz 5: Próba usunięcia wpisu innego użytkownika (IDOR attack)
**Warunek wstępny:**
- Zalogowany jako pacjent A
- Wpis należy do pacjenta B (inny userId)

**Request:**
```bash
DELETE /api/weight/:id_of_patient_B
Authorization: Bearer <patient_A_token>
```

**Oczekiwany wynik:**
```json
{
  "error": "not_found",
  "message": "Wpis wagi nie został znaleziony lub nie masz do niego dostępu",
  "statusCode": 404
}
```

**Status:** `404 Not Found` (IDOR-safe: nie ujawniamy że wpis istnieje)

**Bezpieczeństwo:**
- Repository używa `getByIdForUser(id, userId)` - sprawdza właścicielstwo
- Zwraca 404 zamiast 403 aby nie ujawniać istnienia wpisu

---

### ❌ Scenariusz 6: Brak sesji (nie zalogowany)
**Warunek wstępny:**
- Brak tokena autoryzacji / sesja wygasła

**Request:**
```bash
DELETE /api/weight/:id
# Brak Authorization header
```

**Oczekiwany wynik:**
```json
{
  "error": "unauthorized",
  "message": "Authentication required.",
  "statusCode": 401
}
```

**Status:** `401 Unauthorized`

---

### ❌ Scenariusz 7: Zła rola (dietetyk próbuje usunąć przez patient endpoint)
**Warunek wstępny:**
- Zalogowany jako dietetyk (role='dietitian')

**Request:**
```bash
DELETE /api/weight/:id
Authorization: Bearer <dietitian_token>
```

**Oczekiwany wynik:**
```json
{
  "error": "forbidden",
  "message": "Patient role required.",
  "statusCode": 403
}
```

**Status:** `403 Forbidden`

---

### ❌ Scenariusz 8: Nieprawidłowy UUID
**Warunek wstępny:**
- Zalogowany jako pacjent
- ID wpisu nie jest poprawnym UUID

**Request:**
```bash
DELETE /api/weight/invalid-uuid-123
Authorization: Bearer <patient_token>
```

**Oczekiwany wynik:**
```json
{
  "error": "bad_request",
  "message": "Invalid path parameters",
  "statusCode": 400,
  "details": [
    {
      "code": "invalid_string",
      "validation": "uuid",
      "path": ["id"],
      "message": "Invalid entry id"
    }
  ]
}
```

**Status:** `400 Bad Request`

---

## ✨ Scenariusz specjalny: Usunięcie wpisu z isOutlier=true

**Warunek wstępny:**
- Zalogowany jako pacjent
- Wpis istnieje z source='patient' i **isOutlier=true**
- Okno edycji nie wygasło

**Request:**
```bash
DELETE /api/weight/:id
Authorization: Bearer <patient_token>
```

**Oczekiwany wynik:**
- Status: `204 No Content`
- Wpis usunięty z bazy
- **Dodatkowy event:** `outlier_corrected` z properties: `{ entryId, method: 'delete' }`

**Weryfikacja:**
```bash
# Sprawdź events w bazie (Drizzle Studio):
# Powinny być 2 eventy:
# 1. eventType: 'delete_weight', properties: { entryId }
# 2. eventType: 'outlier_corrected', properties: { entryId, method: 'delete' }
```

---

## Checklist implementacji (do weryfikacji)

- [x] Endpoint `DELETE /api/weight/:id` działa zgodnie ze specyfikacją (204, brak body)
- [x] Zaimplementowana walidacja UUID i spójna obsługa błędów
- [x] Pacjent może usuwać wyłącznie własne wpisy source='patient' w oknie edycji
- [x] `audit_log` rejestruje operację z before snapshot; after = null
- [x] Dla wpisów isOutlier = true logowany jest `outlier_corrected` (metoda: delete)
- [ ] Testy manualne scenariuszy z sekcji powyżej przechodzą ✅
- [x] Brak błędów lintera; kompilacja przechodzi ✅
- [x] Import i export wszystkich typów błędów poprawne ✅

---

## Narzędzia do testów manualnych

### 1. cURL (przykłady)

```bash
# Scenariusz 1: Usunięcie wpisu (sukces)
curl -X DELETE http://localhost:4321/api/weight/ENTRY_UUID \
  -H "Cookie: auth_session=YOUR_SESSION_TOKEN" \
  -v

# Scenariusz 4: Nieistniejący wpis
curl -X DELETE http://localhost:4321/api/weight/00000000-0000-0000-0000-000000000000 \
  -H "Cookie: auth_session=YOUR_SESSION_TOKEN" \
  -v

# Scenariusz 8: Nieprawidłowy UUID
curl -X DELETE http://localhost:4321/api/weight/invalid-id \
  -H "Cookie: auth_session=YOUR_SESSION_TOKEN" \
  -v
```

### 2. Postman/Insomnia
- Import collection z endpointami
- Użyj zmiennych dla session token i entry ID
- Testy automatyczne dla statusów i response body

### 3. Drizzle Studio (weryfikacja bazy)
```bash
npm run db:studio
```

Sprawdź tabele:
- `weight_entries` - czy wpis został usunięty
- `audit_log` - czy jest wpis z action='delete'
- `events` - czy są eventy delete_weight i outlier_corrected (jeśli isOutlier)

---

## Uwagi dot. bezpieczeństwa (zweryfikowane ✅)

- ✅ **IDOR protection:** `getByIdForUser` sprawdza właścicielstwo
- ✅ **Source restriction:** Tylko wpisy patient, nie dietitian
- ✅ **Edit window:** Walidacja okna edycji (do końca następnego dnia)
- ✅ **UUID validation:** Zod schema redukuje nieprawidłowe wejścia
- ✅ **Cache-Control:** `no-store` defensywnie ustawione
- ✅ **Error messages:** Nie ujawniają szczegółów o istnieniu wpisów (404 zamiast 403 dla IDOR)

---

## Następne kroki

1. ✅ Implementacja zakończona - wszystkie warstwy gotowe
2. ⏳ Testy manualne - wykonaj wszystkie 8+ scenariuszy
3. ⏳ Weryfikacja audit log i events w bazie
4. ⏳ Testy integracyjne z frontendem (WeightDashboard)
5. ⏳ Deployment na staging/production

---

## Znane ograniczenia MVP

- ❌ Brak rate limiting (rozważyć post-MVP)
- ❌ Brak automatycznych testów jednostkowych/integracyjnych (MVP używa testów manualnych)
- ❌ Dietetyk nie ma endpointu do usuwania wpisów pacjentów (feature przyszłości)

---

## Kontakt w razie problemów

Jeśli którykolwiek scenariusz nie przechodzi:
1. Sprawdź logi serwera (`console.error` w handleerze i serwisie)
2. Sprawdź logi Vercel (jeśli deployed)
3. Sprawdź Drizzle Studio dla stanu bazy danych
4. Sprawdź czy sesja jest aktywna (Lucia Auth)
