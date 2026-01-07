# Plan Implementacji: Samodzielna Rejestracja Pacjentów

## 1. Przegląd

### Cel
Dodanie możliwości samodzielnej rejestracji pacjentów, zachowując istniejący system rejestracji przez zaproszenia od dietetyka.

### Zakres funkcjonalności
- **Nowa strona rejestracji**: `/rejestracja` - publiczny formularz rejestracji
- **Modyfikacja strony logowania**: `/logowanie` - dodanie przycisku "Utwórz nowe konto"
- **Identyczny formularz**: Samodzielna rejestracja wymaga tych samych danych co rejestracja przez zaproszenie (imię, nazwisko, wiek, płeć, hasło, zgody RODO)
- **Wspólna ścieżka onboardingu**: Po rejestracji przekierowanie na `/waga/welcome` (identyczne jak dla zaproszeń)
- **Brak zmian w bazie danych**: System pozostaje jak jest - jeden dietetyk widzi wszystkich pacjentów

### Wymagania użytkownika
✅ Formularz rejestracji identyczny jak dla zaproszeń
✅ Przekierowanie na `/waga/welcome` po rejestracji
✅ Przycisk "Utwórz nowe konto" na stronie logowania
✅ Brak zmian w strukturze bazy danych

---

## 2. Zmiany w Logice Biznesowej

### 2.1. Modyfikacja `authService.signup()`

**Plik**: `src/lib/services/authService.ts`

**Problem**: Obecna implementacja wymaga `invitationToken` i waliduje go przed rejestracją. Przy samodzielnej rejestracji nie ma tokenu zaproszenia.

**Rozwiązanie**: Uczynić `invitationToken` opcjonalnym i dodać walidację warunkową.

**Zmiany**:

1. **Rozszerzenie interfejsu `SignupRequest`** (`src/types.ts`):
```typescript
export interface SignupRequest {
  invitationToken?: string // ZMIENIONE: opcjonalne (tylko dla rejestracji przez zaproszenie)
  email: string
  password: string // SHA-256 hash (64 chars)
  firstName: string
  lastName: string
  age?: number
  gender?: 'male' | 'female'
  consents: Array<{
    type: string
    text: string
    accepted: boolean
  }>
}
```

2. **Modyfikacja `signup()` w `authService.ts`**:

**Fragment do zmiany** (linie 96-117):

```typescript
// PRZED (obecny kod):
export async function signup(
  input: SignupRequest,
  // ... repositories ...
): Promise<{
  user: SignupResponse['user']
  userId: string
}> {
  // 1. Sprawdź invitation token
  const invitation = await invitationRepository.getByToken(input.invitationToken)

  if (!invitation) {
    throw new InvalidInvitationError('Token zaproszenia nie istnieje')
  }

  if (invitation.usedAt) {
    throw new InvalidInvitationError('Token zaproszenia został już użyty')
  }

  if (invitation.expiresAt < new Date()) {
    throw new InvalidInvitationError('Token zaproszenia wygasł')
  }

  // Opcjonalnie: sprawdź czy email w zaproszeniu pasuje do emaila w rejestracji
  if (invitation.email && invitation.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new InvalidInvitationError(
      'Adres email nie pasuje do zaproszenia. Użyj adresu email, na który otrzymałeś zaproszenie.'
    )
  }

  // ... reszta funkcji
}
```

**PO (nowy kod)**:

```typescript
export async function signup(
  input: SignupRequest,
  // ... repositories ...
): Promise<{
  user: SignupResponse['user']
  userId: string
}> {
  let invitation: Invitation | null = null

  // 1. Walidacja invitation token (tylko jeśli został podany)
  if (input.invitationToken) {
    invitation = await invitationRepository.getByToken(input.invitationToken)

    if (!invitation) {
      throw new InvalidInvitationError('Token zaproszenia nie istnieje')
    }

    if (invitation.usedAt) {
      throw new InvalidInvitationError('Token zaproszenia został już użyty')
    }

    if (invitation.expiresAt < new Date()) {
      throw new InvalidInvitationError('Token zaproszenia wygasł')
    }

    // Sprawdź czy email w zaproszeniu pasuje do emaila w rejestracji
    if (invitation.email && invitation.email.toLowerCase() !== input.email.toLowerCase()) {
      throw new InvalidInvitationError(
        'Adres email nie pasuje do zaproszenia. Użyj adresu email, na który otrzymałeś zaproszenie.'
      )
    }
  }
  // Jeśli brak invitationToken - publiczna rejestracja (bez walidacji zaproszenia)

  // 2. Sprawdź konflikt email (bez zmian)
  const existingUser = await userRepository.findByEmail(input.email)

  if (existingUser) {
    throw new EmailConflictError()
  }

  // ... reszta funkcji bez zmian (walidacja zgód, hashowanie, transakcja DB)

  // UWAGA: W transakcji DB - oznaczanie zaproszenia jako użyte tylko jeśli invitation !== null
}
```

