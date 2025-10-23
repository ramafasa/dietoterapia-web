import { useState, useEffect, useCallback } from 'react';
import type { ImageMetadata } from 'astro';

interface Certificate {
  id: number;
  title: string;
  image: ImageMetadata;
  alt: string;
}

interface CertificatesCarouselProps {
  certificates: Certificate[];
}

export default function CertificatesCarousel({ certificates }: CertificatesCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  // Auto-play jest zatrzymany gdy hover LUB ręczna zmiana
  const isPaused = isHovered || isManuallyPaused;

  // Nawigacja - następny slajd
  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % certificates.length);
    setIsManuallyPaused(true); // Zatrzymaj auto-play po ręcznej zmianie
  }, [certificates.length]);

  // Nawigacja - poprzedni slajd
  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + certificates.length) % certificates.length);
    setIsManuallyPaused(true); // Zatrzymaj auto-play po ręcznej zmianie
  }, [certificates.length]);

  // Przejdź do konkretnego slajdu
  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsManuallyPaused(true); // Zatrzymaj auto-play po ręcznej zmianie
  }, []);

  // Auto-play timer
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      // Bezpośrednia aktualizacja bez wywoływania nextSlide (która ustawia isPaused)
      setCurrentIndex((prev) => (prev + 1) % certificates.length);
    }, 5000); // 5 sekund

    return () => clearInterval(interval);
  }, [isPaused, certificates.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        prevSlide();
      } else if (e.key === 'ArrowRight') {
        nextSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide]);

  // Touch handlers dla swipe na mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance) {
      nextSlide();
    } else if (distance < -minSwipeDistance) {
      prevSlide();
    }

    setTouchStart(0);
    setTouchEnd(0);
  };

  const currentCertificate = certificates[currentIndex];

  return (
    <div
      className="relative max-w-6xl mx-auto"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="region"
      aria-label="Karuzela certyfikatów"
      aria-live="polite"
    >
      {/* Main carousel container */}
      <div
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Desktop layout: obrazek po lewej, tytuł po prawej */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-8 items-center min-h-[400px]">
          {/* Obrazek z kontrolkami */}
          <div className="relative group">
            <div className="relative max-w-2xl mx-auto">
              <img
                src={currentCertificate.image.src}
                alt={currentCertificate.alt}
                className="w-full h-auto max-h-[600px] object-contain rounded-lg shadow-soft"
              />

              {/* Strzałki - overlay na obrazku */}
              <button
                onClick={prevSlide}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-neutral-dark p-3 rounded-full shadow-lg transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="Poprzedni certyfikat"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                onClick={nextSlide}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-neutral-dark p-3 rounded-full shadow-lg transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="Następny certyfikat"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tytuł po prawej */}
          <div className="flex items-center justify-center px-8">
            <h3 className="font-heading font-semibold text-2xl md:text-3xl text-neutral-dark text-center">
              {currentCertificate.title}
            </h3>
          </div>
        </div>

        {/* Mobile layout: obrazek na górze, tytuł pod spodem */}
        <div className="lg:hidden space-y-6">
          {/* Obrazek z kontrolkami */}
          <div className="relative group">
            <div className="relative max-w-md mx-auto">
              <img
                src={currentCertificate.image.src}
                alt={currentCertificate.alt}
                className="w-full h-auto max-h-[500px] object-contain rounded-lg shadow-soft"
              />

              {/* Strzałki - overlay na obrazku (mobile) */}
              <button
                onClick={prevSlide}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-neutral-dark p-2 rounded-full shadow-lg transition-all duration-200"
                aria-label="Poprzedni certyfikat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                onClick={nextSlide}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-neutral-dark p-2 rounded-full shadow-lg transition-all duration-200"
                aria-label="Następny certyfikat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tytuł pod obrazkiem (mobile) */}
          <div className="px-4">
            <h3 className="font-heading font-semibold text-xl text-neutral-dark text-center">
              {currentCertificate.title}
            </h3>
          </div>
        </div>
      </div>

      {/* Wskaźniki (kropki) - pod karuzelą */}
      <div className="flex justify-center items-center gap-2 mt-8" role="tablist">
        {certificates.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`transition-all duration-300 rounded-full ${
              index === currentIndex
                ? 'w-3 h-3 bg-primary'
                : 'w-2 h-2 bg-neutral-dark/30 hover:bg-neutral-dark/50'
            }`}
            aria-label={`Przejdź do certyfikatu ${index + 1}`}
            aria-selected={index === currentIndex}
            role="tab"
          />
        ))}
      </div>
    </div>
  );
}
