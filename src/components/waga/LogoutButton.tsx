import { useState } from 'react';
import toast from 'react-hot-toast';

export default function LogoutButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 204 || response.status === 401) {
        window.location.href = '/logowanie';
        return;
      }

      let errorMessage = 'Nie udało się wylogować. Spróbuj ponownie.';

      const contentType = response.headers.get('Content-Type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (typeof data?.message === 'string') {
          errorMessage = data.message;
        }
      }

      toast.error(errorMessage, { position: 'top-center' });
    } catch (error) {
      console.error('Logout request failed', error);
      toast.error('Nie udało się wylogować. Spróbuj ponownie.', { position: 'top-center' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={`flex flex-col items-center gap-1 text-sm font-semibold transition-colors rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary text-neutral-dark/70 hover:text-primary ${
        isLoading ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      aria-label="Wyloguj"
      aria-busy={isLoading}
      disabled={isLoading}
    >
      <span className="text-lg" aria-hidden>
        {isLoading ? (
          <svg
            className="h-5 w-5 animate-spin text-primary"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          '🚪'
        )}
      </span>
      <span>Wyloguj</span>
      <span className="sr-only" aria-live="polite">
        {isLoading ? 'Trwa wylogowywanie' : 'Wyloguj'}
      </span>
    </button>
  );
}


