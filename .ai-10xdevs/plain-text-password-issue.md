# Plain Text Password Issue - Client-Side Hashing Implementation Plan

**Problem:** Hasła są wysyłane jako plain text w request body (widoczne w DevTools Network tab).

**Rozwiązanie:** Client-side hashing z SHA-256 + backend double hashing (bcrypt).

**Status:** Plan gotowy do implementacji
**Data:** 2025-12-06
**Decyzja:** SHA-256 (Web Crypto API) + bcrypt double hashing + ręczna migracja użytkowników

---

## 🎯 Cel

Implementacja client-side hashingu dla wszystkich operacji z hasłami (signup, login, reset hasła):
- Hasło nigdy nie jest wysyłane plain textem przez sieć
- Double hashing: SHA-256 (frontend) + bcrypt (backend)
- Minimalne zmiany w kodzie
- Ręczna migracja istniejących użytkowników (bez automatycznych emaili)

---

## 🏗️ Architektura

### Flow hasła (v2 - nowy system)

```
┌─────────────────────────────┐
│   FRONTEND (browser)        │
│                             │
│  User input: "MyPass123"    │
│         ↓                   │
│  SHA-256 hash               │ ← Web Crypto API (natywne, 0 KB bundle)
│         ↓                   │
│  "a1b2c3d4..." (64 chars)   │
└──────────────┬──────────────┘
               │
               │ HTTPS (TLS encrypted)
               │
┌──────────────▼──────────────┐
│   BACKEND (Astro/Node)      │
│                             │
│  Receive: "a1b2c3d4..."     │
│         ↓                   │
│  bcrypt(sha256Hash)         │ ← 10 rounds
│         ↓                   │
│  "$2b$10$abc..."            │
└──────────────┬──────────────┘
               │
               ▼
         ┌──────────┐
         │ DATABASE │
         │  (Neon)  │
         └──────────┘
```

### Bezpieczeństwo

✅ **Hasło plain text nigdy nie opuszcza przeglądarki**
- Widoczne tylko w pamięci przeglądarki podczas wpisywania
- Przed wysłaniem: hashowane SHA-256
- Network tab w DevTools pokazuje hash, nie hasło

✅ **Double hashing**
- Warstwa 1: SHA-256 (frontend) - szybki, deterministyczny
- Warstwa 2: bcrypt (backend) - salt + slow hashing
- Hash w logach/network jest bezużyteczny bez bcrypt salt

✅ **Zero dodatkowego bundla**
- Web Crypto API jest natywne w przeglądarkach (0 KB)
- Browser compatibility: >95% (wszystkie nowoczesne przeglądarki)

✅ **Backward incompatible = force migration**
- Stary system: bcrypt(plainPassword)
- Nowy system: bcrypt(sha256(plainPassword))
- Stare hasła nie będą działać → użytkownicy muszą zresetować

---

## 📦 Zakres zmian

### Nowe pliki (2)

1. **`src/lib/crypto.ts`** - Client-side hashing utilities
2. **`tests/unit/crypto.test.ts`** - Testy dla crypto utils

### Modyfikowane pliki (9)

3. **`src/components/LoginForm.tsx`** - Hash hasła przed wysłaniem
4. **`src/components/SignupForm.tsx`** - Hash hasła przed wysłaniem
5. **`src/lib/password.ts`** - Dodaj funkcje v2 (hashPasswordV2, verifyPasswordV2)
6. **`src/lib/services/authService.ts`** - Użyj hashPasswordV2 dla signup
7. **`src/pages/api/auth/login.ts`** - Użyj verifyPasswordV2
8. **`src/pages/api/auth/signup.ts`** - Już działa (przez authService)
9. **`src/pages/api/auth/reset-password.ts`** - Użyj hashPasswordV2 (jeśli endpoint istnieje)
10. **`src/schemas/auth.ts`** - Aktualizuj walidację (SHA-256 = 64 hex chars)
11. **`tests/**/*`** - Aktualizuj wszystkie testy auth flow

---

## 🔧 Implementacja krok po kroku

### **KROK 1: Frontend - SHA-256 Utility**

#### Plik: `src/lib/crypto.ts` (NOWY)

