export default function PatientBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
        <NavButton href="/waga" label="Dashboard" icon="🏠" isActive />
        <NavButton href="/waga/historia" label="Historia" icon="📈" />
        <NavButton href="/konto" label="Ustawienia" icon="⚙️" />
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
      className={`flex flex-col items-center gap-1 text-sm font-semibold transition-colors ${
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

