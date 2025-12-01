# Plan implementacji widoku Strony Powitalnej Pacjenta

## 1. Przegląd

Strona powitalna (`/waga/welcome`) to widok onboardingowy dla nowo zarejestrowanych pacjentów. Jej głównym celem jest wprowadzenie użytkownika do aplikacji, wyjaśnienie kluczowych funkcjonalności oraz zachęcenie do dodania pierwszego wpisu wagi. Widok powinien być prosty, przyjazny i mobilny-first, z możliwością szybkiego dodania pierwszej wagi lub pominięcia tego kroku.

**Kluczowe założenia:**
- Widok wyświetlany tylko raz po pierwszej rejestracji
- Dostępny wyłącznie dla zalogowanych pacjentów
- Automatyczne przekierowanie do `/waga` jeśli użytkownik ma już wpisy wagi
- Mobile-first responsive design
- Zgodność z WCAG AA (accessibility)

## 2. Routing widoku

**Ścieżka:** `/waga/welcome`

**Plik:** `src/pages/waga/welcome.astro`

**Middleware/Guards:**
- Wymaga autentykacji (Lucia Auth middleware)
- Wymaga roli `patient`
- Sprawdzenie czy użytkownik ma już wpisy wagi:
  - Jeśli TAK → redirect do `/waga` (dashboard)
  - Jeśli NIE → renderowanie widoku welcome

**Logika sprawdzenia wpisów:**
```typescript
// W pliku welcome.astro (server-side)
const weightEntries = await db
  .select()
  .from(weightEntriesTable)
  .where(eq(weightEntriesTable.userId, user.id))
  .limit(1);

if (weightEntries.length > 0) {
  return Astro.redirect('/waga');
}
```

## 3. Struktura komponentów

```
WelcomePage (welcome.astro) - SSR
├── Layout.astro
│   ├── Header
│   └── Main
│       ├── WelcomeHero.tsx (React island, client:load)
│       │   ├── Ilustracja/Obraz
│       │   ├── Nagłówek H1
│       │   ├── Opis (1-2 zdania)
│       │   └── Informacja o obowiązku tygodniowym
│       │
│       ├── OnboardingSteps.tsx (React island, client:visible)
│       │   ├── StepCard (1. Dodaj wagę)
│       │   ├── StepCard (2. Otrzymuj przypomnienia)
│       │   └── StepCard (3. Śledź postępy)
│       │
│       └── WeightEntryWidget.tsx (React island, client:load)
│           ├── Form
│           │   ├── WeightInput (number input)
│           │   ├── DatePicker (opcjonalnie, domyślnie dzisiaj)
│           │   └── NoteInput (textarea, opcjonalnie)
│           ├── SubmitButton ("Dodaj pierwszą wagę")
│           ├── SkipButton ("Pomiń i przejdź do dashboardu")
│           └── ErrorDisplay / SuccessToast
│   └── Footer
```

## 4. Szczegóły komponentów

### 4.1. WelcomeHero.tsx

**Opis:**
Komponent hero wprowadzający użytkownika do aplikacji. Wyświetla przyjazny nagłówek, krótkie wyjaśnienie celu aplikacji oraz informację o obowiązku tygodniowym (minimum 1 wpis wagi na tydzień).

**Główne elementy HTML:**
```tsx
<section className="welcome-hero">
  <div className="container">
    <div className="hero-content">
      <img src="..." alt="Ilustracja wagi i zdrowia" />
      <h1>Witaj w Monitoringu Wagi!</h1>
      <p className="lead">
        Dzięki regularnym wpisom wagi pomożemy Ci śledzić postępy
        i osiągnąć cele zdrowotne pod opieką Pauliny.
      </p>
      <div className="info-box">
        <Icon name="calendar" />
        <p>Dodaj wagę minimum raz w tygodniu</p>
      </div>
    </div>
  </div>
</section>
```

**Obsługiwane interakcje:**
- Brak interakcji (statyczny komponent prezentacyjny)

**Obsługiwana walidacja:**
- Brak walidacji

**Typy:**
```typescript
interface WelcomeHeroProps {
  firstName?: string; // Imię użytkownika dla personalizacji
}
```

**Propsy:**
- `firstName` (optional): Imię pacjenta do personalizacji powitania

---

### 4.2. OnboardingSteps.tsx

**Opis:**
Komponent prezentujący 3-krokowy przewodnik po aplikacji. Każdy krok wyświetlany jest jako karta z ikoną, tytułem i krótkim opisem.