```typescript
/**
 * Client-side hashing utilities
 *
 * Uses Web Crypto API (native browser API, 0 KB bundle size)
 */

/**
 * Hashuje hasło za pomocą SHA-256
 *
 * @param password - Plain text password
 * @returns SHA-256 hash (64-char lowercase hex string)
 *
 * @example
 * const hash = await hashPasswordClient('MyPassword123')
 * // Returns: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f"
 */
export async function hashPasswordClient(password: string): Promise<string> {
  // Encode string to Uint8Array
  const encoder = new TextEncoder()
  const data = encoder.encode(password)

  // SHA-256 hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')

  return hashHex
}
```

**Dlaczego SHA-256?**
- ✅ Natywne API (0 KB bundle)
- ✅ Szybkie (nie blokuje UI)
- ✅ Deterministyczne (ten sam input → ten sam output)
- ✅ Wystarczająco bezpieczne w kombinacji z bcrypt
- ❌ NIE jest odpowiednie jako jedyne hashowanie (dlatego double hashing z bcrypt)

---

#### Plik: `tests/unit/crypto.test.ts` (NOWY)

```typescript
import { describe, it, expect } from 'vitest'
import { hashPasswordClient } from '@/lib/crypto'

describe('hashPasswordClient', () => {
  it('should hash password to SHA-256 hex string (64 chars)', async () => {
    const hash = await hashPasswordClient('test')

    expect(hash).toBeDefined()
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should produce consistent hash for same password', async () => {
    const password = 'MyPassword123'
    const hash1 = await hashPasswordClient(password)
    const hash2 = await hashPasswordClient(password)

    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different passwords', async () => {
    const hash1 = await hashPasswordClient('password1')
    const hash2 = await hashPasswordClient('password2')

    expect(hash1).not.toBe(hash2)
  })

  it('should handle empty string', async () => {
    const hash = await hashPasswordClient('')

    // SHA-256 of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('should handle special characters', async () => {
    const hash = await hashPasswordClient('!@#$%^&*()_+-=[]{}|;:,.<>?')

    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should handle Unicode characters', async () => {
    const hash = await hashPasswordClient('Zażółć gęślą jaźń 🔒')

    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should match known SHA-256 hash', async () => {
    // Test vector: "hello" → known SHA-256
    const hash = await hashPasswordClient('hello')

    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})
```

**Uruchomienie testów:**
```bash
npm run test:unit -- crypto.test.ts
```

---

### **KROK 2: Backend - Password Utils v2**

#### Plik: `src/lib/password.ts` (MODYFIKACJA)

**Dodaj na końcu pliku:**

```typescript
import bcrypt from 'bcrypt'

const SALT_ROUNDS = 10

// ===== v1 (legacy) - zostaw dla kompatybilności =====

/**
 * @deprecated Używaj hashPasswordV2 dla nowych implementacji
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * @deprecated Używaj verifyPasswordV2 dla nowych implementacji
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

// ===== v2 (client-side SHA-256 + bcrypt) =====

/**
 * Hashuje SHA-256 hash hasła za pomocą bcrypt (v2 - double hashing)
 *
 * Frontend wysyła SHA-256 hash (64-char hex string)
 * Backend hashuje ten hash za pomocą bcrypt
 *
 * @param sha256Hash - SHA-256 hash od frontendu (64 hex chars)
 * @returns bcrypt hash (60 chars, format: $2b$10$...)
 * @throws Error jeśli sha256Hash ma nieprawidłowy format
 *
 * @example
 * const frontendHash = "a1b2c3..." // 64 chars from frontend
 * const dbHash = await hashPasswordV2(frontendHash)
 * // Returns: "$2b$10$abc..."
 */
export async function hashPasswordV2(sha256Hash: string): Promise<string> {
  validateSHA256Hash(sha256Hash)
  return await bcrypt.hash(sha256Hash, SALT_ROUNDS)
}

/**
 * Weryfikuje SHA-256 hash hasła z bcrypt hash z DB (v2)
 *
 * @param sha256Hash - SHA-256 hash od frontendu (64 hex chars)
 * @param bcryptHash - bcrypt hash z DB (60 chars)
 * @returns true jeśli hasło jest poprawne
 * @throws Error jeśli sha256Hash ma nieprawidłowy format
 *
 * @example
 * const isValid = await verifyPasswordV2(frontendHash, user.passwordHash)
 */
export async function verifyPasswordV2(
  sha256Hash: string,
  bcryptHash: string
): Promise<boolean> {
  validateSHA256Hash(sha256Hash)
  return await bcrypt.compare(sha256Hash, bcryptHash)
}

/**
 * Waliduje format SHA-256 hash (64-char lowercase hex)
 *
 * @param hash - String do walidacji
 * @throws Error jeśli nieprawidłowy format
 */
function validateSHA256Hash(hash: string): void {
  if (typeof hash !== 'string') {
    throw new Error('SHA-256 hash must be a string')
  }

  if (hash.length !== 64) {
    throw new Error(
      `Invalid SHA-256 hash length: expected 64 chars, got ${hash.length}`
    )
  }

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(
      'Invalid SHA-256 hash format: must be lowercase hexadecimal (a-f0-9)'
    )
  }
}
```

