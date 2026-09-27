import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { DOC_PAGES, totalApartados, vecinos } from './doc.ts';
import { SKIN_COMPONENT_DOCS } from './skins.ts';

/**
 * El índice y las páginas no pueden desincronizarse.
 *
 * `DOC_PAGES` pinta la barra de la izquierda, la del cajón, el «anterior» y el
 * «siguiente», las tarjetas del final y el buscador. Si una página gana un
 * apartado y el índice no, ese apartado queda inalcanzable desde la navegación:
 * se llega escribiendo la URL a mano. Y al revés: un enlace del índice que no
 * lleva a ningún sitio es peor, porque la gente lo pulsa.
 *
 * Se comprueba en las dos direcciones, y el texto también, porque un `label`
 * desfasado hace que el enlace y el título digan cosas distintas.
 *
 * El índice se lee del código fuente y no de `dist/`, para que el test no
 * necesite una compilación previa y se pueda ejecutar suelto.
 */
const PAGINAS = fileURLToPath(new URL('../pages/doc/', import.meta.url));
const LAYOUT = fileURLToPath(new URL('../layouts/DocsLayout.astro', import.meta.url));

/** El archivo de una página, deducido de su ruta. */
const archivoDe = (path: string): string =>
  path === '/doc/'
    ? `${PAGINAS}index.astro`
    : `${PAGINAS}${path.replace('/doc/', '').replace(/\/$/, '')}.astro`;

