import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const ebooks = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/ebooks' }), // id = nazwa pliku = products.slug
  schema: ({ image }) => z.object({
    title: z.string(),
    subtitle: z.string(),
    lead: z.string(),
    highlights: z.array(z.string()).min(1),
    cover: image(),
    coverAlt: z.string(),
    gallery: z.array(z.object({ src: image(), alt: z.string() })).default([]),
    seoTitle: z.string(),
    seoDescription: z.string().max(160),
    order: z.number().default(0),
  }),
})

export const collections = { ebooks }