---

#### Plik: `tests/unit/password.test.ts` (MODYFIKACJA lub NOWY)

**Dodaj testy v2:**

```typescript
import { describe, it, expect } from 'vitest'
import { hashPasswordV2, verifyPasswordV2 } from '@/lib/password'

describe('Password v2 (client-side SHA-256 + bcrypt)', () => {
  // Valid SHA-256 hash (example: SHA-256 of "test")
  const validSHA256 = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

  describe('hashPasswordV2', () => {
    it('should hash SHA-256 to bcrypt', async () => {
      const bcryptHash = await hashPasswordV2(validSHA256)

      expect(bcryptHash).toBeDefined()
      expect(bcryptHash).toMatch(/^\$2[ab]\$10\$.{53}$/) // bcrypt format
    })

    it('should throw error for invalid length', async () => {
      await expect(hashPasswordV2('short')).rejects.toThrow('expected 64 chars')
    })

    it('should throw error for invalid characters', async () => {
      const invalidHash = 'G' + 'a'.repeat(63) // G is not hex
      await expect(hashPasswordV2(invalidHash)).rejects.toThrow('lowercase hexadecimal')
    })

    it('should throw error for non-string input', async () => {
      await expect(hashPasswordV2(123 as any)).rejects.toThrow('must be a string')
    })
  })

  describe('verifyPasswordV2', () => {
    it('should verify correct SHA-256 hash', async () => {
      const bcryptHash = await hashPasswordV2(validSHA256)
      const isValid = await verifyPasswordV2(validSHA256, bcryptHash)

      expect(isValid).toBe(true)
    })

    it('should reject incorrect SHA-256 hash', async () => {
      const bcryptHash = await hashPasswordV2(validSHA256)
      const wrongHash = 'a'.repeat(64) // Different hash
      const isValid = await verifyPasswordV2(wrongHash, bcryptHash)

      expect(isValid).toBe(false)
    })

    it('should throw error for invalid SHA-256 format', async () => {
      const bcryptHash = '$2b$10$abcdefghijk...' // Valid bcrypt
      await expect(verifyPasswordV2('invalid', bcryptHash)).rejects.toThrow()
    })
  })

  describe('hashPasswordV2 + verifyPasswordV2 roundtrip', () => {
    it('should work end-to-end', async () => {
      const sha256Hash = '1234567890abcdef'.repeat(4) // 64 chars

      // Hash
      const bcryptHash = await hashPasswordV2(sha256Hash)

      // Verify
      const isValid = await verifyPasswordV2(sha256Hash, bcryptHash)
      expect(isValid).toBe(true)

      // Wrong hash should fail
      const wrongHash = 'fedcba0987654321'.repeat(4)
      const isInvalid = await verifyPasswordV2(wrongHash, bcryptHash)
      expect(isInvalid).toBe(false)
    })
  })
})
```

**Uruchomienie testów:**
```bash
npm run test:unit -- password.test.ts
```

---

### **KROK 3: Frontend - LoginForm**

#### Plik: `src/components/LoginForm.tsx`

**Import na początku pliku:**
```typescript
import { hashPasswordClient } from '@/lib/crypto'
```

**Zmiana w funkcji `onSubmit` (około linia 44):**