**Główne elementy HTML:**
```tsx
<section className="onboarding-steps">
  <div className="container">
    <h2>Jak to działa?</h2>
    <div className="steps-grid">
      <StepCard step={1} />
      <StepCard step={2} />
      <StepCard step={3} />
    </div>
  </div>
</section>

// StepCard component
<div className="step-card">
  <div className="step-number">1</div>
  <Icon name="weight-scale" />
  <h3>Dodaj wagę</h3>
  <p>Wprowadź swoją aktualną wagę w kilku sekundach</p>
</div>
```

**Obsługiwane interakcje:**
- Opcjonalnie: hover effect na kartach (pure CSS lub light JS)

**Obsługiwana walidacja:**
- Brak walidacji

**Typy:**
```typescript
interface OnboardingStep {
  step: number;
  icon: string; // Nazwa ikony
  title: string;
  description: string;
}

interface OnboardingStepsProps {
  steps?: OnboardingStep[]; // Opcjonalnie customowe kroki
}
```

**Propsy:**
- `steps` (optional): Tablica kroków (domyślnie 3 predefiniowane kroki)

**Domyślne kroki:**
1. **Dodaj wagę** - "Wprowadź swoją aktualną wagę w kilku sekundach"
2. **Otrzymuj przypomnienia** - "Otrzymuj przypomnienia w piątki i niedziele"
3. **Śledź postępy** - "Zobacz wykresy i analizę swoich postępów"

---

### 4.3. WeightEntryWidget.tsx

**Opis:**
Główny interaktywny komponent widoku. Formularz do dodania pierwszej wagi z walidacją, obsługą błędów i komunikacją z API. Po pomyślnym dodaniu wagi przekierowuje użytkownika do dashboardu. Zawiera również opcję "Pomiń" do przejścia do dashboardu bez dodawania wagi.

**Główne elementy HTML:**
```tsx
<div className="weight-entry-widget">
  <h2>Dodaj pierwszą wagę</h2>

  <form onSubmit={handleSubmit}>
    {/* Weight Input */}
    <div className="form-group">
      <label htmlFor="weight">
        Waga (kg) <span className="required">*</span>
      </label>
      <input
        type="number"
        id="weight"
        name="weight"
        min="30"
        max="250"
        step="0.1"
        value={weight}
        onChange={handleWeightChange}
        placeholder="np. 75.5"
        aria-describedby="weight-error"
        aria-invalid={!!errors.weight}
      />
      {errors.weight && (
        <p id="weight-error" className="error-message" role="alert">
          {errors.weight}
        </p>
      )}
    </div>

    {/* Date Picker (opcjonalnie) */}
    <div className="form-group">
      <label htmlFor="measurementDate">Data pomiaru</label>
      <input
        type="date"
        id="measurementDate"
        value={measurementDate}
        max={today}
        min={sevenDaysAgo}
        onChange={handleDateChange}
      />
    </div>

    {/* Note (opcjonalnie) */}
    <div className="form-group">
      <label htmlFor="note">Notatka (opcjonalnie)</label>
      <textarea
        id="note"
        name="note"
        maxLength={200}
        value={note}
        onChange={handleNoteChange}
        placeholder="np. po śniadaniu"
      />
      <p className="helper-text">{note.length}/200</p>
    </div>

    {/* Buttons */}
    <div className="button-group">
      <button
        type="submit"
        className="btn btn-primary"
        disabled={isSubmitting || !!errors.weight}
      >
        {isSubmitting ? 'Dodawanie...' : 'Dodaj pierwszą wagę'}
      </button>

      <button
        type="button"
        className="btn btn-text"
        onClick={handleSkip}
        disabled={isSubmitting}
      >
        Pomiń i przejdź do dashboardu
      </button>
    </div>
  </form>
</div>
```

**Obsługiwane interakcje:**
1. **Wpisanie wagi**: onChange validation
2. **Wybór daty**: Domyślnie dzisiaj, można wybrać max 7 dni wstecz
3. **Dodanie notatki**: Opcjonalne, max 200 znaków
4. **Submit**: Walidacja + API call + redirect
5. **Skip**: Przekierowanie do `/waga` bez dodawania wagi

**Obsługiwana walidacja:**

1. **Pole `weight` (wymagane):**
   - Typ: number
   - Min: 30 kg (komunikat: "Waga nie może być mniejsza niż 30 kg")
   - Max: 250 kg (komunikat: "Waga nie może być większa niż 250 kg")
   - Step: 0.1 kg
   - Pattern: Maksymalnie 1 miejsce po przecinku
   - Wymagane: Tak (komunikat: "Waga jest wymagana")

