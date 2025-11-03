import type { WelcomeHeroProps } from '@/types';

/**
 * WelcomeHero component - hero section with personalized welcome message
 * Displays welcome heading, app description, and weekly obligation reminder
 */
export default function WelcomeHero({ firstName = 'Pacjencie' }: WelcomeHeroProps) {
  return (
    <section className="mb-16">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-neutral-dark mb-6">
          Witaj {firstName} w Monitoringu Wagi!
        </h1>
        <p className="font-body text-lg md:text-xl text-neutral-dark/80 mb-8">
          Dzięki regularnym wpisom wagi pomożemy Ci śledzić postępy i osiągnąć cele zdrowotne.
        </p>
        <div className="inline-flex items-center gap-3 bg-white rounded-lg px-6 py-4 shadow-sm">
          <svg
            className="w-6 h-6 text-primary flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            ></path>
          </svg>
          <p className="font-body text-neutral-dark font-semibold">
            Dodaj wagę minimum raz w tygodniu
          </p>
        </div>
      </div>
    </section>
  );
}