```typescript
// PRZED ZMIANĄ:
const onSubmit = async (values: LoginInput) => {
  try {
    const loginResponse = await loginRequest(values)
    toast.success('Zalogowano pomyślnie')
    // ... reszta kodu

// PO ZMIANIE:
const onSubmit = async (values: LoginInput) => {
  try {
    // Hash hasła przed wysłaniem (SHA-256)
    const passwordHash = await hashPasswordClient(values.password)

    // Wysyłamy hash zamiast plain text
    const loginResponse = await loginRequest({
      email: values.email,
      password: passwordHash, // SHA-256 hash (64 chars)
    })

    toast.success('Zalogowano pomyślnie')
    // ... reszta kodu bez zmian
```

**Dodatkowa zmiana (opcjonalnie) - walidacja przed hash:**

Możesz dodać podstawową walidację przed hashowaniem (np. min 8 znaków), żeby uniknąć zbędnego hashowania nieprawidłowych haseł:

```typescript
const onSubmit = async (values: LoginInput) => {
  try {
    // Client-side validation (opcjonalnie)
    if (values.password.length < 8) {
      toast.error('Hasło musi mieć minimum 8 znaków')
      setFocus('password')
      return
    }

    // Hash hasła
    const passwordHash = await hashPasswordClient(values.password)

    // ... reszta
```

---

### **KROK 4: Frontend - SignupForm**

#### Plik: `src/components/SignupForm.tsx`

**Import na początku pliku:**
```typescript
import { hashPasswordClient } from '@/lib/crypto'
```

**Zmiana w funkcji `handleSubmit` (około linia 156):**

```typescript
// PRZED ZMIANĄ (linia ~156):
try {
  // Build request payload
  const payload: SignupRequest = {
    invitationToken: token,
    email: form.email,
    password: form.password, // Plain text
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    consents: form.consents,
  }
  // ... reszta

// PO ZMIANIE:
try {
  // Hash hasła przed wysłaniem (SHA-256)
  const passwordHash = await hashPasswordClient(form.password)

  // Build request payload
  const payload: SignupRequest = {
    invitationToken: token,
    email: form.email,
    password: passwordHash, // SHA-256 hash (64 chars)
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    consents: form.consents,
  }
  // ... reszta bez zmian
```

---

### **KROK 5: Frontend - Reset hasła** (jeśli endpoint istnieje)

Sprawdź czy istnieje strona `/src/pages/reset-hasla/[token].astro` lub podobna.

Jeśli istnieje formularz resetu hasła, zastosuj tę samą zmianę:
1. Import `hashPasswordClient`
2. Hash hasła przed wysłaniem do API

---

### **KROK 6: Backend - Auth Service (Signup)**

#### Plik: `src/lib/services/authService.ts`

**Import na początku:**
```typescript
import { hashPasswordV2 } from '@/lib/password'
```

**Zmiana w funkcji `signup` (linia ~142):**

```typescript
// PRZED ZMIANĄ (linia ~142-143):
// 4. Hash hasła (bcrypt, 10 salt rounds)
const passwordHash = await bcrypt.hash(input.password, 10)

// PO ZMIANIE:
// 4. Hash SHA-256 hasła za pomocą bcrypt (double hashing)
// input.password zawiera już SHA-256 hash (64 chars) od frontendu
// Backend dodaje bcrypt layer
const passwordHash = await hashPasswordV2(input.password)
```

**UWAGA:** `input.password` będzie zawierać SHA-256 hash (64 znaki hex), NIE plain text!

---

### **KROK 7: Backend - Login Endpoint**

#### Plik: `src/pages/api/auth/login.ts`

**Import (zmień na v2):**
```typescript
// PRZED:
import { verifyPassword } from '@/lib/password'

// PO:
import { verifyPasswordV2 } from '@/lib/password'
```

**Zmiana w weryfikacji hasła (linia ~74-75):**

```typescript
// PRZED:
const validPassword = await verifyPassword(password, user.passwordHash)

// PO:
// `password` z frontendu to SHA-256 hash (64 chars), NIE plain text
const validPassword = await verifyPasswordV2(password, user.passwordHash)
```

---

### **KROK 8: Backend - Reset Password Endpoint** (jeśli istnieje)

