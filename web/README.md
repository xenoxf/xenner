# xenner — sitio público

Landing estática de producto construida con Astro. El sitio no sustituye a la app
de escritorio: explica qué hace Xenner, cómo guarda tus notas y en qué estado
está.

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

- Si `SITE_URL` está definida, Astro genera el sitemap y `robots.txt` enlaza al
  `sitemap-index.xml`.
- Los canonical y metadatos sociales respetan ese mismo dominio.
- **Sin `SITE_URL` no hay canonical, ni sitemap, ni línea `Sitemap` en
  `robots.txt`.** Es el ajuste más importante del despliegue; por eso el build
  avisa por consola cuando falta.
- La imagen social se genera desde `public/og-xenner.svg`:

```bash
pnpm assets:og
```

### Cómo está montado el SEO

Una página por intención de búsqueda, en `src/pages/`, con la lista en
`src/data/guide.ts`. Cada una declara su `title` y su `description`: son
distintas a propósito, porque compiten por búsquedas distintas y Google solo
puede positionar una por término.

- **Títulos de 50-60 caracteres y descripciones de 140-160.** Medido con el
  script de `pnpm build`; es el rango en el que Google no recorta.
- **Un solo `<h1>` por página**, con la palabra que se busca. La portada lo
  lleva en el título grande; las páginas de la guía, en su `heading`.
- **Enlaces internos**: la cabecera, el pie, la portada y el 404 apuntan a las
  páginas de la guía.
- **Sin `meta keywords`.** Google no las usa: "The meta-keyword tag is not used
  by Google Search, and it has no effect on indexing and ranking at all"
  ([documentación][special-tags]). Las palabras van en el título, en el texto y
  en los datos estructurados.
- **Datos estructurados** en `BaseLayout.astro`: `WebSite`, `WebPage` y
  `SoftwareApplication`. Ojo: para que Google muestre el resultado enriquecido
  de una app **exige una valoración o reseña** ([documentación][software-app])
  y Xenner no tiene ninguna. Se deja el marcado, que es válido, pero no se
  inventan reseñas: hacerlo sería una infracción que puede acabar en acción
  manual.
- **La etiqueta de verificación** de Search Console está en `BaseLayout.astro`:
  es una etiqueta `google-site-verification` en la página de nivel superior. Se
  puede cambiar sin tocar el código con `PUBLIC_GOOGLE_SITE_VERIFICATION`.
- **Sin JavaScript para el SEO.** No hay islas hidratadas: el texto llega en el
  HTML. La animación de entrada solo se oculta si hay un script que la revierta
  (`.js .reveal` en `global.css`).

[special-tags]: https://developers.google.com/search/docs/crawling-indexing/special-tags
[software-app]: https://developers.google.com/search/docs/appearance/structured-data/software-app

### Después de publicar

1. Comprobar el dominio en Search Console con la etiqueta del `head`.
2. Enviar el sitemap: <https://tu-dominio.example/sitemap-index.xml>.
3. Pedir la indexación de la portada con la **URL Inspection**.
4. Tarda días. Google avisa por correo cuando la propiedad esté verificada.

## Las descargas

La portada tiene tres tarjetas —macOS, Windows y Linux— con los instaladores de
la última release publicada en GitHub. Las dos piezas:

- **`src/scripts/releases.ts`**: decide qué archivo va en qué tarjeta. Son
  funciones puras sobre el JSON de la API, con 29 pruebas. La regla importante:
  **la plataforma se decide por extensión, no por el nombre del archivo**. Tauri
  no mete `macos`, `windows` ni `linux` en los nombres que genera
  (`xenner_0.1.0_aarch64.dmg`, `xenner_0.1.0_x64-setup.exe`), así que buscarlos
  ahí no encuentra nada; un `.dmg` solo se abre en macOS y un `.exe` solo en
  Windows.
- **`src/components/Download.astro`**: pinta las tarjetas. El HTML llega siempre
  completo desde el build —sin JS, sin red y sin release se lee igual— y el
  script solo rellena el hueco del botón.

El dato llega por dos caminos, a propósito:

1. **En el build**, `src/data/release.ts` lee `releases/latest` y lo deja escrito
   en el HTML. Las tarjetas se ven al instante.
2. **En el navegador**, el script vuelve a preguntar a GitHub al abrirse la
   página. Esto es lo que hace que publicar una release nueva enseñe los
   instaladores **sin volver a construir la web**.

Si los dos fallan (sin red, API caída, límite de 60 peticiones por hora) la
sección sigue leyéndose: solo faltan los botones, y queda el enlace a
`/instalar/` y a las releases de GitHub.

La lógica se apoya en los nombres que deja `tauri build` para los cuatro
objetivos de `.github/workflows/release.yml`, replicados en
`releases.dom.test.ts`. Si esa matriz cambia, esa comprobación salta antes de que
lo haga una tarjeta vacía en producción.