**Fragment w transakcji DB do zmiany** (linie 185-221):

```typescript
// PRZED:
// 5c. Oznacz zaproszenie jako użyte
await txInvitationRepository.markUsed(invitation.id, user.id)

// 5d. Audit log - use invitation
try {
  await txAuditLogRepository.create({
    userId: user.id,
    action: 'update',
    tableName: 'invitations',
    recordId: invitation.id,
    before: { usedAt: null },
    after: { usedAt: new Date() },
  })
} catch (auditError) {
  console.error('[authService.signup] Audit log failed (use invitation):', auditError)
}

// PO:
// 5c. Oznacz zaproszenie jako użyte (tylko jeśli rejestracja przez zaproszenie)
if (invitation) {
  await txInvitationRepository.markUsed(invitation.id, user.id)

  // 5d. Audit log - use invitation
  try {
    await txAuditLogRepository.create({
      userId: user.id,
      action: 'update',
      tableName: 'invitations',
      recordId: invitation.id,
      before: { usedAt: null },
      after: { usedAt: new Date() },
    })
  } catch (auditError) {
    console.error('[authService.signup] Audit log failed (use invitation):', auditError)
  }
}
```

**Fragment w event tracking do zmiany** (linie 226-238):

```typescript
// PRZED:
try {
  await eventRepository.create({
    userId: result.id,
    eventType: 'signup',
    properties: {
      role: 'patient',
      invitationId: invitation.id,
    },
  })
} catch (eventError) {
  console.error('[authService.signup] Event tracking failed:', eventError)
}

// PO:
try {
  await eventRepository.create({
    userId: result.id,
    eventType: 'signup',
    properties: {
      role: 'patient',
      source: invitation ? 'invitation' : 'public_signup', // NOWE: rozróżnienie
      invitationId: invitation?.id,
    },
  })
} catch (eventError) {
  console.error('[authService.signup] Event tracking failed:', eventError)
}
```

---

## 3. Walidacja Schematu (Zod)

### 3.1. Modyfikacja schematów w `src/schemas/auth.ts`

**Zmiany**:

1. **Schema kliencki** (`signupSchemaClient`):
```typescript
export const signupSchemaClient = z.object({
  invitationToken: z.string().optional(), // ZMIENIONE: opcjonalne
  email: z.string().email('Nieprawidłowy format adresu e-mail'),
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
  firstName: z.string().min(1, 'Imię jest wymagane'),
  lastName: z.string().min(1, 'Nazwisko jest wymagane'),
  age: z.number().int().positive().optional(),
  gender: z.enum(['male', 'female']).optional(),
  consents: z.array(z.object({
    type: z.string().min(1, 'Typ zgody jest wymagany'),
    text: z.string().min(1, 'Treść zgody jest wymagana'),
    accepted: z.boolean()
  })).min(1, 'Wymagana jest co najmniej jedna zgoda')
}).refine(
  (data) => {
    const requiredTypes = ['data_processing', 'health_data']
    const acceptedTypes = data.consents
      .filter(c => c.accepted)
      .map(c => c.type)
    return requiredTypes.every(type => acceptedTypes.includes(type))
  },
  {
    message: 'Wymagane prawnie zgody (przetwarzanie danych i danych zdrowotnych) muszą być zaakceptowane',
    path: ['consents']
  }
)
```