#### Plik: `src/pages/api/auth/reset-password.ts`

Jeśli endpoint istnieje, zastosuj tę samą zmianę:

```typescript
// Import
import { hashPasswordV2 } from '@/lib/password'

// Użyj hashPasswordV2 zamiast hashPassword
const passwordHash = await hashPasswordV2(newPassword) // newPassword to SHA-256 hash
```

---

### **KROK 9: Schema Walidacja (Backend)**

#### Plik: `src/schemas/auth.ts`

**Opcja A: Zmień walidację na SHA-256 format (ZALECANE)**

```typescript
// PRZED:
export const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
  password: z.string().min(1, 'Hasło jest wymagane'),
})

export const signupSchema = z.object({
  // ...
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
  // ...
})

// PO:
export const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
  password: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Nieprawidłowy format hasła (wymagany SHA-256 hash)'),
})

export const signupSchema = z.object({
  // ...
  password: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Nieprawidłowy format hasła (wymagany SHA-256 hash)'),
  // ...
})
```

**Opcja B: Zostaw obecną walidację (prostsze, mniej restrykcyjne)**

SHA-256 hash (64 znaki) przejdzie walidację `.min(1)` lub `.min(8)`, więc technicznie działa.

**Rekomendacja:** Użyj **Opcji A** dla lepszej walidacji i security.

---

### **KROK 10: Aktualizacja Testów**

#### Pliki do aktualizacji:

1. **`tests/unit/crypto.test.ts`** - Nowy plik (już opisany w KROK 1)
2. **`tests/unit/password.test.ts`** - Dodaj testy v2 (już opisany w KROK 2)
3. **`tests/integration/auth/*.test.ts`** - Aktualizuj integration testy
4. **`tests/e2e/auth/*.spec.ts`** - Aktualizuj E2E testy

#### Przykład zmiany w testach:

```typescript
// PRZED:
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'PlainPassword123', // Plain text
  }),
})

// PO:
import { hashPasswordClient } from '@/lib/crypto'

// W teście:
const plainPassword = 'PlainPassword123'
const passwordHash = await hashPasswordClient(plainPassword)

const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: passwordHash, // SHA-256 hash
  }),
})
```

**Uruchomienie wszystkich testów:**
```bash
npm run test:unit      # Unit testy
npm run test:integration # Integration testy (jeśli istnieją)
npm run test:e2e       # E2E testy
```

---

## 🔄 Migracja istniejących użytkowników

### Strategia: Ręczne informowanie + Password Reset

**Problem:**
- Istniejący użytkownicy mają w DB: `bcrypt(plainPassword)`
- Nowy system wymaga: `bcrypt(sha256(plainPassword))`
- Stare hasła NIE BĘDĄ DZIAŁAĆ z nowym systemem

**Rozwiązanie:**

#### 1. **Przed wdrożeniem:**
   - ✅ Upewnij się, że endpoint `/reset-hasla` działa
   - ✅ Przygotuj komunikat dla użytkowników

#### 2. **Po wdrożeniu:**
   - Użytkownicy z starymi hasłami próbują się zalogować
   - Login zwraca 401 "Nieprawidłowe hasło"
   - Użytkownicy klikają "Zapomniałeś hasła?"
   - Resetują hasło → nowe hasło już używa v2 (SHA-256 + bcrypt)

#### 3. **Komunikacja z użytkownikami (ręcznie):**

**Email / wiadomość (przykład):**

```
Temat: Aktualizacja systemu bezpieczeństwa

Cześć,

Zaktualizowaliśmy system bezpieczeństwa aplikacji do zarządzania wagą.

Przy pierwszym logowaniu po aktualizacji, Twoje dotychczasowe hasło
nie zadziała. To normalne!

Aby się zalogować:
1. Kliknij "Zapomniałeś hasła?" na stronie logowania
2. Podaj swój email
3. Otrzymasz link do resetu hasła
4. Ustaw nowe hasło

Po tym wszystko będzie działać normalnie.

Dziękujemy za zrozumienie!
Paulina Maciak Dietoterapia
```

#### 4. **Monitoring:**
   - Sprawdź logi `/api/auth/login` - ile 401 errors (nieudane logowania)
   - Sprawdź `/api/auth/password-reset-request` - ile requestów
   - Po tygodniu: sprawdź ilu użytkowników już zmigrowano

