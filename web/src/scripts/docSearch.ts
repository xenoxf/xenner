/**
 * Buscador de la documentación: el índice y la consulta.
 *
 * Son las funciones puras: ni el DOM ni el reloj están aquí, así que se pueden
 * probar con `node --test` —que es lo que hace `docSearch.test.ts`—. Dibujar los
 * resultados vive en el script de `DocsLayout.astro`, que sí necesita la página.
 *
 * Busca **por título**, en las ocho páginas y en sus cuarenta y un apartados, y
 * devuelve la ruta a la que hay que ir. Es lo que hace falta cuando la duda es
 * «¿en qué página está esto?» y no se recuerda: buscar «data-x» tiene que
 * llevar a la página de CSS y no a la primera que menciona la palabra.
 */

export interface DocEntry {
  /** Lo que se busca y lo que se muestra: el título de la página o del apartado. */
  label: string;
  /** El contexto: «La documentación» en una página, el nombre del padre en un apartado. */
  group: string;
  /** A dónde lleva: `/doc/css/` o `/doc/css/#empezar`. */
  href: string;
  /** Texto extra donde también se busca, como la entradilla de la página. */
  detail?: string;
}

export interface DocHit extends DocEntry {
  /** Mayor es mejor. Solo se usa para ordenar. */
  score: number;
}

/**
 * Marcas combinantes: se borran al comparar para que «color» encuentre
 * «color» y «códigos» encuentre «códigos» sin depender de que la persona
 * pulse la tecla de acento.
 */
const COMBINANTE = /[\p{Mn}\p{Mc}\p{Me}]/u;

/**
 * Plegar un texto para compararlo, **conservando la posición de cada letra**.
 *
 * Se pliega carácter a carácter en vez de normalizar el texto entero: `NFD` y
 * las minúsculas cambian la longitud, así que un índice calculado sobre el
 * texto normalizado dejaría de corresponder con el original.
 *
 * Hay que descomponer antes (`NFD`): «á» puede llegar como un solo carácter
 * (U+00E1) o como «a» seguido del acento. Sin descomponer, la forma
 * precompuesta seguiría llevando su tilde y no casaría con una consulta sin ella.
 */
export function plegar(original: string): string {
  let text = '';
  for (const letra of original) {
    for (const c of letra.normalize('NFD')) {
      if (!COMBINANTE.test(c)) text += c.toLowerCase();
    }
  }
  return text;
}

/**
 * Consultar el índice.
 *
 * Todos los términos tienen que aparecer, en el título, en el grupo o en el
 * texto: se busca «bor» y «boton», y casi todo el sitio contiene «bor», así que
 * un «o» implícito llenaría la lista de ruido. Y puntúa más lo que está en el
 * título que lo que está de paso en la entradilla, porque quien busca
 * «iconos» quiere la página de los iconos.
 */
export function buscar(
  entradas: readonly DocEntry[],
  consulta: string,
  limit = 8,
): DocHit[] {
  const terminos = plegar(consulta).split(/\s+/).filter(Boolean);
  if (terminos.length === 0) return [];

  const encontrados: DocHit[] = [];

  for (const entrada of entradas) {
    const titulo = plegar(entrada.label);
    const grupo = plegar(entrada.group);
    const detalle = plegar(entrada.detail ?? '');

    let score = 0;
    let casaElTitulo = false;

    for (const termino of terminos) {
      const enTitulo = titulo.indexOf(termino);
      const enGrupo = grupo.indexOf(termino);
      const enDetalle = detalle.indexOf(termino);

      if (enTitulo < 0 && enGrupo < 0 && enDetalle < 0) {
        score = 0;
        break;
      }

      if (enTitulo === 0) score += 120;
      else if (enTitulo > 0) score += 70;
      if (enTitulo >= 0) casaElTitulo = true;

      if (enGrupo >= 0) score += 30;
      if (enDetalle >= 0) {
        // Salir muchas veces dice algo: esa página va de eso.
        score += 12 + Math.min(12, (detalle.split(termino).length - 1) * 2);
      }
    }

    if (score <= 0) continue;

    // Un título que casa siempre es mejor noticia que una mención de paso.
    if (casaElTitulo) score += 20;

    encontrados.push({ ...entrada, score });
  }

  encontrados.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'es'));
  return encontrados.slice(0, limit);
}
