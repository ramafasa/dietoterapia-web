import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap()
  ],
  output: 'server',
  adapter: vercel(),
  site: 'https://paulinamaciak.pl',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  },
  vite: {
    optimizeDeps: {
      exclude: ['@astrojs/react']
    }
  }
});
