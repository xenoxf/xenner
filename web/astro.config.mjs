// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// URL pública final, con https:// y sin slash final. Fija: es lo que Google
// necesita para canonical, sitemap y la línea Sitemap de robots.txt.
const site = 'https://xenner.xenooxf.me';

export default defineConfig({
  site,
  output: 'static',
  // Sin isla hidratada: la página es HTML y CSS. La maqueta de la app y el
  // interruptor claro/oscuro son CSS puro, así que no hace falta React.
  integrations: [sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
