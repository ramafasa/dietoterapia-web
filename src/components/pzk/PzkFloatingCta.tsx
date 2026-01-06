/**
 * PZK Floating CTA Button
 *
 * Floating action button that appears after scrolling down.
 * Shows "Dołącz do programu" and scrolls to modules section.
 */

import { useState, useEffect } from 'react'

interface Props {
  label: string
  href: string
  showAfterScroll?: number // px to scroll before showing
}

export default function PzkFloatingCta({ label, href, showAfterScroll = 300 }: Props) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > showAfterScroll
      setIsVisible(scrolled)
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll() // Check initial position

    return () => window.removeEventListener('scroll', handleScroll)
  }, [showAfterScroll])

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const target = document.querySelector(href)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className={`fixed bottom-8 right-8 z-40 inline-flex items-center gap-2 px-6 py-4 bg-accent text-white text-lg font-bold rounded-full shadow-2xl hover:scale-110 transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-32 opacity-0 pointer-events-none'
      }`}
      aria-label={label}
    >
      <svg
        className="w-5 h-5 animate-bounce"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </a>
  )
}
