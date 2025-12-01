import { z } from 'zod';

export const consultationSchema = z.object({
  consultationType: z.enum(['wstepna', 'kontrolna'], {
    errorMap: () => ({ message: 'Wybierz typ konsultacji' })
  }),
  visitType: z.enum(['online', 'gabinet'], {
    errorMap: () => ({ message: 'Wybierz rodzaj wizyty' })
  }),
  fullName: z.string().min(2, 'Imię i nazwisko musi mieć min. 2 znaki'),
  email: z.string().email('Podaj prawidłowy adres email'),
  phone: z.string().regex(/^\+48\s?\d{3}\s?\d{3}\s?\d{3}$/, 'Numer telefonu powinien mieć format +48 XXX XXX XXX'),
  preferredDate: z.string().max(200, 'Max 200 znaków').optional().or(z.literal('')),
  additionalInfo: z.string().max(500, 'Max 500 znaków').optional().or(z.literal('')),
  gdprConsent: z.boolean().refine(val => val === true, 'Musisz zaakceptować politykę prywatności'),
  recaptchaToken: z.string().min(1, 'Token reCAPTCHA jest wymagany')
});

export type ConsultationFormData = z.infer<typeof consultationSchema>;