2. **Pole `measurementDate`:**
   - Min: Dzisiaj - 7 dni (backfill limit)
   - Max: Dzisiaj (nie można wybrać przyszłej daty)
   - Domyślnie: Dzisiaj
   - Walidacja: Sprawdzenie czy data nie jest w przyszłości
   - Komunikat błędu: "Możesz dodać wagę maksymalnie 7 dni wstecz"

3. **Pole `note` (opcjonalne):**
   - Max length: 200 znaków
   - Komunikat: Licznik znaków (np. "150/200")

**Typy:**
```typescript
// ViewModel dla formularza
interface WeightEntryFormData {
  weight: string; // String w formularzu, konwersja do number przed submit
  measurementDate: string; // ISO date string
  note?: string;
}

// Errors state
interface WeightEntryErrors {
  weight?: string;
  measurementDate?: string;
  note?: string;
  submit?: string; // Błąd z API
}

// Component props
interface WeightEntryWidgetProps {
  onSuccess?: () => void; // Callback po pomyślnym dodaniu
  onSkip?: () => void; // Callback po pominięciu
}
```

**Propsy:**
- `onSuccess` (optional): Callback wykonywany po pomyślnym dodaniu wagi (przed redirectem)
- `onSkip` (optional): Callback wykonywany po kliknięciu "Pomiń"

---

## 5. Typy

### 5.1. Nowe typy ViewModel (do stworzenia w `src/types.ts` lub lokalne w komponencie)

```typescript
/**
 * ViewModel dla formularza dodawania pierwszej wagi
 */
export interface WeightEntryFormData {
  weight: string; // String w input, konwertowany do number przed wysłaniem
  measurementDate: string; // ISO date string (YYYY-MM-DD)
  note?: string; // Opcjonalna notatka, max 200 znaków
}

/**
 * Błędy walidacji formularza wagi
 */
export interface WeightEntryErrors {
  weight?: string;
  measurementDate?: string;
  note?: string;
  submit?: string; // Ogólny błąd z API
}

/**
 * Pojedynczy krok onboardingu
 */
export interface OnboardingStep {
  step: number;
  icon: string; // Nazwa ikony lub ścieżka
  title: string;
  description: string;
}

/**
 * Props dla WelcomeHero
 */
export interface WelcomeHeroProps {
  firstName?: string;
}

/**
 * Props dla OnboardingSteps
 */
export interface OnboardingStepsProps {
  steps?: OnboardingStep[];
}

/**
 * Props dla WeightEntryWidget
 */
export interface WeightEntryWidgetProps {
  onSuccess?: () => void;
  onSkip?: () => void;
}
```

### 5.2. Istniejące typy z `src/types.ts` (do wykorzystania)

```typescript
// Request dla API dodawania wagi
import type { CreateWeightEntryRequest } from '@/types';
// {
//   weight: number;
//   measurementDate: string; // ISO string
//   note?: string;
// }

// Response z API
import type { CreateWeightEntryResponse, AnomalyWarning } from '@/types';
// CreateWeightEntryResponse {
//   entry: WeightEntryDTO;
//   warnings: AnomalyWarning[];
// }

// AnomalyWarning (dla pierwszej wagi prawdopodobnie pusta tablica)
// {
//   type: 'anomaly_detected';
//   message: string;
//   previousWeight: number;
//   previousDate: string;
//   change: number;
// }
```

---

## 6. Zarządzanie stanem

### 6.1. State w WeightEntryWidget

Komponent `WeightEntryWidget.tsx` zarządza własnym stanem za pomocą React hooks:

```typescript
// Form data
const [formData, setFormData] = useState<WeightEntryFormData>({
  weight: '',
  measurementDate: new Date().toISOString().split('T')[0], // Dzisiaj
  note: ''
});

// Validation errors
const [errors, setErrors] = useState<WeightEntryErrors>({});

// Submission state
const [isSubmitting, setIsSubmitting] = useState(false);
```

### 6.2. Custom Hook: `useWeightEntry`

**Opcjonalnie** można wyodrębnić logikę do custom hooka dla lepszej separacji:

```typescript
// src/hooks/useWeightEntry.ts

export function useWeightEntry() {
  const [formData, setFormData] = useState<WeightEntryFormData>({
    weight: '',
    measurementDate: new Date().toISOString().split('T')[0],
    note: ''
  });

  const [errors, setErrors] = useState<WeightEntryErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Walidacja pola weight
  const validateWeight = (value: string): string | undefined => {
    if (!value) return 'Waga jest wymagana';
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return 'Waga musi być liczbą';
    if (numValue < 30) return 'Waga nie może być mniejsza niż 30 kg';
    if (numValue > 250) return 'Waga nie może być większa niż 250 kg';
    if (!/^\d+(\.\d{1})?$/.test(value)) return 'Maksymalnie 1 miejsce po przecinku';
    return undefined;
  };

  // Walidacja daty
  const validateDate = (value: string): string | undefined => {
    const selectedDate = new Date(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    if (selectedDate > today) {
      return 'Nie można wybrać przyszłej daty';
    }
    if (selectedDate < sevenDaysAgo) {
      return 'Możesz dodać wagę maksymalnie 7 dni wstecz';
    }
    return undefined;
  };

  // Submit handler
  const handleSubmit = async (): Promise<boolean> => {
    // Walidacja
    const weightError = validateWeight(formData.weight);
    const dateError = validateDate(formData.measurementDate);

    if (weightError || dateError) {
      setErrors({ weight: weightError, measurementDate: dateError });
      return false;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const response = await fetch('/api/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight: parseFloat(formData.weight),
          measurementDate: formData.measurementDate,
          note: formData.note || undefined
        } as CreateWeightEntryRequest)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Wystąpił błąd');
      }

      const data: CreateWeightEntryResponse = await response.json();

      // Opcjonalnie: sprawdź warnings (dla pierwszej wagi prawdopodobnie brak)
      if (data.warnings.length > 0) {
        console.warn('Warnings:', data.warnings);
      }

      return true;
    } catch (error) {
      setErrors({ submit: error.message });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    formData,
    setFormData,
    errors,
    isSubmitting,
    validateWeight,
    validateDate,
    handleSubmit
  };
}
```

**Użycie w komponencie:**
```typescript
const {
  formData,
  setFormData,
  errors,
  isSubmitting,
  handleSubmit
} = useWeightEntry();
```

### 6.3. State w pozostałych komponentach

- **WelcomeHero**: Brak stanu (statyczny prezentacyjny komponent)
- **OnboardingSteps**: Brak stanu (statyczny prezentacyjny komponent)

---

## 7. Integracja API

### 7.1. Endpoint dodawania wagi

**URL:** `POST /api/weight`

**Request Type:** `CreateWeightEntryRequest`
```typescript
{
  weight: number;          // 30-250, step 0.1
  measurementDate: string; // ISO date string (YYYY-MM-DD)
  note?: string;           // Opcjonalnie, max 200 znaków
}
```

**Response Type:** `CreateWeightEntryResponse`
```typescript
{
  entry: {
    id: string;
    userId: string;
    weight: number;
    measurementDate: string;
    source: 'patient' | 'dietitian';
    isBackfill: boolean;
    isOutlier: boolean;
    outlierConfirmed: boolean | null;
    note: string | null;
    createdAt: Date;
    createdBy: string;
  };
  warnings: AnomalyWarning[];
}
```

**Kody błędów:**
- `400` - Błąd walidacji (np. nieprawidłowa waga, data w przyszłości)
- `401` - Brak autoryzacji
- `409` - Wpis dla tej daty już istnieje (conflict)
- `500` - Błąd serwera

### 7.2. Implementacja w komponencie

```typescript
const handleFormSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const success = await handleSubmit(); // Z custom hook

  if (success) {
    // Toast notification
    toast.success('Pierwsza waga dodana! Przekierowuję do dashboardu...');

    // Callback (jeśli przekazany)
    onSuccess?.();

    // Redirect po 1.5s
    setTimeout(() => {
      window.location.href = '/waga';
    }, 1500);
  } else {
    // Błąd - toast już wyświetlony w hook
    toast.error(errors.submit || 'Nie udało się dodać wagi');
  }
};
```

### 7.3. Sprawdzenie czy użytkownik ma już wpisy (server-side)

W pliku `src/pages/waga/welcome.astro`:

```typescript
---
import { db } from '@/db';
import { weightEntries } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Auth middleware powinien ustawić user w Astro.locals
const user = Astro.locals.user;

if (!user || user.role !== 'patient') {
  return Astro.redirect('/login');
}

// Sprawdź czy użytkownik ma już wpisy
const existingEntries = await db
  .select()
  .from(weightEntries)
  .where(eq(weightEntries.userId, user.id))
  .limit(1);

if (existingEntries.length > 0) {
  // Użytkownik ma już wpisy - redirect do dashboardu
  return Astro.redirect('/waga');
}
---
```

---

## 8. Interakcje użytkownika

### 8.1. Wejście na stronę `/waga/welcome`

**Scenariusz 1: Użytkownik niezalogowany**
- System wykrywa brak sesji
- Przekierowanie do `/login`