#### 5. **Force reset dla pozostałych (opcjonalnie po 2-4 tygodniach):**

Jeśli po miesiącu są użytkownicy którzy się nie zalogowali, możesz:
- Wysłać przypomnienie emailem
- LUB wymusić reset przy następnej próbie logowania

---

### Alternatywa: Automatyczne generowanie reset tokenów (opcjonalnie)

Jeśli chcesz ułatwić użytkownikom, możesz:

1. Po wdrożeniu uruchomić skrypt który generuje reset tokeny dla WSZYSTKICH użytkowników
2. Ręcznie wysłać emaile z linkami (lub przekazać je użytkownikom osobiście/przez WhatsApp/etc)

**Skrypt (przykład):**

```bash
# Generuj tokeny dla wszystkich
npx tsx scripts/generate-password-reset-tokens.ts

# Output: CSV z email + reset URL
# password-reset-tokens.csv:
# jan@example.com,https://paulinamaciak.pl/reset-hasla/abc123...
# anna@example.com,https://paulinamaciak.pl/reset-hasla/def456...
```

Potem ręcznie wysyłasz emaile lub przekazujesz linki.

---

## ⚠️ Ryzyka i mitygacja

### **Ryzyko 1: Użytkownik wysyła plain text zamiast hash (błąd frontendu)**

**Symptom:**
- Backend otrzymuje plain password (np. "MyPass123" zamiast 64-char hex)
- `validateSHA256Hash()` rzuca error
- API zwraca 400/422

**Mitygacja:**
- ✅ Backend waliduje format (musi być 64 hex chars)
- ✅ Testy E2E wykryją problem przed production
- ✅ Error message jasno komunikuje problem

**Fix:**
- Sprawdź czy frontend używa `hashPasswordClient()` przed wysłaniem

---

### **Ryzyko 2: Użytkownik próbuje się zalogować starym hasłem po wdrożeniu**

**Symptom:**
- Użytkownik wpisuje poprawne hasło (które działało przed wdrożeniem)
- Login zwraca 401 "Nieprawidłowe hasło"

**Mitygacja:**
- ✅ To jest **oczekiwane zachowanie** (backward incompatible)
- ✅ Użytkownik używa "Zapomniałeś hasła?" → reset → działa
- ✅ Przygotuj komunikat dla użytkowników PRZED wdrożeniem

**Fix:**
- Informuj użytkowników o zmianie (email/komunikat)

---

### **Ryzyko 3: SHA-256 hash w logach serwera**

**Symptom:**
- Logi backendu zawierają request bodies z hasłami
- Teraz zamiast plain text mają SHA-256 hash

**Ocena:**
- ✅ SHA-256 hash SAM W SOBIE jest bezużyteczny bez bcrypt salt
- ⚠️ Ale lepiej NIE logować request bodies dla `/api/auth/*`

**Mitygacja:**
- Dodaj do middleware: skip logging request bodies dla auth endpoints

```typescript
// src/middleware/index.ts
export const onRequest = (context, next) => {
  const isAuthEndpoint = context.url.pathname.startsWith('/api/auth/')

  if (isAuthEndpoint) {
    // NIE loguj request body (może zawierać hashe haseł)
    console.log(`[Auth] ${context.request.method} ${context.url.pathname}`)
  } else {
    // Normalny logging
  }

  return next()
}
```

---

### **Ryzyko 4: Browser compatibility (Web Crypto API)**

**Symptom:**
- Stara przeglądarka (IE11, bardzo stary Chrome/Firefox)
- `crypto.subtle` undefined
- Frontend rzuca error przy próbie logowania

**Ocena:**
- ✅ Web Crypto API wspierane: Chrome 37+, Firefox 34+, Safari 11+, Edge 12+
- ✅ Ponad 95% użytkowników ma wspierane przeglądarki
- ⚠️ Tylko bardzo stare przeglądarki nie działają

**Mitygacja:**
- Dodaj fallback error message: "Zaktualizuj przeglądarkę"

