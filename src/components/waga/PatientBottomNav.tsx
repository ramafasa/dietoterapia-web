import LogoutButton from './LogoutButton';

type PatientBottomNavProps = {
  activePage?: 'dashboard' | 'historia' | 'settings';
};

export default function PatientBottomNav({ activePage = 'dashboard' }: PatientBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
        <NavButton href="/pacjent/waga" label="Dashboard" icon="🏠" isActive={activePage === 'dashboard'} />
        <NavButton href="/pacjent/waga/historia" label="Historia" icon="📈" isActive={activePage === 'historia'} />
        <NavButton href="/konto" label="Ustawienia" icon="⚙️" isActive={activePage === 'settings'} />
        <LogoutButton />
      </div>
    </nav>
  );
}

type NavButtonProps = {
  href: string;
  label: string;
  icon: string;
  isActive?: boolean;
};

function NavButton({ href, label, icon, isActive }: NavButtonProps) {
  return (
    <a
      href={href}
      className={`flex flex-col items-center gap-1 text-sm font-semibold transition-colors rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        isActive ? 'text-primary' : 'text-neutral-dark/70 hover:text-primary'
      }`}
    >
      <span className="text-lg" aria-hidden>
        {icon}
      </span>
      {label}
    </a>
  );
}