**Scenariusz 2: Użytkownik zalogowany (pacjent) bez wpisów**
- System renderuje widok welcome
- Wyświetlenie WelcomeHero z personalizowanym powitaniem
- Wyświetlenie OnboardingSteps
- Wyświetlenie WeightEntryWidget

**Scenariusz 3: Użytkownik zalogowany z wpisami**
- System wykrywa istniejące wpisy
- Automatyczne przekierowanie do `/waga` (dashboard)

**Scenariusz 4: Użytkownik zalogowany jako dietetyk**
- System wykrywa rolę `dietitian`
- Przekierowanie do `/dietetyk` lub komunikat błędu

### 8.2. Dodanie pierwszej wagi

**Krok 1: Wpisanie wartości**
- Użytkownik klika w pole "Waga (kg)"
- Wpisuje wartość (np. "75.5")
- Walidacja w czasie rzeczywistym:
  - Jeśli wartość < 30 → wyświetl błąd pod polem
  - Jeśli wartość > 250 → wyświetl błąd pod polem
  - Jeśli wartość poprawna → usuń błąd, odblokuj przycisk submit

**Krok 2: Opcjonalnie - zmiana daty**
- Użytkownik klika w pole daty
- Wybiera datę (max 7 dni wstecz)
- Walidacja:
  - Jeśli data w przyszłości → błąd
  - Jeśli data > 7 dni wstecz → błąd

**Krok 3: Opcjonalnie - dodanie notatki**
- Użytkownik wpisuje notatkę (max 200 znaków)
- Licznik znaków aktualizuje się na żywo

**Krok 4: Submit**
- Użytkownik klika "Dodaj pierwszą wagę"
- Przycisk zmienia stan na "Dodawanie..." (disabled)
- Wysłanie POST request do `/api/weight`
- **Success:**
  - Toast notification: "Pierwsza waga dodana! Przekierowuję..."
  - Redirect do `/waga` po 1.5s
- **Error:**
  - Toast notification z komunikatem błędu
  - Przycisk wraca do stanu aktywnego
  - Użytkownik może poprawić dane i spróbować ponownie

### 8.3. Pominięcie dodawania wagi (Skip)

**Krok 1: Kliknięcie "Pomiń"**
- Użytkownik klika przycisk "Pomiń i przejdź do dashboardu"

**Krok 2: Opcjonalnie - Potwierdzenie**
- Modal/dialog: "Czy na pewno chcesz pominąć? Możesz dodać wagę później."
- Przyciski: "Tak, pomiń" / "Anuluj"

**Krok 3: Redirect**
- Przekierowanie do `/waga` (dashboard) bez dodawania wagi

---

## 9. Warunki i walidacja

### 9.1. Warunki dostępu do widoku

**Warunek 1: Autentykacja**
- **Komponent:** Middleware/Guard na poziomie strony
- **Sprawdzenie:** Czy użytkownik jest zalogowany (session exists)
- **Wpływ na UI:** Jeśli NIE → redirect do `/login`

**Warunek 2: Rola użytkownika**
- **Komponent:** Middleware/Guard na poziomie strony
- **Sprawdzenie:** Czy `user.role === 'patient'`
- **Wpływ na UI:** Jeśli NIE → redirect do `/dietetyk` lub błąd 403

**Warunek 3: Brak istniejących wpisów**
- **Komponent:** Server-side logic w `welcome.astro`
- **Sprawdzenie:** Query do bazy - czy użytkownik ma wpisy wagi
- **Wpływ na UI:** Jeśli TAK (ma wpisy) → redirect do `/waga`

### 9.2. Walidacja formularza WeightEntryWidget

**Pole: weight**

| Warunek | Komponent | Sprawdzenie | Komunikat błędu | Wpływ na UI |
|---------|-----------|-------------|-----------------|-------------|
| Wymagane | WeightEntryWidget | `value.trim() === ''` | "Waga jest wymagana" | Czerwona ramka input + tekst błędu pod polem |
| Typ | WeightEntryWidget | `isNaN(parseFloat(value))` | "Waga musi być liczbą" | Czerwona ramka + błąd |
| Min | WeightEntryWidget | `parseFloat(value) < 30` | "Waga nie może być mniejsza niż 30 kg" | Czerwona ramka + błąd |
| Max | WeightEntryWidget | `parseFloat(value) > 250` | "Waga nie może być większa niż 250 kg" | Czerwona ramka + błąd |
| Precyzja | WeightEntryWidget | `!/^\d+(\.\d{1})?$/.test(value)` | "Maksymalnie 1 miejsce po przecinku" | Czerwona ramka + błąd |
| Submit ready | WeightEntryWidget | Wszystkie powyższe warunki OK | - | Przycisk submit aktywny (niebieski) |