```typescript
export async function hashPasswordClient(password: string): Promise<string> {
  // Check browser support
  if (!crypto || !crypto.subtle) {
    throw new Error(
      'Twoja przeglądarka jest przestarzała. Zaktualizuj przeglądarkę do najnowszej wersji.'
    )
  }

  // ... reszta kodu
}
```

---

### **Ryzyko 5: Użytkownik odświeża stronę podczas submit**

**Symptom:**
- Użytkownik wpisał hasło
- Kliknął "Zaloguj"
- Podczas hashowania/wysyłania odświeża stronę (F5)
- Formularz resetuje się

**Ocena:**
- ✅ To normalne zachowanie (React state jest lokalny)
- ✅ Użytkownik po prostu wpisuje hasło ponownie

**Mitygacja:**
- Brak - to expected behavior
- Opcjonalnie: disable refresh podczas submitting (advanced)

---

## 📋 Checklist implementacji

### Przygotowanie
- [ ] **Backup bazy danych** (przed wdrożeniem)
- [ ] Sprawdź ilu użytkowników jest w bazie (ile osób będzie potrzebować resetu)
- [ ] Sprawdź czy endpoint `/reset-hasla` działa
- [ ] Przygotuj komunikat dla użytkowników (email/wiadomość)

### Frontend (5 plików)
- [ ] Utwórz `src/lib/crypto.ts` z funkcją `hashPasswordClient()`
- [ ] Utwórz testy `tests/unit/crypto.test.ts`
- [ ] Zaktualizuj `src/components/LoginForm.tsx` - hash hasła przed wysłaniem
- [ ] Zaktualizuj `src/components/SignupForm.tsx` - hash hasła przed wysłaniem
- [ ] Zaktualizuj stronę reset hasła (jeśli istnieje)

### Backend (5 plików)
- [ ] Zaktualizuj `src/lib/password.ts` - dodaj v2 funkcje (hashPasswordV2, verifyPasswordV2)
- [ ] Dodaj/zaktualizuj testy `tests/unit/password.test.ts`
- [ ] Zaktualizuj `src/lib/services/authService.ts` - użyj `hashPasswordV2` w signup
- [ ] Zaktualizuj `src/pages/api/auth/login.ts` - użyj `verifyPasswordV2`
- [ ] Zaktualizuj `src/pages/api/auth/reset-password.ts` - użyj `hashPasswordV2` (jeśli istnieje)
- [ ] Zaktualizuj `src/schemas/auth.ts` - walidacja SHA-256 (Opcja A zalecana)

### Testy (wszystkie)
- [ ] Uruchom unit testy: `npm run test:unit`
- [ ] Zaktualizuj integration testy (jeśli istnieją)
- [ ] Zaktualizuj E2E testy
- [ ] Uruchom wszystkie testy: `npm test`
- [ ] Przetestuj manualnie signup flow
- [ ] Przetestuj manualnie login flow
- [ ] Przetestuj manualnie reset hasła flow

### Wdrożenie
- [ ] **Deploy do staging**
- [ ] Test na staging (signup, login, reset)
- [ ] **Poinformuj użytkowników o zmianie** (email/wiadomość)
- [ ] **Deploy do production**
- [ ] Monitoruj logi - czy są 401 errors (użytkownicy ze starymi hasłami)
- [ ] Sprawdź po tygodniu - ilu użytkowników zmigrowano

### Post-deployment (opcjonalnie)
- [ ] Jeśli są użytkownicy którzy się nie zalogowali po miesiącu → wyślij przypomnienie
- [ ] Po 2-3 miesiącach: usuń deprecated funkcje v1 (`hashPassword`, `verifyPassword`)

---

## 🎯 Kolejność implementacji (zalecana)

1. ✅ **Frontend crypto utility** (`src/lib/crypto.ts` + testy) → ~30 min
2. ✅ **Backend password v2** (`src/lib/password.ts` + testy) → ~30 min
3. ✅ **Signup flow** (frontend `SignupForm.tsx` + backend `authService.ts`) → ~20 min
4. ✅ **Login flow** (frontend `LoginForm.tsx` + backend `login.ts`) → ~20 min
5. ✅ **Reset password flow** (jeśli istnieje) → ~15 min
6. ✅ **Schema validation** (`src/schemas/auth.ts`) → ~10 min
7. ✅ **Aktualizuj testy** (unit + integration + E2E) → ~60-90 min
8. ✅ **Deploy do staging** + manual test → ~30 min
9. ✅ **Poinformuj użytkowników** (email/komunikat) → ~30 min
10. ✅ **Deploy do production** → ~15 min
11. ✅ **Monitoring** (logi, migracja użytkowników) → ongoing

