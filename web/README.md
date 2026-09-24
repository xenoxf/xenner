# xenner — sitio público

Landing estática de producto construida con Astro 7 y una isla React para la demo interactiva. El sitio no sustituye a la app de escritorio: explica el sistema de skins TXT, sus límites y el estado real de Xenner v0.1.

## Comandos

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm preview
```

La salida estática se genera en `dist/`.

## URL y SEO

Copia `.env.example` a `.env` y configura el dominio final:

```bash
SITE_URL=https://tu-dominio.example
```

- Si `SITE_URL` está definida, Astro genera el sitemap y `robots.txt` enlaza al `sitemap-index.xml`.
- Los canonical y metadatos sociales respetan ese mismo dominio.
- La imagen social se genera desde `public/og-xenner.svg`:

```bash
pnpm assets:og
```

## Arquitectura

- `src/pages/index.astro`: contenido y composición SEO de la landing.
- `src/components/ProductDemo.tsx`: única isla interactiva de React.
- `src/layouts/BaseLayout.astro`: metadatos, canonical, Open Graph y JSON-LD.
- `src/styles/global.css`: tokens y estilos base sin dependencias de fuentes externas.
- `public/`: favicon, manifest e imagen social.

La mayor parte de la página se renderiza como HTML/CSS. React solo se hidrata cuando la demo entra en el viewport.
