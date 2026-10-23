/**
 * „Wyślij link ponownie” (Task 4.5) – wspólne dla endpointu i formularza (bundle przeglądarki: bez importów serwerowych).
 */

/** Jedyna odpowiedź 200 POST /api/sklep/resend-link – identyczna niezależnie od zamówień, limitów i wysyłki. */
export const RESEND_LINK_MESSAGE = 'Jeśli na ten adres jest opłacone zamówienie, wysłaliśmy link.'
