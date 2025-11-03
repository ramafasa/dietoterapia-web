import type { OnboardingStep, OnboardingStepsProps } from '@/types';

/**
 * Default onboarding steps data
 */
const DEFAULT_STEPS: OnboardingStep[] = [
  {
    step: 1,
    icon: 'weight-scale',
    title: 'Dodaj wagę',
    description: 'Wprowadź swoją aktualną wagę w kilku sekundach'
  },
  {
    step: 2,
    icon: 'bell',
    title: 'Otrzymuj przypomnienia',
    description: 'Otrzymuj przypomnienia w piątki i niedziele'
  },
  {
    step: 3,
    icon: 'chart',
    title: 'Śledź postępy',
    description: 'Zobacz wykresy i analizę swoich postępów'
  }
];

/**
 * StepCard component - single onboarding step card
 */
function StepCard({ step, icon, title, description }: OnboardingStep) {
  // Map icon names to SVG paths
  const getIconPath = (iconName: string) => {
    switch (iconName) {
      case 'weight-scale':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
          />
        );
      case 'bell':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        );
      case 'chart':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-full font-heading font-bold text-xl mb-4">
        {step}
      </div>
      <svg
        className="w-16 h-16 text-primary mx-auto mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {getIconPath(icon)}
      </svg>
      <h3 className="font-heading text-xl font-semibold text-neutral-dark mb-3">{title}</h3>
      <p className="font-body text-neutral-dark/70">{description}</p>
    </div>
  );
}

/**
 * OnboardingSteps component - displays 3-step guide for app usage
 */
export default function OnboardingSteps({ steps = DEFAULT_STEPS }: OnboardingStepsProps) {
  return (
    <section className="mb-16">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-heading text-3xl font-bold text-neutral-dark text-center mb-12">
          Jak to działa?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((stepData) => (
            <StepCard key={stepData.step} {...stepData} />
          ))}
        </div>
      </div>
    </section>
  );
}
