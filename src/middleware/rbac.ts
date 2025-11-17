import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async ({ url, locals, redirect }, next) => {
  const { user } = locals

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
    const redirectUrl = user.role === 'dietitian' ? '/dietetyk/dashboard' : '/pacjent/waga'
    return redirect(redirectUrl)
  }

  return next()
})