Los nombres no llevan el sistema dentro, pero tampoco la versión: eso significa
que un `.deb` que no arranca sigue siendo un `.deb` bien formado. La web no puede
saber si el binario funciona en la máquina de quien lo descarga, y por eso la
comprobación de que funcione es del job `verify` de la release, no de aquí.

### La versión vive en cuatro sitios

Cada release hay que subirla en cuatro archivos, y se olvidó uno la primera vez:

| Archivo | Campo |
| --- | --- |
| `xenner/src-tauri/tauri.conf.json` | `version` — la que Tauri usa para nombrar los instaladores |
| `xenner/src-tauri/Cargo.toml` | `package.version` |
| `xenner/src-tauri/Cargo.lock` | `[[package]] version` — se actuala sola con `cargo update -p xenner` |
| `web/src/layouts/BaseLayout.astro` | `softwareVersion` — es lo que Google muestra en el resultado enriquecido |

El orden importa: si se sube la release con la app todavía en `0.1.0`, los
binarios se llaman `xenner_0.1.0_x64-setup.exe` dentro de una release `v1.1.0`.
Funciona —el reparto es por extensión y no por versión— pero el archivo que se
descarga no lleva el número que dice la página.

## Arquitectura

- `src/pages/index.astro`: portada.
- `src/pages/{editor-de-notas,notas-markdown,skins,pizarra,alternativa-notion,instalar}.astro`:
  una página por búsqueda, con el texto en el propio archivo.
- `src/data/guide.ts`: títulos, resúmenes y rutas de esas páginas. La navegación
  se genera desde aquí, así que añadir una página es añadir una entrada.
- `src/layouts/GuideLayout.astro`: cabecera, breadcrumbs, artículo, enlaces a las
  demás páginas y pie.
- `src/pages/doc/*.astro`: la documentación, **ocho páginas** y una por
  capítulo. El texto de cada una va en su propio archivo.
- `src/data/doc.ts`: el índice de esas ocho páginas. De aquí salen la barra de la
  izquierda, la de la derecha, el cajón del móvil, el «anterior» y el
  «siguiente», las tarjetas del final y el índice del buscador. Una página pide
  su ficha con `pagina('/doc/css/')`, que revienta la compilación si la ruta no
  está en la lista.
- `src/layouts/DocsLayout.astro`: la carcasa de la documentación. La izquierda
  lista los capítulos, la derecha los apartados de la página en la que estás.
- `src/styles/doc.css`: estilos del contenido de `/doc`. Van en un archivo aparte
  porque llegan por `<slot>` y el `<style>` del layout no los alcanza.
- `src/data/skins.ts`: las claves de las skins. La página de la referencia se
  pinta desde aquí, no a mano, así que no puede quedarse desfasada de la app.
- `src/data/texto.ts`: escapar y convertir los acentos graves de los datos.
- `src/scripts/docSections.ts`: qué bloque de la página se está leyendo. Puro y
  con pruebas.
- `src/scripts/docSearch.ts`: el índice del buscador y la consulta. Puro y con
  pruebas.
- `src/scripts/docCode.ts`: botón de copiar, coloredor de comentarios y cadenas,
  y envoltorio de las tablas anchas. El coloredor es puro y tiene pruebas.
- `src/scripts/releases.ts`: qué instalador va en qué tarjeta, y cómo se detecta
  el sistema del visitante. Puro y con pruebas.
- `src/data/release.ts`: la última release, leída en el build. Que falle no
  rompe el build.
- `src/components/Download.astro`: las tres tarjetas de descarga y el script que
  las rellena.
- `src/config.ts`: nombre del sitio, URL del repositorio y sus enlaces de
  comunidad, que están vacíos hasta que existan.
- `src/components/AppWindow.astro`: la maqueta de la ventana de la app.
- `src/components/appwindow.css`: sus tokens y el interruptor claro/oscuro.
- `src/layouts/BaseLayout.astro`: metadatos, canonical, Open Graph, JSON-LD y la
  etiqueta de verificación. `skipHref` declara a dónde lleva «Saltar al
  contenido», que es distinto en cada layout.
- `src/styles/global.css`: tokens del sitio, estilos base y la prosa de la guía.
- `public/`: favicon, manifest e imagen social.

## Decisiones

- **Sin framework de interfaz.** No hay islas hidratadas ni JavaScript de
  terceros: el sitio se renderiza entero como HTML y CSS. La maqueta de la app
  y su interruptor claro/oscuro son CSS puro (un checkbox que conmuta tokens).
  Por eso no hay dependencia de React ni integración que lo registre.
- **La maqueta usa los mismos colores que la app.** La paleta base clara vive
  en `xenner/src/styles/global.css`; si cambia ahí, hay que actualizarla en
  `appwindow.css`. Los contrastes están calculados: el gris apagado de la app
  (`#787774`, 4.48:1 sobre blanco) queda por debajo de AA, así que la maqueta
  lo oscurece a `#726f64` (5.03:1).
- **La web es siempre clara.** Se declara `color-scheme: light` y un único
  `theme-color` claro; anunciar soporte de oscuro hacía que la barra del
  navegador se pusiera oscura sobre una página de papel.
