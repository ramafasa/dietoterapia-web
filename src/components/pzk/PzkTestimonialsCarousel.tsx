import { useRef, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import type { ImageMetadata } from 'astro';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/pagination';

interface Testimonial {
  src: ImageMetadata;
  alt: string;
}

interface PzkTestimonialsCarouselProps {
  testimonials: Testimonial[];
}

export function PzkTestimonialsCarousel({ testimonials }: PzkTestimonialsCarouselProps) {
  const swiperRef = useRef<SwiperType | null>(null);
  const [isBeginning, setIsBeginning] = useState(true);
  const [isEnd, setIsEnd] = useState(false);

  const handlePrev = () => {
    swiperRef.current?.slidePrev();
  };

  const handleNext = () => {
    swiperRef.current?.slideNext();
  };

  return (
    <div className="testimonials-carousel-wrapper">
      <div className="relative max-w-[49%] mx-auto">
        {/* Custom Navigation Buttons */}
        <button
          onClick={handlePrev}
          className={`custom-nav-btn custom-nav-prev ${isBeginning ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={isBeginning}
          aria-label="Previous testimonial"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          onClick={handleNext}
          className={`custom-nav-btn custom-nav-next ${isEnd ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={isEnd}
          aria-label="Next testimonial"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <Swiper
          modules={[Pagination]}
          spaceBetween={30}
          slidesPerView={1}
          pagination={{
            clickable: true,
            dynamicBullets: true,
          }}
          loop={true}
          keyboard={{ enabled: true }}
          grabCursor={true}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
            setIsBeginning(swiper.isBeginning);
            setIsEnd(swiper.isEnd);
          }}
          onSlideChange={(swiper) => {
            setIsBeginning(swiper.isBeginning);
            setIsEnd(swiper.isEnd);
          }}
          className="testimonials-swiper"
        >
          {testimonials.map((testimonial, index) => (
            <SwiperSlide key={index}>
              <figure className="testimonial-slide">
                <div className="relative overflow-hidden rounded-xl shadow-soft-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
                  <img
                    src={testimonial.src.src}
                    alt={testimonial.alt}
                    loading="lazy"
                    className="w-full h-auto"
                  />
                </div>
              </figure>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      <style>{`
        .testimonials-carousel-wrapper {
          position: relative;
          width: 100%;
          padding: 2rem 0;
        }

        .testimonials-swiper {
          padding-bottom: 3rem;
        }

        /* Custom Navigation Buttons */
        .custom-nav-btn {
          position: absolute;
          top: 20%;
          z-index: 10;
          width: 44px;
          height: 44px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4A7C59;
          border: none;
          cursor: pointer;
        }

        .custom-nav-btn:hover:not(:disabled) {
          background: #4A7C59;
          color: white;
          transform: scale(1.1);
        }

        .custom-nav-btn:disabled {
          pointer-events: none;
        }

        .custom-nav-prev {
          left: -60px;
        }

        .custom-nav-next {
          right: -60px;
        }

        /* Pagination dots */
        .testimonials-swiper :global(.swiper-pagination) {
          bottom: 0;
        }

        .testimonials-swiper :global(.swiper-pagination-bullet) {
          width: 10px;
          height: 10px;
          background: #4A7C59;
          opacity: 0.3;
          transition: all 0.3s ease;
        }

        .testimonials-swiper :global(.swiper-pagination-bullet-active) {
          opacity: 1;
          transform: scale(1.2);
        }

        .testimonials-swiper :global(.swiper-pagination-bullet:hover) {
          opacity: 0.6;
        }

        /* Shadow helper */
        .shadow-soft-lg {
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }

        /* Responsive adjustments */
        @media (max-width: 1024px) {
          .custom-nav-prev {
            left: -50px;
          }

          .custom-nav-next {
            right: -50px;
          }
        }

        @media (max-width: 768px) {
          .testimonials-carousel-wrapper {
            padding: 1rem 0;
          }

          .custom-nav-btn {
            width: 36px;
            height: 36px;
            top: 15%;
          }

          .custom-nav-btn svg {
            width: 20px;
            height: 20px;
          }

          .custom-nav-prev {
            left: -40px;
          }

          .custom-nav-next {
            right: -40px;
          }

          .testimonials-carousel-wrapper > div {
            max-width: 63% !important;
          }
        }
      `}</style>
    </div>
  );
}