2. **Schema serwerowy** (`signupSchema`):
```typescript
export const signupSchema = z.object({
  invitationToken: z.string().optional(), // ZMIENIONE: opcjonalne
  email: z.string().email('Nieprawidłowy format adresu e-mail'),
  password: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Nieprawidłowy format hasła (wymagany SHA-256 hash)'),
  firstName: z.string().min(1, 'Imię jest wymagane'),
  lastName: z.string().min(1, 'Nazwisko jest wymagane'),
  age: z.number().int().positive().optional(),
  gender: z.enum(['male', 'female']).optional(),
  consents: z.array(consentSchema).min(1, 'Wymagana jest co najmniej jedna zgoda')
}).refine(
  (data) => {
    const requiredTypes = ['data_processing', 'health_data']
    const acceptedTypes = data.consents
      .filter(c => c.accepted)
      .map(c => c.type)
    return requiredTypes.every(type => acceptedTypes.includes(type))
  },
  {
    message: 'Wymagane prawnie zgody (przetwarzanie danych i danych zdrowotnych) muszą być zaakceptowane',
    path: ['consents']
  }
)
```

---

## 4. Nowy Endpoint API (Opcjonalny)

### Opcja A: Reużycie istniejącego endpointu `/api/auth/signup`

**Zaleta**: Najmniej zmian w kodzie. Endpoint automatycznie obsługuje obie ścieżki (z/bez `invitationToken`).

**Wada**: Brak wyraźnego rozróżnienia między ścieżkami w kodzie.

**Implementacja**: Brak dodatkowych zmian - po modyfikacji `authService.signup()` endpoint działa dla obu przypadków.

### Opcja B: Nowy endpoint `/api/auth/public-signup` (ZALECANE)

**Zaleta**: Czytelniejszy kod, łatwiejsze testy, wyraźne rozróżnienie ścieżek.

**Wada**: Duplikacja kodu endpointu.

**Plik**: `src/pages/api/auth/public-signup.ts` (NOWY)

**Implementacja**:

```typescript
/**
 * POST /api/auth/public-signup
 *
 * Publiczna rejestracja pacjenta (bez zaproszenia).
 */

import type { APIRoute } from 'astro'
import { signupSchema } from '@/schemas/auth'
import { signup } from '@/lib/services/authService'
import { createSession, setSessionCookie } from '@/lib/auth'
import { mapErrorToApiError, ValidationError } from '@/lib/errors'
import type { SignupRequest, SignupResponse } from '@/types'
import { ZodError } from 'zod'

export const prerender = false

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // 1. Parse JSON body
    const body = await request.json()

    // 2. Validate input with Zod
    let validatedInput: SignupRequest
    try {
      validatedInput = signupSchema.parse(body) as SignupRequest
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(
          'Dane wejściowe są nieprawidłowe',
          'validation_failed',
          error.errors
        )
        const { apiError, statusCode } = mapErrorToApiError(validationError)
        return new Response(JSON.stringify(apiError), {
          status: statusCode,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw error
    }

    // 3. Call authService.signup (without invitationToken)
    const { user, userId } = await signup(validatedInput)

    // 4. Create Lucia session
    const session = await createSession(userId)

    // 5. Set session cookie
    setSessionCookie(session.id, cookies)

    // 6. Prepare SignupResponse
    const response: SignupResponse = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        age: user.age,
        gender: user.gender,
        status: user.status,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt.toISOString(),
      },
    }

    // 7. Return 201 Created
    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const { apiError, statusCode } = mapErrorToApiError(error)

    console.error('[POST /api/auth/public-signup] Error:', error)

    return new Response(JSON.stringify(apiError), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
```

**UWAGA**: Ten kod jest prawie identyczny z `/api/auth/signup.ts`. Różnica: brak wymagania `invitationToken` w body.

---

## 5. Frontend - Nowa Strona Rejestracji

### 5.1. Strona `/rejestracja`

**Plik**: `src/pages/rejestracja.astro` (NOWY)

**Kod**:

```astro
---
/**
 * Public Signup Page
 * Route: /rejestracja
 *
 * Publiczny formularz rejestracji pacjenta (bez zaproszenia).
 */

import Layout from '@/layouts/Layout.astro'
import SignupForm from '@/components/SignupForm'

export const prerender = false

// SEO metadata
const title = 'Zarejestruj się | Dietoterapia - Paulina Maciak'
const description = 'Utwórz konto i zacznij śledzić swoją wagę z pomocą dietetyka'
---

<Layout title={title} description={description}>
  <section class="min-h-screen bg-neutral-light py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-heading font-bold text-neutral-dark mb-2">
          Załóż konto
        </h1>
        <p class="text-neutral-dark/70">
          Dołącz do naszej społeczności i zacznij swoją podróż do zdrowia
        </p>
      </div>

      <!-- Signup Form -->
      <SignupForm
        client:load
        mode="public"
      />
    </div>
  </section>
</Layout>
```

### 5.2. Modyfikacja Komponentu `SignupForm.tsx`

**Plik**: `src/components/SignupForm.tsx` (MODYFIKACJA)

**Zmiany**:

**1. Rozszerzenie interfejsu props**:
```typescript
interface SignupFormProps {
  token?: string // Opcjonalne dla publicznej rejestracji
  email?: string // Opcjonalne dla publicznej rejestracji
  expiresAt?: string | null
  mode?: 'invitation' | 'public' // NOWE: określa tryb formularza
}
```

**2. Definicja zmiennych na podstawie `mode`**:
```typescript
export default function SignupForm({
  token,
  email: initialEmail = '',
  expiresAt,
  mode = 'invitation' // Domyślnie tryb zaproszenia dla wstecznej kompatybilności
}: SignupFormProps) {
  const isPublicMode = mode === 'public'
  const apiEndpoint = isPublicMode ? '/api/auth/public-signup' : '/api/auth/signup'

  // ... reszta komponentu
}
```

**3. Walidacja email (tylko w trybie public)**:

W funkcji `validateForm()`:
```typescript
const validateForm = (): boolean => {
  const newErrors: SignupFormErrors = {}

  // Email (tylko w trybie public - w trybie invitation jest readonly)
  if (isPublicMode) {
    if (!form.email.trim()) {
      newErrors.email = 'Email jest wymagany'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Nieprawidłowy format adresu email'
    }
  }

  // ... reszta walidacji bez zmian
}
```

**4. Payload API (warunkowe dodanie `invitationToken`)**:

W funkcji `handleSubmit()`:
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()

  // ... walidacja i loading state

  try {
    const passwordHash = await hashPasswordClient(form.password)

    // Build request payload
    const payload: any = {
      email: form.email,
      password: passwordHash,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      consents: form.consents,
    }

    // Dodaj invitationToken tylko w trybie invitation
    if (!isPublicMode && token) {
      payload.invitationToken = token
    }

    // Add optional fields
    if (form.age && form.age.trim() !== '') {
      payload.age = parseInt(form.age, 10)
    }
    if (form.gender) {
      payload.gender = form.gender as 'male' | 'female'
    }

    // Call API
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    // ... obsługa odpowiedzi bez zmian
  } catch (error) {
    // ... obsługa błędów bez zmian
  }
}
```

**5. Pole email (readonly vs edytowalne)**:

W JSX formularza:
```typescript
<div>
  <label htmlFor="email" className="block text-sm font-medium text-neutral-dark mb-2">
    Adres e-mail {isPublicMode && <span className="text-red-600">*</span>}
  </label>
  <input
    type="email"
    id="email"
    name="email"
    value={form.email}
    onChange={handleChange}
    readOnly={!isPublicMode} // Tylko w trybie public jest edytowalne
    className={`w-full px-4 py-2 border rounded-lg focus:outline-none ${
      isPublicMode
        ? 'focus:ring-2 focus:ring-primary'
        : 'bg-gray-100 text-gray-600 cursor-not-allowed'
    } ${
      errors.email ? 'border-red-500' : 'border-gray-300'
    }`}
    aria-invalid={!!errors.email}
    aria-describedby={errors.email ? 'email-error' : undefined}
  />
  {errors.email && (
    <p id="email-error" className="mt-1 text-sm text-red-600">
      {errors.email}
    </p>
  )}
