import { z } from 'zod';

export const contactSchema = z.object({
  fullName: z.string().min(2, 'Imię i nazwisko musi mieć min. 2 znaki'),
  email: z.string().email('Podaj prawidłowy adres email'),
  phone: z.string()
    .regex(/^\+48\s?\d{3}\s?\d{3}\s?\d{3}$/, 'Numer telefonu powinien mieć format +48 XXX XXX XXX')
    .optional()
    .or(z.literal('')),
  message: z.string()
    .min(10, 'Wiadomość musi mieć min. 10 znaków')
    .max(1000, 'Max 1000 znaków'),
  gdprConsent: z.boolean().refine(val => val === true, 'Musisz zaakceptować politykę prywatności')
});

export type ContactFormData = z.infer<typeof contactSchema>;