**Pole: measurementDate**

| Warunek | Komponent | Sprawdzenie | Komunikat błędu | Wpływ na UI |
|---------|-----------|-------------|-----------------|-------------|
| Przyszła data | WeightEntryWidget | `selectedDate > today` | "Nie można wybrać przyszłej daty" | Czerwona ramka + błąd |
| Backfill limit | WeightEntryWidget | `selectedDate < (today - 7 days)` | "Możesz dodać wagę maksymalnie 7 dni wstecz" | Czerwona ramka + błąd |
| Valid | WeightEntryWidget | Data w zakresie | - | Normalny input |

**Pole: note**

| Warunek | Komponent | Sprawdzenie | Komunikat błędu | Wpływ na UI |
|---------|-----------|-------------|-----------------|-------------|
| Max length | WeightEntryWidget | `value.length <= 200` | - | Licznik "X/200" zmienia kolor na czerwony gdy > 200 |
| Valid | WeightEntryWidget | `value.length <= 200` | - | Normalny textarea |

### 9.3. Walidacja API (server-side)

Po wysłaniu formularza, API endpoint `/api/weight` wykonuje dodatkową walidację:

- Duplikat daty: Czy wpis dla tej daty już istnieje
- Integralność danych: Sprawdzenie userId, source = 'patient'
- Business rules: Np. flagowanie outliers (dla pierwszej wagi prawdopodobnie brak)

**Wpływ na UI:**
- Błąd 409 (conflict): Toast "Wpis dla tej daty już istnieje"
- Błąd 400 (validation): Toast z komunikatem z API
- Błąd 500: Toast "Wystąpił błąd serwera. Spróbuj ponownie."

---

## 10. Obsługa błędów

### 10.1. Błędy walidacji (client-side)

**Typ błędu:** Nieprawidłowa wartość w formularzu

**Detekcja:**
- Real-time validation w `onChange` handlers
- Pre-submit validation

**Prezentacja:**
- Czerwona ramka wokół pola input (`border-red-500`)
- Tekst błędu pod polem (kolor czerwony, `role="alert"`)
- Ikona ostrzeżenia obok label (opcjonalnie)
- `aria-invalid="true"` na input
- `aria-describedby` wskazujący na komunikat błędu

**Przykład:**
```tsx
<input
  type="number"
  className={`form-input ${errors.weight ? 'border-red-500' : 'border-gray-300'}`}
  aria-invalid={!!errors.weight}
  aria-describedby="weight-error"
/>
{errors.weight && (
  <p id="weight-error" className="text-red-600 text-sm mt-1" role="alert">
    {errors.weight}
  </p>
)}
```

### 10.2. Błędy sieciowe

**Typ błędu:** Brak połączenia z internetem, timeout

**Detekcja:**
- Catch block w `fetch()` call
- `error.name === 'TypeError'` (network error)

**Prezentacja:**
- Toast notification (react-hot-toast):
  ```typescript
  toast.error('Błąd połączenia. Sprawdź internet i spróbuj ponownie.', {
    duration: 5000,
    icon: '🔌'
  });
  ```

**Akcje użytkownika:**
- Przycisk submit wraca do stanu aktywnego
- Możliwość ponownej próby

### 10.3. Błędy API (4xx, 5xx)

**400 Bad Request:**
- **Przyczyna:** Błąd walidacji na serwerze
- **Prezentacja:** Toast z komunikatem z API (`error.message`)
- **Przykład:** "Waga musi być w zakresie 30-250 kg"

**401 Unauthorized:**
- **Przyczyna:** Brak lub nieprawidłowa sesja
- **Prezentacja:** Toast + redirect do `/login`
- **Komunikat:** "Sesja wygasła. Zaloguj się ponownie."

**409 Conflict:**
- **Przyczyna:** Wpis dla tej daty już istnieje
- **Prezentacja:** Toast notification
- **Komunikat:** "Wpis dla tej daty już istnieje. Edytuj istniejący wpis na dashboardzie."
- **Akcje:** Redirect do `/waga` (dashboard)

**500 Internal Server Error:**
- **Przyczyna:** Błąd serwera lub bazy danych
- **Prezentacja:** Toast notification
- **Komunikat:** "Wystąpił błąd serwera. Spróbuj ponownie za chwilę."
- **Akcje:** Możliwość retry, przycisk aktywny

### 10.4. Przypadki brzegowe