- **Papel cálido con acento rojo.** El fondo es un crema `#f7efe6` y el acento
  un rojo de teja `#c2410c`, en vez del azul de la skin de la app. El rojo se
  eligió sobre el naranja habitual en este tipo de sitios porque en ese crema los
  dos se leen igual de bien, y el rojo pega más con el papel y con el nombre. Los
  contrastes están calculados en el comentario de `global.css`.
- **La maqueta de la app conserva su acento azul, a propósito.** Es una captura
  de la app de verdad, con su skin real. Ponerle el rojo del sitio haría que la
  ventana dejara de parecerse a la app y pasara a ser un dibujo.
- **La sección de descarga no depende de la red.** Las tres tarjetas están en el
  HTML del build; JavaScript solo mejora lo que ya se lee. Publicar una release
  nueva se refleja en la web sin reconstruirla, que es lo que hace que
  compilar en cada versión no obligue a desplegar la web cada vez.
- **El contenido describe lo que la app hace hoy.** Si cambia una función,
  cambia la web en el mismo commit.
- **La documentación son ocho páginas, no una.** Era una sola URL de once
  secciones y 36.000 píxeles. Con una URL por capítulo cada página responde a una
  búsqueda, se puede enlazar a un apartado suelto, el navegador no tiene que
  construirla entera y hay un «anterior» y un «siguiente» que atan el recorrido.
  `doc.test.ts` comprueba que el índice y los encabezados de cada página no se
  separan.
- **Lo que se puede arreglar sin JavaScript se arregla en CSS.** El botón de
  copiar, el resaltado de comentarios y el envoltorio de las tablas son
  mejoras de lujo: si el script no llega a ejecutarse, el texto se sigue viendo,
  se sigue copiando a mano y la tabla se sigue desplazando con el dedo. El
  resaltado de la sección que se está leyendo y el buscador sí necesitan JS, y
  por eso viven en un módulo aparte con pruebas, no en el marcado.

### Lo que se midió

- **Las barras laterales no se quedaban pegadas.** La rejilla llevaba
  `align-items: start`, así que cada barra era tan alta como su contenido y
  `position: sticky` no tenía recorrido: se iban con la página. Con
  `stretch` se estiran a la fila y vuelven a quedarse.
- **El resaltado de sección no arrancaba.** El script recorría los hijos de
  `<main>`, que son la cabecera, la prosa y el pie: ninguno es un encabezado, así
  que el reparto devolvía cero secciones y el script se iba sin hacer nada, sin
  error. Ahora recorre `[data-doc-content]`, y hay un test que lo vigila.
- **En un móvil, el botón de «Contenidos» estaba al final del artículo**, a
  47.000 píxeles de distancia. Ahora la barra de lectura es fija, bajo la
  cabecera, con el botón y el «estás aquí»; su altura se mide y se publica en
  `--doc-bar-h` para que los anclas no queden debajo.
- **El enlace «Saltar al contenido» de `/doc` no iba a ninguna parte**: apuntaba
  a `#contenido`, que solo existe en las páginas de la guía.
- **Las tablas de tres columnas se salían del papel en un móvil.** Con tres
  columnas o menos, cada fila se convierte en una ficha con su etiqueta.

### Lo que se midió

- **La fecha de la release se leía en la zona del visitante.** Se pintaba con
  `toLocaleDateString` sin `timeZone`, así que la 1.1.0, publicada a la 01:26 UTC
  del día 1, se leía como «septiembre de 2026» desde cualquier huso al oeste de
  Greenwich y como «octubre» al este. La fecha de un lanzamiento no puede
  depender de dónde estés: ahora se formatea en UTC, con la razón en el código y
  una prueba que compara contra Honolulu.
- **Los botones de descarga salían con el icono gigante.** Los estilos de los
  elementos que crea el script (`download__btn`, `download__alt*`) estaban en el
  `<style>` del componente, que Astro compila con un atributo `data-astro-cid-*` en
  los selectores. Los nodos que crea `document.createElement` en tiempo de
  ejecución no llevan ese atributo, así que no los alcanzaba ninguna regla: sin
  `min-height`, sin `padding` y con el SVG de la flecha estirado. Se resolvió
  marcando esos selectores como `:global()`. Merece la pena porque el síntoma
  —una flecha gigante— señalaba al DOM y no a los estilos: el elemento que
  estaba mal era el nodo, no el CSS.

**Los botones de descarga salían con el icono gigante.** Los estilos de los
elementos que crea el script (`download__btn`, `download__alt*`) estaban en el
`<style>` del componente, que Astro compila con un atributo `data-astro-cid-*` en
los selectores. Los nodos que crea `document.createElement` en tiempo de ejecución
no llevan ese atributo, así que no los alcanzaba ninguna regla: sin
`min-height`, sin `padding` y con el SVG de la flecha estirado. Se resolvió
marcando esos selectores como `:global()`. Merece la pena porque el síntoma
—un icono de flecha enorme— no señalaba el estilo, sino el DOM.
