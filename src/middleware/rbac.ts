import { defineMiddleware } from 'astro:middleware'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const onRequest = defineMiddleware(async ({ url, locals, redirect }, next) => {
  const { user } = locals

  // Feature flag: Block all PZK routes when FF_PZK is disabled
  const isPzkEnabled = isFeatureEnabled('PZK')
  const isPzkRoute = url.pathname.startsWith('/pzk/') || url.pathname.startsWith('/pacjent/pzk')

  if (!isPzkEnabled && isPzkRoute) {
    // Return 404 for all PZK routes (both public and authenticated)
    return new Response(null, { status: 404, statusText: 'Not Found' })
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

  if (isProtectedRoute && !user) {
    return redirect('/logowanie')
  }

  // Role-based access
  if (url.pathname.startsWith('/dietetyk/') && user?.role !== 'dietitian') {
    return redirect('/pacjent/waga')
  }

  if (url.pathname.startsWith('/pacjent/') && user?.role !== 'patient') {
    return redirect('/dietetyk/dashboard')
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

    const redirectUrl = user.role === 'dietitian' ? '/dietetyk/dashboard' : '/pacjent/waga'
    return redirect(redirectUrl)
  }

  return next()
})