**Przypadek 1: Użytkownik dodaje wagę i wraca przyciskiem "back"**
- **Rozwiązanie:** Sprawdzenie po stronie serwera czy wpis istnieje → redirect do `/waga`

**Przypadek 2: Brak JavaScript (progressive enhancement)**
- **Rozwiązanie:** Formularz HTML z `action="/api/weight"` i `method="POST"`
- Server-side validation i redirect

**Przypadek 3: Użytkownik ma wyłączone cookies**
- **Rozwiązanie:** Middleware auth wykryje brak sesji → redirect do `/login` z komunikatem

**Przypadek 4: Wolne połączenie (długi czas ładowania)**
- **Rozwiązanie:**
  - Loading state na przycisku ("Dodawanie..." spinner)
  - Timeout po 30s z komunikatem "Żądanie trwa dłużej niż zwykle..."

---

## 11. Kroki implementacji

### Faza 1: Setup i struktura (1-2h)

1. **Utworzenie pliku strony**
   - Utwórz `src/pages/waga/welcome.astro`
   - Dodaj import Layout
   - Dodaj podstawową strukturę HTML

2. **Middleware autentykacji**
   - Sprawdzenie czy middleware auth jest skonfigurowany
   - Dodanie guard dla roli `patient`
   - Dodanie sprawdzenia liczby wpisów użytkownika
   - Implementacja logiki redirect (jeśli ma wpisy → `/waga`)

3. **Utworzenie folderów komponentów**
   - `src/components/waga/WelcomeHero.tsx`
   - `src/components/waga/OnboardingSteps.tsx`
   - `src/components/waga/WeightEntryWidget.tsx`

### Faza 2: Komponenty prezentacyjne (2-3h)

4. **Implementacja WelcomeHero.tsx**
   - Struktura HTML/JSX
   - Styling z TailwindCSS (kolory z design system)
   - Dodanie ilustracji (alt text dla accessibility)
   - Props interface (`firstName`)
   - Responsive design (mobile-first)

5. **Implementacja OnboardingSteps.tsx**
   - Struktura 3 kroków (StepCard)
   - Ikony dla każdego kroku (można użyć biblioteki jak `lucide-react`)
   - Styling cards (grid layout, responsive)
   - Hover effects (opcjonalnie)
   - Props interface (`steps`)

### Faza 3: Formularz wagi (4-5h)

6. **Utworzenie typów**
   - Dodanie do `src/types.ts`:
     - `WeightEntryFormData`
     - `WeightEntryErrors`
     - Props interfaces dla komponentów
   - Lub utworzenie lokalnego pliku `types.ts` w folderze `waga/`

7. **Custom hook `useWeightEntry`**
   - Utworzenie `src/hooks/useWeightEntry.ts`
   - State management (formData, errors, isSubmitting)
   - Funkcje walidacji (`validateWeight`, `validateDate`)
   - Submit handler z API call
   - Error handling

8. **Implementacja WeightEntryWidget.tsx**
   - Struktura formularza
   - Input dla wagi (type="number", min, max, step)
   - Date picker (domyślnie dzisiaj, max 7 dni wstecz)
   - Textarea dla notatki (opcjonalnie, max 200 znaków)
   - Submit button (loading state)
   - Skip button
   - Integration z `useWeightEntry` hook
   - Real-time validation (onChange)
   - Error messages display
   - Accessibility attributes (aria-*)

### Faza 4: Integracja i logika biznesowa (2-3h)

9. **API integration**
   - Konfiguracja fetch dla `POST /api/weight`
   - Obsługa response types (`CreateWeightEntryResponse`)
   - Error handling (try-catch, status codes)
   - Toast notifications (react-hot-toast)
   - Redirect po sukcesie (`window.location.href = '/waga'`)

10. **Server-side logic w welcome.astro**
    - Import db client i schema
    - Query do sprawdzenia wpisów użytkownika
    - Logika redirect jeśli użytkownik ma wpisy
    - Przekazanie `firstName` do WelcomeHero

11. **Integracja komponentów w welcome.astro**
    - Import komponentów React islands
    - Dodanie `client:load` / `client:visible` directives
    - Przekazanie props do komponentów
    - Layout i spacing

### Faza 5: Styling i responsywność (2-3h)

