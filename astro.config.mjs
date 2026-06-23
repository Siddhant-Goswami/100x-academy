// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

// Static output, deployed on Cloudflare Pages free tier.
export default defineConfig({
  output: 'static',
  integrations: [
    react(),
    starlight({
      title: '100x Interactive',
      description: 'Browser-first interactive exercises for the 100x curriculum.',
      sidebar: [
        {
          label: 'APIs',
          autogenerate: { directory: 'apis' },
        },
        {
          label: 'Staff',
          items: [{ label: 'Dashboard', link: '/dashboard/' }],
        },
      ],
      customCss: ['./src/styles/exercise.css'],
      // Exercises and dashboards need the browser; disable prefetch races on those.
      components: {},
    }),
  ],
  vite: {
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['pyodide'] },
  },
});
