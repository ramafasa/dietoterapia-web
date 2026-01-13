import { useState, useEffect } from 'react';
import {
  getCookieConsent,
  setCookieConsent,
  hasConsent,
  ACCEPT_ALL_CONSENT,
  REJECT_OPTIONAL_CONSENT,
  type CookieConsent,
} from '../utils/cookieConsent';

export default function CookieBanner() {
  // Start hidden to avoid flash, check consent in useEffect
  const [isVisible, setIsVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [consent, setConsent] = useState<CookieConsent>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already given consent
    // This must run client-side after hydration
    setIsVisible(!hasConsent());
  }, []);

  useEffect(() => {
    // Listen for custom event to reopen banner from Footer
    const handleReopenBanner = () => {
      const existingConsent = getCookieConsent();
      if (existingConsent) {
        setConsent(existingConsent);
      }
      setShowSettings(true);
      setIsVisible(true);
    };

    window.addEventListener('reopenCookieBanner', handleReopenBanner);

    return () => {
      window.removeEventListener('reopenCookieBanner', handleReopenBanner);
    };
  }, []);

  const handleAcceptAll = () => {
    setCookieConsent(ACCEPT_ALL_CONSENT);
    setIsVisible(false);
    setShowSettings(false);
    // Reload to trigger GA load
    window.location.reload();
  };

  const handleRejectOptional = () => {
    setCookieConsent(REJECT_OPTIONAL_CONSENT);
    setIsVisible(false);
    setShowSettings(false);
  };

  const handleSaveSettings = () => {
    setCookieConsent(consent);
    setIsVisible(false);
    setShowSettings(false);
    // Reload if analytics or marketing was enabled
    if (consent.analytics || consent.marketing) {
      window.location.reload();
    }
  };

  const handleToggleSettings = () => {
    setShowSettings(!showSettings);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-primary shadow-lg">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Main banner content */}
        <div className="space-y-4">
          <p className="text-neutral-dark text-sm md:text-base leading-relaxed">
            Ta strona wykorzystuje pliki cookies w celu zapewnienia prawidłowego działania
            serwisu oraz w celach analitycznych. Możesz samodzielnie wybrać, które kategorie
            cookies chcesz zaakceptować. Więcej informacji znajdziesz w naszej{' '}
            <a
              href="/polityka-prywatnosci"
              className="text-primary underline hover:text-primary/80"
            >
              Polityce prywatności
            </a>
            .
          </p>

          {/* Settings panel (inline, collapsible) */}
          {showSettings && (
            <div className="border-t border-neutral-light pt-4 mt-4 space-y-3">
              {/* Necessary cookies */}
              <label className="flex items-start gap-3 cursor-not-allowed opacity-60" aria-label="Niezbędne ciasteczka (wymagane)">
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="mt-1 w-4 h-4 rounded border-gray-300"
                  aria-label="Niezbędne ciasteczka"
                />
                <div className="flex-1">
                  <div className="font-semibold text-neutral-dark text-sm">
                    Niezbędne (wymagane)
                  </div>
                  <div className="text-xs text-neutral-dark/70 mt-1">
                    Wymagane do prawidłowego działania strony (sesja, bezpieczeństwo, preferencje)
                  </div>
                </div>
              </label>

              {/* Analytics cookies */}
              <label className="flex items-start gap-3 cursor-pointer" aria-label="Analityczne ciasteczka">
                <input
                  type="checkbox"
                  checked={consent.analytics}
                  onChange={(e) => setConsent({ ...consent, analytics: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  aria-label="Analityczne ciasteczka"
                />
                <div className="flex-1">
                  <div className="font-semibold text-neutral-dark text-sm">
                    Analityczne
                  </div>
                  <div className="text-xs text-neutral-dark/70 mt-1">
                    Google Analytics - pomaga nam zrozumieć jak użytkownicy korzystają ze strony
                  </div>
                </div>
              </label>

              {/* Marketing cookies */}
              <label className="flex items-start gap-3 cursor-pointer" aria-label="Marketingowe ciasteczka">
                <input
                  type="checkbox"
                  checked={consent.marketing}
                  onChange={(e) => setConsent({ ...consent, marketing: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  aria-label="Marketingowe ciasteczka"
                />
                <div className="flex-1">
                  <div className="font-semibold text-neutral-dark text-sm">
                    Marketingowe
                  </div>
                  <div className="text-xs text-neutral-dark/70 mt-1">
                    Meta Pixel (Facebook) - kampanie remarketingowe i analiza skuteczności reklam
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {showSettings ? (
              <>
                <button
                  onClick={handleSaveSettings}
                  className="px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent/90 transition-colors text-sm"
                >
                  Zapisz ustawienia
                </button>
                <button
                  onClick={handleToggleSettings}
                  className="px-6 py-3 bg-neutral-light text-neutral-dark rounded-lg font-semibold hover:bg-neutral-light/80 transition-colors text-sm"
                >
                  Anuluj
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleAcceptAll}
                  className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors text-sm"
                >
                  Akceptuję wszystkie
                </button>
                <button
                  onClick={handleToggleSettings}
                  className="px-6 py-3 border-2 border-primary text-primary rounded-lg font-semibold hover:bg-primary/5 transition-colors text-sm"
                >
                  Ustawienia cookies
                </button>
                <button
                  onClick={handleRejectOptional}
                  className="px-6 py-3 bg-neutral-light text-neutral-dark rounded-lg font-semibold hover:bg-neutral-light/80 transition-colors text-sm"
                >
                  Odrzuć opcjonalne
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
