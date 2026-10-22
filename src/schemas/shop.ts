import { z } from 'zod'

// = MAX_CART_ITEMS z shopCheckoutService (test pilnuje zgodności). Nie importujemy serwisu,
// bo schemat będzie używany także w formularzu checkoutu (bundle przeglądarki).
export const MAX_ORDER_SLUGS = 20

/**
 * Suma kontrolna NIP: wagi 6,5,7,2,3,4,5,6,7 dla 9 pierwszych cyfr, suma mod 11 = cyfra kontrolna.
 * Reszta 10 nie odpowiada żadnej cyfrze → NIP nieprawidłowy (porównanie z cyfrą 0–9 zawsze false).
 *
 * @param nip - 10 cyfr, bez spacji i myślników
 */
export function isValidNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const sum = weights.reduce((acc, w, i) => acc + w * Number(nip[i]), 0)
  const checksum = sum % 11
  return checksum !== 10 && checksum === Number(nip[9])
}

const nipSchema = z
  .string({ required_error: 'Podaj NIP' })
  .transform((s) => s.replace(/[\s-]/g, ''))
  .refine(isValidNip, 'Nieprawidłowy NIP')

/**
 * POST /api/sklep/orders – body zamówienia.
 * Komunikaty po polsku: endpoint zwraca pierwszy z nich jako `error.message` (UI pokazuje go wprost).
 */
export const createOrderSchema = z.object({
  slugs: z
    .array(z.string().regex(/^[a-z0-9-]{1,100}$/, 'Nieprawidłowy produkt w koszyku'), {
      required_error: 'Koszyk jest pusty',
    })
    .min(1, 'Koszyk jest pusty')
    .max(MAX_ORDER_SLUGS, `Koszyk może zawierać maksymalnie ${MAX_ORDER_SLUGS} produktów`),
  email: z
    .string({ required_error: 'Podaj adres e-mail' })
    .trim()
    .toLowerCase()
    .email('Podaj poprawny adres e-mail')
    .max(255, 'Adres e-mail jest za długi'),
  firstName: z
    .string()
    .trim()
    .max(100, 'Imię może mieć maksymalnie 100 znaków')
    .optional()
    .transform((s) => s || undefined), // '' → undefined
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Zaakceptuj regulamin' }) }),
  acceptDigitalContent: z.literal(true, {
    errorMap: () => ({ message: 'Ta zgoda jest wymagana do natychmiastowej wysyłki e-booka' }),
  }),
  invoice: z
    .object({
      companyName: z
        .string({ required_error: 'Podaj nazwę firmy' })
        .trim()
        .min(2, 'Podaj nazwę firmy')
        .max(255, 'Nazwa firmy jest za długa'),
      nip: nipSchema,
      address: z
        .string({ required_error: 'Podaj adres firmy' })
        .trim()
        .min(5, 'Podaj pełny adres firmy')
        .max(500, 'Adres firmy jest za długi'),
    })
    .optional(),
  // SHA-256 hasła liczony w przeglądarce (jak przy logowaniu)
  createAccountPasswordHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Nieprawidłowe hasło')
    .optional(),
})

export type CreateOrderRequest = z.infer<typeof createOrderSchema>
