import { useState } from 'react';
import Pagination from './Pagination';

interface Testimonial {
  id: number;
  name: string;
  text: string;
  context?: string;
  image?: string | null;
}

interface TestimonialsGridProps {
  testimonials: Testimonial[];
}

export default function TestimonialsGrid({ testimonials }: TestimonialsGridProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Calculate which testimonials to show
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTestimonials = testimonials.slice(startIndex, endIndex);

  // Generate initials from name
  const getInitials = (fullName: string): string => {
    const names = fullName.trim().split(' ');
    if (names.length === 0) return '??';
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (testimonials.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="font-body text-lg text-neutral-dark">
          Brak opinii do wyświetlenia
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Grid of testimonials */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {currentTestimonials.map((testimonial) => {
          const initials = getInitials(testimonial.name);

          return (
            <article
              key={testimonial.id}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 p-6 flex flex-col space-y-4"
            >
              {/* Avatar */}
              <div className="flex items-start space-x-4">
                {testimonial.image ? (
                  <img
                    src={testimonial.image}
                    alt={`Zdjęcie ${testimonial.name}`}
                    className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
                    <span className="font-heading text-2xl font-bold">{initials}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="font-heading font-semibold text-lg text-neutral-dark">
                    {testimonial.name}
                  </h3>
                  {testimonial.context && (
                    <p className="font-body text-sm text-primary italic">
                      {testimonial.context}
                    </p>
                  )}
                </div>
              </div>

              {/* Testimonial Text */}
              <blockquote className="font-body text-base text-neutral-dark leading-relaxed">
                &ldquo;{testimonial.text}&rdquo;
              </blockquote>
            </article>
          );
        })}
      </div>

      {/* Pagination */}
      <Pagination
        totalItems={testimonials.length}
        itemsPerPage={itemsPerPage}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