**Total time estimate:** ~4-5 godzin (z testami)

---

## 📊 Podsumowanie zmian

| Kategoria | Liczba plików | Czas (est.) |
|-----------|---------------|-------------|
| Nowe pliki | 2 | 1h |
| Modyfikowane pliki (frontend) | 3 | 1h |
| Modyfikowane pliki (backend) | 5 | 1h |
| Testy | ~5-10 | 1.5h |
| Wdrożenie + monitoring | - | 1h |
| **TOTAL** | **~15-20 plików** | **~4-5h** |

---

## ❓ FAQ

### Q1: Czy to zwiększa bezpieczeństwo?

**A:** Tak, ale nie drastycznie. Główne korzyści:
- ✅ Hasło nigdy nie jest wysyłane plain textem (nie widać w DevTools Network)
- ✅ Double hashing (SHA-256 + bcrypt) utrudnia rainbow table attacks
- ✅ Hash w logach jest bezużyteczny bez bcrypt salt

**ALE:**
- HTTPS już szyfruje dane w tranzycie (TLS)
- Główny security boost to **perception** (użytkownik nie widzi hasła w DevTools)

### Q2: Czy SHA-256 jest wystarczająco bezpieczny?

**A:** SHA-256 sam w sobie **NIE** jest odpowiedni do hashowania haseł (za szybki, brak salt).

**ALE** w kombinacji z bcrypt (double hashing) jest OK:
- SHA-256 na frontendzie: deterministyczny, szybki
- bcrypt na backendzie: slow hashing + salt

### Q3: Dlaczego nie użyć bcrypt na frontendzie?

**A:** bcrypt jest bardzo wolny (to feature dla security!), ale:
- Na słabym telefonie może zająć 1-2 sekundy
- Blokuje UI (bad UX)
- Duża biblioteka (~50 KB)

SHA-256 jest natywne i instant (<10ms).

### Q4: Co jeśli użytkownik użyje starego hasła po wdrożeniu?

**A:** Login zwróci 401 "Nieprawidłowe hasło".
- Użytkownik kliknie "Zapomniałeś hasła?"
- Reset hasła → nowe hasło używa v2
- Wszystko działa

**To jest oczekiwane zachowanie** (backward incompatible change).

### Q5: Czy mogę wycofać zmianę po wdrożeniu?

**A:** Technicznie tak, ale **nie polecam**:
- Musisz przywrócić stary kod
- Użytkownicy którzy zresetowali hasła (v2) nie będą mogli się zalogować
- Chaos

**Lepiej:** Testuj dokładnie na staging przed production.

### Q6: Czy frontend może obejść hashing i wysłać plain text?

**A:** Tak (złośliwy użytkownik może zmodyfikować kod w DevTools).

**ALE:**
- Backend waliduje format (SHA-256 = 64 hex chars)
- Plain text nie przejdzie walidacji → error 422
- Użytkownik szkodzi tylko sobie (nie może się zalogować)

---

## 📚 Dodatkowe zasoby

### Web Crypto API
- [MDN: SubtleCrypto.digest()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)
- [Can I Use: Web Crypto API](https://caniuse.com/cryptography)

### Password Hashing Best Practices
- [OWASP: Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- Zalecane algorytmy: Argon2, bcrypt, scrypt, PBKDF2

### Bezpieczeństwo
- [NIST: Digital Identity Guidelines](https://pages.nist.gov/800-63-3/)
- [Have I Been Pwned: Password Security](https://haveibeenpwned.com/)

---

## ✅ Gotowe do implementacji

Plan jest kompletny i gotowy do rozpoczęcia implementacji.

**Następne kroki:**
1. Stwórz backup bazy danych
2. Zacznij od KROK 1 (frontend crypto utility)
3. Testuj każdy krok lokalnie
4. Deploy do staging → test → deploy do production

Powodzenia! 🚀