</div>
```

**6. Warunek wyświetlania informacji o zaproszeniu**:
```typescript
{/* Invitation expiry info (tylko dla trybu invitation) */}
{!isPublicMode && expiresAt && (
  <div className="mb-6 border rounded-lg p-4 flex items-start gap-3 bg-blue-50 border-blue-200 text-blue-800" role="alert">
    {/* ... treść alertu bez zmian ... */}
  </div>
)}
```

**7. Aktualizacja Update Effect dla `isSubmitDisabled`**:
```typescript
useEffect(() => {
  const hasRequiredFields =
    (isPublicMode ? form.email.trim() !== '' : true) && // Email wymagany tylko w trybie public
    form.firstName.trim() !== '' &&
    form.lastName.trim() !== '' &&
    form.password.length >= 8

  const hasRequiredConsents =
    form.consents.find((c) => c.type === 'data_processing')?.accepted === true &&
    form.consents.find((c) => c.type === 'health_data')?.accepted === true

  setUI((prev) => ({
    ...prev,
    isSubmitDisabled: !hasRequiredFields || !hasRequiredConsents,
  }))
}, [isPublicMode, form.email, form.firstName, form.lastName, form.password, form.consents])
```

### 5.3. Aktualizacja strony `/auth/signup.astro`

**Plik**: `src/pages/auth/signup.astro` (MODYFIKACJA)

Dodaj prop `mode="invitation"` do `SignupForm`:

```astro
{invitationData && invitationData.valid && (
  <SignupForm
    client:load
    mode="invitation"  <!-- NOWE: explicite ustawiony tryb -->
    token={token}
    email={invitationData.email}
    expiresAt={invitationData.expiresAt}
  />
)}
```

---

## 6. Frontend - Modyfikacja Strony Logowania

### 6.1. Dodanie przycisku "Utwórz nowe konto"

**Plik**: `src/components/LoginForm.tsx` (MODYFIKACJA)

**Zmiany w JSX** (po przycisku "Zaloguj się"):

```typescript
return (
  <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-6" data-test-id="login-form">
    {/* ... (pola formularza bez zmian) ... */}

    <button
      type="submit"
      disabled={isSubmitting}
      className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50"
      data-test-id="login-submit-button"
    >
      {isSubmitting ? 'Logowanie...' : 'Zaloguj się'}
    </button>

    <div className="text-center space-y-3"> {/* MODYFIKACJA: dodano space-y-3 */}
      <a href="/reset-hasla" className="block text-sm text-primary hover:underline" data-test-id="login-forgot-password-link">
        Zapomniałeś hasła?
      </a>

      {/* NOWE: Przycisk do rejestracji */}
      <div className="pt-4 border-t border-gray-200">
        <p className="text-sm text-neutral-dark/70 mb-3">
          Nie masz jeszcze konta?
        </p>
        <a
          href="/rejestracja"
          className="block w-full bg-white border-2 border-primary text-primary py-3 rounded-lg font-semibold hover:bg-primary hover:text-white transition"
          data-test-id="login-signup-link"
        >
          Utwórz nowe konto
        </a>
      </div>
    </div>
  </form>
)
```

---

## 7. Testy

### 7.1. Testy Jednostkowe

**Nowe/Modyfikowane pliki testowe**:

1. **`tests/unit/services/authService.test.ts`** (MODYFIKACJA):
   - Dodaj test case: `signup without invitationToken (public signup)`
   - Weryfikacja: użytkownik utworzony, brak wywołania `markUsed()` na invitation
   - Weryfikacja: event tracking z `source: 'public_signup'`

2. **`tests/unit/schemas/auth.test.ts`** (MODYFIKACJA):
   - Dodaj test case: `signupSchema validates without invitationToken`
   - Dodaj test case: `signupSchema validates with invitationToken`

### 7.2. Testy Integracyjne

**Nowe pliki testowe**:

1. **`tests/integration/api/auth/public-signup.test.ts`** (NOWY):
   - Test endpoint `/api/auth/public-signup`
   - Scenariusze:
     - ✅ Rejestracja udana (201 Created)
     - ❌ Email już istnieje (409 Conflict)
     - ❌ Brak wymaganych zgód (400 Bad Request)
     - ❌ Nieprawidłowe dane (422 Unprocessable Entity)
   - Weryfikacja sesji i ciasteczka
   - Weryfikacja zapisu do bazy danych

2. **`tests/integration/transactions/signup.test.ts`** (MODYFIKACJA):
   - Dodaj test case dla publicznej rejestracji (bez `invitationToken`)

### 7.3. Testy E2E

**Nowe pliki testowe**:

1. **`tests/e2e/public-signup-flow.spec.ts`** (NOWY):
   - Przepływ: `/rejestracja` → wypełnienie formularza → `/waga/welcome`
   - Weryfikacja:
     - Pole email jest edytowalne
     - Brak informacji o zaproszeniu
     - Formularz wysyła dane do `/api/auth/public-signup`
     - Przekierowanie po sukcesie

2. **`tests/e2e/login-signup-link.spec.ts`** (NOWY):
   - Weryfikacja przycisku "Utwórz nowe konto" na `/logowanie`
   - Kliknięcie przekierowuje do `/rejestracja`

3. **`tests/e2e/invitation-signup-flow.spec.ts`** (MODYFIKACJA - test regresji):
   - Weryfikacja, że rejestracja przez zaproszenie nadal działa poprawnie
   - Pole email readonly
   - Wyświetlana informacja o ważności zaproszenia

---

## 8. Dokumentacja

### 8.1. Aktualizacja `CLAUDE.md`

**Sekcja "Authentication & Security"**:

Dodaj informacje o dwóch ścieżkach rejestracji:
```markdown
## Authentication & Security