/** Los `<h2>` y `<h3>` con identificador de un archivo, en orden. */
function encabezadosDe(fuente: string): { nivel: 2 | 3; id: string; texto: string }[] {
  const ids: { nivel: 2 | 3; id: string; texto: string }[] = [];
  for (const c of fuente.matchAll(/<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const texto = c[3]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      // `seccion()` concatena expresiones; solo se comparan los literales.
      .replace(/' \+ [^+]* \+ '/g, '')
      .trim();
    ids.push({ nivel: Number(c[1]) as 2 | 3, id: c[2], texto });
  }
  return ids;
}

test('cada página del índice tiene su archivo, y cada archivo su entrada', () => {
  for (const page of DOC_PAGES) {
    assert.ok(existsSync(archivoDe(page.path)), `falta el archivo de «${page.path}»`);
  }
  // Y al revés: un archivo suelto en pages/doc/ que no esté en el índice es una
  // página sin barra de navegación, sin anterior y sin siguiente.
  const enElIndice = new Set(DOC_PAGES.map((p) => archivoDe(p.path)));
  for (const nombre of ['index', 'formato', 'claves', 'imagenes', 'css', 'ejemplo', 'problemas', 'limites']) {
    assert.ok(enElIndice.has(`${PAGINAS}${nombre}.astro`), `${nombre}.astro no está en DOC_PAGES`);
  }
  assert.equal(DOC_PAGES.length, 8, 'la documentación debería seguir siendo de ocho páginas');
});

test('el índice tiene lo mismo que los encabezados de cada página', () => {
  for (const page of DOC_PAGES) {
    const ids = encabezadosDe(readFileSync(archivoDe(page.path), 'utf-8'));
    assert.ok(ids.length > 0, `no se ha encontrado ningún encabezado en ${page.path}`);

    // 1. Los <h2> de la página son las secciones del índice, y en el mismo orden.
    const h2DeLaPagina = ids.filter((h) => h.nivel === 2).map((h) => h.id);
    assert.deepEqual(
      page.sections.map((s) => s.id),
      h2DeLaPagina,
      `las secciones de «${page.path}» y sus <h2> no coinciden, o no están en el mismo orden`,
    );

    // 2. Cada <h3> está en el índice, dentro de la sección que lo precede.
    const propias: Record<string, string[]> = {};
    let seccion: string | null = null;
    for (const h of ids) {
      if (h.nivel === 2) {
        seccion = h.id;
        propias[h.id] = [];
        continue;
      }
      if (seccion) propias[seccion].push(h.id);
    }
    for (const s of page.sections) {
      for (const h3 of propias[s.id] ?? []) {
        // Los `componente-*` los pinta `seccion()` desde `data/skins.ts` y no
        // están escritos aquí como encabezados literales.
        if (h3.startsWith('componente-')) continue;
        assert.ok(
          (s.subs ?? []).some((sub) => sub.id === h3),
          `el apartado «${h3}» no está en el índice de «${s.id}» (página ${page.path})`,
        );
      }
    }

    // 3. Y al revés: ningún enlace del índice apunta a la nada.
    const existentes = new Set(ids.map((h) => h.id));
    for (const s of page.sections) {
      assert.ok(existentes.has(s.id), `«${s.id}» no tiene encabezado en ${page.path}`);
      for (const sub of s.subs ?? []) {
        assert.ok(
          existentes.has(sub.id) || sub.id.startsWith('componente-'),
          `«${sub.id}» no tiene encabezado en ${page.path}`,
        );
      }
    }
  }
});

test('el texto de la barra es el texto del encabezado', () => {
  for (const page of DOC_PAGES) {
    const fuente = readFileSync(archivoDe(page.path), 'utf-8');
    for (const s of page.sections) {
      const patron = new RegExp(`<h2 id="${s.id}"[^>]*>([\\s\\S]*?)</h2>`);
      const encontrado = patron.exec(fuente);
      assert.ok(encontrado, `no se encuentra el <h2> de «${s.id}»`);
      const texto = encontrado[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      assert.equal(texto, s.label, `la barra dice «${s.label}» y el encabezado dice «${texto}»`);

      for (const sub of s.subs ?? []) {
        if (sub.id.startsWith('componente-')) continue;
        const p = new RegExp(`<h3 id="${sub.id}"[^>]*>([\\s\\S]*?)</h3>`);
        const h3 = p.exec(fuente);
        assert.ok(h3, `no se encuentra el <h3> de «${sub.id}» en ${page.path}`);
        const t3 = h3[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        assert.equal(t3, sub.label, `la barra dice «${sub.label}» y el encabezado dice «${t3}»`);
      }
    }
  }
});

test('los apartados de cada componente salen de la misma lista que la app', () => {
  // Los `componente-*` no están escritos en el archivo: los genera la página de
  // las claves recorriendo `data/skins.ts`. Si allí se añade un archivo, aquí
  // tiene que salir su apartado, en el mismo orden.
  const esperado = SKIN_COMPONENT_DOCS.map((d) => `componente-${d.file.replace('.txt', '')}`);
  const enElIndice = DOC_PAGES.find((p) => p.path === '/doc/claves/')!
    .sections.flatMap((s) => (s.subs ?? []).map((sub) => sub.id))
    .filter((id) => id.startsWith('componente-'));
  assert.deepEqual(enElIndice, esperado);
});

test('los identificadores del índice son únicos en toda la documentación', () => {
  const vistos = new Set<string>();
  const repetidos: string[] = [];
  for (const page of DOC_PAGES) {
    for (const id of [page.path, ...page.sections.flatMap((s) => [s.id, ...(s.subs ?? []).map((x) => x.id)])]) {
      if (vistos.has(id)) repetidos.push(id);
      vistos.add(id);
    }
  }
  assert.deepEqual(repetidos, [], 'hay identificadores repetidos en el índice');
});

test('DOC_PAGES está ordenado como se lee, no alfabéticamente', () => {
  // La documentación es un recorrido. Si alguien lo ordena con un `sort()` creyendo
  // que es un detalle de estilo, quien llegue por el ejemplo se pierde.
  assert.equal(DOC_PAGES[0].path, '/doc/', 'el recorrido debería empezar por la puerta');
  const alfabetico = [...DOC_PAGES].map((p) => p.label).sort();
  const real = DOC_PAGES.map((p) => p.label);
  assert.notDeepEqual(real, alfabetico, 'el índice ha quedado ordenado alfabéticamente');
});

test('el ejemplo viene después de los capítulos que necesita', () => {
  // «Una skin desde cero» presupone que ya se han explicado el formato, los
  // colores, las claves, las imágenes y el CSS.
  const orden = DOC_PAGES.map((p) => p.path);
  const antes = ['/doc/formato/', '/doc/claves/', '/doc/imagenes/', '/doc/css/'];
  const pos = orden.indexOf('/doc/ejemplo/');
  for (const path of antes) {
    assert.ok(orden.indexOf(path) < pos, `«${path}» debería explicarse antes que el ejemplo`);
  }
});

test('el anterior y el siguiente encadenan las ocho páginas sin huecos', () => {
  for (let i = 0; i < DOC_PAGES.length; i++) {
    const { anterior, siguiente } = vecinos(DOC_PAGES[i].path);
    assert.equal(anterior?.path ?? null, DOC_PAGES[i - 1]?.path ?? null, `anterior de ${DOC_PAGES[i].path}`);
    assert.equal(siguiente?.path ?? null, DOC_PAGES[i + 1]?.path ?? null, `siguiente de ${DOC_PAGES[i].path}`);
  }
  assert.equal(vecinos('/doc/').anterior, null, 'la primera página no tiene anterior');
  assert.equal(vecinos('/doc/limites/').siguiente, null, 'la última no tiene siguiente');
});

test('el total de apartados cuadra con la suma', () => {
  const suma = DOC_PAGES.reduce(
    (total, p) => total + p.sections.reduce((sub, s) => sub + (s.subs?.length ?? 0), 0),
    0,
  );
  assert.equal(totalApartados(), suma);
  assert.ok(suma >= 40, `solo hay ${suma} apartados: la barra de la derecha se quedaría corta`);
});

test('cada página tiene su propio título y su propia descripción', () => {
  // Una página por intención de búsqueda, y Google solo puede posicionar una por
  // término: dos páginas con el mismo título compiten entre ellas.
  const titulos = new Set<string>();
  const descripciones = new Set<string>();
  for (const page of DOC_PAGES) {
    assert.ok(!titulos.has(page.title), `«${page.title}» se repite en dos páginas`);
    assert.ok(!descripciones.has(page.description), `hay dos páginas con la misma descripción`);
    titulos.add(page.title);
    descripciones.add(page.description);
    // Los rangos en los que Google no recorta. Medido, no supuesto.
    assert.ok(
      page.title.length >= 40 && page.title.length <= 62,
      `el título de «${page.path}» mide ${page.title.length} caracteres`,
    );
    assert.ok(
      page.description.length >= 120 && page.description.length <= 165,
      `la descripción de «${page.path}» mide ${page.description.length} caracteres`,
    );
    assert.ok(page.label.length <= 22, `«${page.label}» es demasiado largo para la barra`);
  }
});

test('el resaltado tiene los ganchos que necesita, y no se rompe en silencio', () => {
  const layout = readFileSync(LAYOUT, 'utf-8');

  /*
    El script del resaltado no lanza error si le falta un `data-*`: simplemente
    no hace nada y la página queda sin barra que se mueva. Eso no se ve en una
    compilación ni en la consola, así que se comprueba aquí. Si alguien renombra
    un atributo, este test es lo que lo dice.

    `data-doc-content` es el que más fácil se rompe y el que más caro sale: los
    hijos de `<main>` son la cabecera, la prosa y el pie, así que si el script
    los recorre en vez de recorrer la prosa, `mapSections` no encuentra un solo
    encabezado y el resaltado entero no arranca. Ya pasó una vez.
  */
  for (const gancho of [
    'data-doc-main',
    'data-doc-content',
    'data-doc-index',
    'data-doc-rail',
    'data-doc-toc',
    'data-doc-bar',
    'data-here-bar',
    'data-here-num',
    'data-here-label',
    'data-doc-progress',
    'data-finder-input',
    'data-doc-buscar',
  ]) {
    assert.ok(layout.includes(gancho), `falta «${gancho}» en el layout: algo se quedaría parado sin avisar`);
  }

  // Los índices que se encienden: la barra de la derecha y los dos del cajón.
  // Se cuentan solo los `<nav>`, porque el script vuelve a mencionar el atributo
  // al consultarlo.
  const indices = layout.match(/<nav[^>]*\sdata-doc-index/g) ?? [];
  assert.equal(
    indices.length,
    4,
    `se esperaban 4 índices (la de la derecha, y los dos del cajón) y hay ${indices.length}`,
  );
});

test('el cajón de móvil está en el markup, no solo en el script', () => {
  const layout = readFileSync(LAYOUT, 'utf-8');
  // Si el botón para abrirlo desaparece, el cajón queda inalcanzable en móvil
  // y solo se ve hurting en un móvil de verdad.
  for (const trozo of ['data-drawer-open', 'data-drawer', 'aria-modal', 'data-drawer-close']) {
    assert.ok(layout.includes(trozo), `el cajón necesita «${trozo}»`);
  }
  assert.ok(
    layout.includes('aria-controls="doc-drawer"'),
    'el botón tiene que decir qué cajón abre, con aria-controls',
  );
  assert.ok(
    layout.includes('aria-expanded="false"'),
    'el botón tiene que arrancar con aria-expanded="false"',
  );
  // El botón de contenidos tiene que estar ANTES del contenido en el flujo, o en
  // un móvil solo se alcanza al final de la página. Va en una barra fija, así
  // que lo que se comprueba es que la barra existe y es lo primero.
  const barra = layout.indexOf('data-doc-bar');
  const contenido = layout.indexOf('data-doc-content');
  assert.ok(barra > 0 && barra < contenido, 'la barra de lectura tiene que ir antes del contenido');
});

test('el enlace «Saltar al contenido» de la documentación apunta a algo real', () => {
  // `BaseLayout` pone el enlace y el de la documentación es el único que no va a
  // `#contenido`: con el destino equivocado el enlace no hace nada, en silencio.
  const base = readFileSync(
    fileURLToPath(new URL('../layouts/BaseLayout.astro', import.meta.url)),
    'utf-8',
  );
  const layout = readFileSync(LAYOUT, 'utf-8');
  assert.ok(base.includes('skipHref'), 'BaseLayout tiene que aceptar skipHref');
  assert.ok(
    layout.includes('skipHref="#doc-main"'),
    'la documentación tiene que decir a dónde lleva su enlace de salto',
  );
  assert.ok(layout.includes('id="doc-main"'), 'ese destino tiene que existir en la página');
});