12. **Styling z TailwindCSS**
    - Zastosowanie kolorów z design system:
      - Primary (#4A7C59) dla CTA buttons
      - Secondary (#E8B4A8) dla akcentów
      - Neutral-light (#F9F6F3) dla tła
    - Typografia (Montserrat dla h1/h2, Open Sans dla body)
    - Spacing (8px grid)
    - Border radius (8-16px)

13. **Responsive design**
    - Mobile-first approach
    - Breakpoints: sm (640px), md (768px), lg (1024px)
    - Stack layout na mobile, grid na desktop dla OnboardingSteps
    - Touch-friendly inputs (min height 44px)
    - Testowanie na różnych rozdzielczościach

### Faza 6: Accessibility i UX (1-2h)

14. **Accessibility (WCAG AA)**
    - Alt text dla wszystkich obrazów
    - ARIA labels (`aria-label`, `aria-describedby`, `aria-invalid`)
    - Role attributes (`role="alert"` dla błędów)
    - Focus states (wyraźne outline na focus)
    - Keyboard navigation (Tab order, Enter na submit)
    - Color contrast (minimum 4.5:1)
    - Screen reader testing (opcjonalnie)

15. **UX improvements**
    - Loading spinners
    - Smooth transitions (fade-in dla błędów)
    - Autofocus na pole weight przy wejściu
    - Success animation (checkmark) po dodaniu wagi
    - Skip confirmation modal (opcjonalnie)

### Faza 7: Testing i debugging (2-3h)

16. **Manual testing**
    - Test scenariuszy użytkownika:
      - ✅ Niezalogowany → redirect do login
      - ✅ Pacjent bez wpisów → widok welcome
      - ✅ Pacjent z wpisami → redirect do dashboard
      - ✅ Dodanie pierwszej wagi → success
      - ✅ Błędy walidacji → komunikaty
      - ✅ Skip → redirect do dashboard
    - Test na różnych przeglądarkach (Chrome, Firefox, Safari)
    - Test na mobile (iOS Safari, Chrome Android)

17. **Edge cases testing**
    - Wolne połączenie (throttling)
    - Brak internetu (offline)
    - Błędy API (mock 500 error)
    - Duplikat daty (409 conflict)
    - Session expiry (401)

18. **Accessibility testing**
    - Keyboard navigation (tylko Tab + Enter)
    - Screen reader (VoiceOver na Mac, NVDA na Windows)
    - Color contrast checker (WebAIM Contrast Checker)
    - Focus visible testing

### Faza 8: Dokumentacja i code review (1h)

19. **Code documentation**
    - Dodanie JSDoc comments do komponentów
    - Dokumentacja props interfaces
    - README dla folderu `waga/` (opcjonalnie)

20. **Code review i cleanup**
    - Usunięcie console.logs
    - Sprawdzenie TypeScript errors
    - Formatting (prettier)
    - Git commit z opisowym message

---

## Szacowany czas implementacji

| Faza | Czas |
|------|------|
| Faza 1: Setup i struktura | 1-2h |
| Faza 2: Komponenty prezentacyjne | 2-3h |
| Faza 3: Formularz wagi | 4-5h |
| Faza 4: Integracja i logika | 2-3h |
| Faza 5: Styling i responsywność | 2-3h |
| Faza 6: Accessibility i UX | 1-2h |
| Faza 7: Testing i debugging | 2-3h |
| Faza 8: Dokumentacja | 1h |
| **TOTAL** | **15-22h** (~2-3 dni robocze) |

---

## Checklist końcowa

- [ ] Strona `/waga/welcome` renderuje się poprawnie
- [ ] Middleware auth działa (redirect niezalogowanych)
- [ ] Sprawdzenie wpisów użytkownika działa (redirect jeśli ma wpisy)
- [ ] WelcomeHero wyświetla się z personalizacją (firstName)
- [ ] OnboardingSteps wyświetla 3 kroki z ikonami
- [ ] WeightEntryWidget:
  - [ ] Input wagi waliduje się real-time (30-250 kg, 0.1 step)
  - [ ] Date picker ogranicza do 7 dni wstecz
  - [ ] Notatka ma licznik znaków (max 200)
  - [ ] Submit wysyła POST do `/api/weight`
  - [ ] Success → toast + redirect do `/waga`
  - [ ] Error → toast z komunikatem
  - [ ] Skip button → redirect do `/waga`
- [ ] Styling zgodny z design system (kolory, typografia, spacing)
- [ ] Responsive design działa (mobile + desktop)
- [ ] Accessibility:
  - [ ] Alt text dla obrazów
  - [ ] ARIA attributes
  - [ ] Focus states
  - [ ] Keyboard navigation
- [ ] Testing:
  - [ ] Wszystkie scenariusze użytkownika działają
  - [ ] Edge cases obsłużone
  - [ ] Mobile testing (iOS + Android)
- [ ] Dokumentacja i clean code