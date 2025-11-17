interface AvatarProps {
  firstName: string
  lastName: string
  size?: 'sm' | 'md' | 'lg'
  imageUrl?: string // Na przyszłość - zdjęcia profilowe
}

/**
 * Generuje kolor tła na podstawie hash imienia
 * Kolory z design system "Naturalna Harmonia"
 */
function getAvatarColor(name: string): string {
  const colors = [
    'bg-primary',   // Deep green (#4A7C59)
    'bg-secondary', // Peachy (#E8B4A8)
    'bg-accent'     // Golden orange (#F4A460)
  ]

  // Prosty hash z imienia
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

/**
 * Generuje inicjały z imienia i nazwiska
 */
function getInitials(firstName: string, lastName: string): string {
  const firstInitial = firstName?.charAt(0) || ''
  const lastInitial = lastName?.charAt(0) || ''
  return `${firstInitial}${lastInitial}`.toUpperCase()
}

/**
 * Mapowanie rozmiaru na klasy Tailwind
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg'): string {
  const sizes = {
    sm: 'h-8 w-8 text-sm',   // 32px
    md: 'h-10 w-10 text-base', // 40px
    lg: 'h-12 w-12 text-lg'    // 48px
  }
  return sizes[size]
}

/**
 * Avatar komponent - wyświetla inicjały użytkownika na kolorowym tle
 * W przyszłości będzie wspierać zdjęcia profilowe
 */
export default function Avatar({ firstName, lastName, size = 'md', imageUrl }: AvatarProps) {
  const initials = getInitials(firstName, lastName)
  const bgColor = getAvatarColor(firstName + lastName)
  const sizeClasses = getSizeClasses(size)

  // Jeśli jest zdjęcie profilowe - wyświetl je
  if (imageUrl) {
    return (
      <div className={`${sizeClasses} rounded-full overflow-hidden flex-shrink-0`}>
        <img
          src={imageUrl}
          alt={`${firstName} ${lastName}`}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  // Domyślnie - inicjały na kolorowym tle
  return (
    <div
      className={`
        ${sizeClasses}
        ${bgColor}
        rounded-full
        flex
        items-center
        justify-center
        text-white
        font-heading
        font-semibold
        flex-shrink-0
        shadow-sm
      `}
      aria-label={`Avatar ${firstName} ${lastName}`}
    >
      {initials}
    </div>
  )
}
