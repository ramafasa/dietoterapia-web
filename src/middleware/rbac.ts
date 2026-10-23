import { defineMiddleware } from 'astro:middleware'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { isShopSalesPath } from '@/lib/shop/guards'
import { homeFor } from '@/lib/roleHome'
import { safeNextPath } from '@/lib/safeRedirect'

/** Dopasowanie po granicy segmentu: `base` albo `base/...` (np. `/konto`, `/konto/zakupy`, ale nie `/kontakt`). */
const matchesBase = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`)

export const onRequest = defineMiddleware(async ({ url, locals, redirect }, next) => {
  const { user } = locals

  // Feature flag: Block all PZK routes when FF_PZK is disabled
  const isPzkEnabled = isFeatureEnabled('PZK')
  const isPzkRoute = url.pathname.startsWith('/pzk/') || url.pathname.startsWith('/pacjent/pzk')

  // Feature flag: Block all PZK API endpoints when FF_PZK is disabled
  // EXCEPT webhook endpoint (prevents lost payments from Tpay)
  const isPzkApiRoute = url.pathname.startsWith('/api/pzk/')
  const isWebhook = url.pathname === '/api/pzk/purchase/callback'

  if (!isPzkEnabled && isPzkRoute) {
    // Return 404 for all PZK routes (both public and authenticated)
    return new Response(null, { status: 404, statusText: 'Not Found' })
  }

  if (!isPzkEnabled && isPzkApiRoute && !isWebhook) {
    // Return 404 for all PZK API endpoints (except webhook)
    return new Response(null, { status: 404, statusText: 'Not Found' })
  }

  // Feature flag: FF_SKLEP wyłącza tylko sprzedaż (katalog, koszyk, wycena, tworzenie zamówienia).
  // Dostarczenie zakupionych plików, konto, strony płatności, status zamówienia i webhook
  // działają zawsze (klientki, które już zapłaciły, muszą mieć dostęp).
  const isShopEnabled = isFeatureEnabled('SKLEP')

  if (!isShopEnabled && isShopSalesPath(url.pathname)) {
    return new Response(null, { status: 404, statusText: 'Not Found' })
  }

  // Klientka sklepu nie ma wstępu do PZK – także do bramki /pacjent/pzk (wyjątek niżej)
  if (url.pathname === '/pacjent/pzk' && user?.role === 'customer') {
    return redirect(homeFor(user.role))
  }

  // Exception: /pacjent/pzk (entry gate only) handles its own access control and redirects
  // (allows unauthenticated users and dietitians to enter, page will redirect appropriately)
  // All other /pacjent/pzk/** routes require standard authentication
  if (url.pathname === '/pacjent/pzk') {
    return next()
  }

  // Protected routes
  const protectedPatterns = ['/pacjent/', '/dietetyk/']
  const isProtectedRoute = protectedPatterns.some(pattern => url.pathname.startsWith(pattern))
  // /konto/* – panel klientki sklepu, dostępny dla każdej zalogowanej roli
  const isAccountRoute = matchesBase(url.pathname, '/konto')

  if (isAccountRoute && !user) {
    // Powrót na tę samą stronę po zalogowaniu (LoginForm sprawdza `next` przez safeNextPath)
    return redirect(`/logowanie?next=${encodeURIComponent(url.pathname + url.search)}`)
  }

  if (isProtectedRoute && !user) {
    return redirect('/logowanie')
  }

  // Role-based access (cudza strefa → strona startowa własnej roli, bez pętli dla `customer`)
  if (url.pathname.startsWith('/dietetyk/') && user?.role !== 'dietitian') {
    return redirect(homeFor(user?.role))
  }

  if (url.pathname.startsWith('/pacjent/') && user?.role !== 'patient') {
    return redirect(homeFor(user?.role))
  }

  // Redirect logged-in users away from login page
  if (url.pathname === '/logowanie' && user) {
    // Exception: if login page carries PZK purchase intent, do NOT auto-redirect.
    // The client-side LoginForm (or future SSR) will handle immediate purchase initiation.
    const hasPzkIntent =
      url.searchParams.has('pzkModule') || url.searchParams.has('pzkBundle')
    if (hasPzkIntent) {
      return next()
    }

    // Exception: poprawny ?next= (np. /sklep/konto/{token} z Task 4.4) – pokazujemy formularz,
    // żeby można było zalogować się na właściwe konto. Niepoprawny next jest ignorowany.
    if (safeNextPath(url.searchParams.get('next'))) {
      return next()
    }

    return redirect(homeFor(user.role))
  }

  return next()
})