**Rejestracja pacjentów - 2 ścieżki**:

1. **Rejestracja przez zaproszenie** (istniejąca):
   - Dietetyk wysyła zaproszenie na email pacjenta
   - Link zawiera token zaproszenia (SHA-256 hash)
   - Formularz: `/auth/signup?token=...`
   - Email readonly (z zaproszenia)
   - Endpoint: `POST /api/auth/signup` (wymaga `invitationToken`)

2. **Publiczna rejestracja** (nowa):
   - Pacjent samodzielnie zakłada konto
   - Formularz: `/rejestracja`
   - Email edytowalne
   - Endpoint: `POST /api/auth/public-signup` (bez `invitationToken`)
   - System działa dla jednego dietetyka - wszyscy pacjenci są widoczni

**Wspólne cechy**:
- Identyczny formularz (imię, nazwisko, wiek, płeć, hasło, zgody RODO)
- Wspólna ścieżka onboardingu (`/waga/welcome`)
- Hasła hashowane SHA-256 (klient) + bcrypt (serwer)
```

### 8.2. Aktualizacja `.ai-10xdevs/api-plan.md`

Dodaj dokumentację nowego endpointu `POST /api/auth/public-signup`.

---

## 9. Checklist Implementacji

### Faza 1: Backend - Logika Biznesowa
- [ ] Rozszerz interfejs `SignupRequest` w `src/types.ts` (`invitationToken` opcjonalne)
- [ ] Zmodyfikuj `authService.signup()`:
  - Walidacja `invitationToken` tylko jeśli został podany
  - Warunek `if (invitation)` przed `markUsed()` i audit log
  - Event tracking z `source: 'invitation' | 'public_signup'`
- [ ] Zaktualizuj schematy Zod w `src/schemas/auth.ts`:
  - `invitationToken` opcjonalne

### Faza 2: Backend - API Endpoint
- [ ] **Opcja A**: Brak zmian (reużycie `/api/auth/signup`)
- [ ] **Opcja B** (zalecane): Utwórz `src/pages/api/auth/public-signup.ts`

### Faza 3: Frontend - Nowa Strona Rejestracji
- [ ] Utwórz `src/pages/rejestracja.astro`
- [ ] Zmodyfikuj `src/components/SignupForm.tsx`:
  - Dodaj props `mode?: 'invitation' | 'public'`
  - Logika warunkowa dla pola email (readonly vs edytowalne)
  - Logika warunkowa dla endpointu API
  - Logika warunkowa dla payload (z/bez `invitationToken`)
  - Walidacja email (tylko w trybie public)
  - Warunek wyświetlania alertu o zaproszeniu
- [ ] Zaktualizuj `src/pages/auth/signup.astro` (dodaj prop `mode="invitation"`)

### Faza 4: Frontend - Modyfikacja Strony Logowania
- [ ] Zmodyfikuj `src/components/LoginForm.tsx`:
  - Dodaj sekcję z przyciskiem "Utwórz nowe konto"
  - Link do `/rejestracja`

### Faza 5: Testy
- [ ] Testy jednostkowe:
  - `tests/unit/services/authService.test.ts` - dodaj case dla public signup
  - `tests/unit/schemas/auth.test.ts` - walidacja bez `invitationToken`
- [ ] Testy integracyjne:
  - `tests/integration/api/auth/public-signup.test.ts` (nowy)
  - `tests/integration/transactions/signup.test.ts` - dodaj case
- [ ] Testy E2E:
  - `tests/e2e/public-signup-flow.spec.ts` (nowy)
  - `tests/e2e/login-signup-link.spec.ts` (nowy)
  - `tests/e2e/invitation-signup-flow.spec.ts` - test regresji

### Faza 6: Dokumentacja
- [ ] Aktualizuj `CLAUDE.md` (sekcja Authentication)
- [ ] Aktualizuj `.ai-10xdevs/api-plan.md` (endpoint `/api/auth/public-signup`)
- [ ] Przenieś ten plik do archiwum: `.ai-10xdevs/archive/public-signup-plan.md`

### Faza 7: Weryfikacja i Deploy
- [ ] Przetestuj lokalnie:
  - Rejestracja przez `/rejestracja`
  - Rejestracja przez `/auth/signup?token=...` (regresja)
  - Logowanie po rejestracji
- [ ] Code review
- [ ] Merge do `main`
- [ ] Weryfikacja na produkcji

---

## 10. Szacowany Czas Implementacji

| Faza | Czas |
|------|------|
| Faza 1: Backend - Logika | 1.5h |
| Faza 2: Backend - API | 30 min |
| Faza 3: Frontend - Rejestracja | 2h |
| Faza 4: Frontend - Logowanie | 30 min |
| Faza 5: Testy | 3h |
| Faza 6: Dokumentacja | 30 min |
| Faza 7: Weryfikacja | 1h |
| **RAZEM** | **~9h** |

---

## 11. Potencjalne Ryzyka i Mitigation

### Ryzyko 1: Regresja istniejącej ścieżki rejestracji
**Problem**: Zmiany w `SignupForm.tsx` i `authService.signup()` mogą złamać rejestrację przez zaproszenie.

**Rozwiązanie**:
- Testy regresji w `tests/integration/transactions/signup.test.ts`
- Testy E2E dla ścieżki invitation
- Code review przed mergem

### Ryzyko 2: Duplikacja kodu w endpoincie
**Problem**: Jeśli wybierzemy Opcję B (nowy endpoint), będziemy mieli duplikację kodu między `/api/auth/signup` i `/api/auth/public-signup`.

**Rozwiązanie**:
- Akceptowalna duplikacja (kod jest prosty i krótki)
- Alternatywnie: Opcja A (reużycie istniejącego endpointu)

---

## 12. Decyzja: Opcja A vs Opcja B

**Zalecam Opcję B** (nowy endpoint `/api/auth/public-signup`) ze względu na:
- ✅ Czytelniejszy kod
- ✅ Łatwiejsze testy (osobne pliki testowe)
- ✅ Wyraźne rozróżnienie ścieżek w logach i analytics
- ✅ Łatwiejsza ewentualna rozbudowa (np. captcha tylko dla publicznej rejestracji)

**Wady Opcji B**:
- ❌ Duplikacja ~100 linii kodu (akceptowalne)

**Jeśli wolisz Opcję A** (reużycie istniejącego endpointu):
- Pomiń Fazę 2 w checkliście
- W `SignupForm.tsx` użyj tego samego endpointu dla obu trybów: `const apiEndpoint = '/api/auth/signup'`

---

## 13. Uwagi Końcowe

- **Brak zmian w bazie danych** ✅
- **Zgodność z RODO**: Publiczna rejestracja wymaga tych samych zgód co rejestracja przez zaproszenie ✅
- **Bezpieczeństwo**: Hasła hashowane SHA-256 (klient) + bcrypt (serwer) ✅
- **UX**: Wspólna ścieżka onboardingu (`/waga/welcome`) dla wszystkich pacjentów ✅
- **System dla jednego dietetyka**: Wszyscy pacjenci widoczni, brak logiki przypisania ✅

---

**Plan przygotowany**: 2025-01-03
**Wersja**: 2.0 (zmodyfikowana - bez `dietitianId`)
**Status**: Oczekuje na akceptację użytkownika
