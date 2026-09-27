/**
 * Qué parte de la página se está leyendo.
 *
 * Es la parte del resaltado que se puede equivocar sin que se note, así que
 * vive aquí, aparte y sin DOM, para poder comprobarlo. El resto —el
 * observador, el cajón, los clics— sí necesita la página y va en el layout.
 *
 * Se recorren los hijos del contenido en orden, recordando el último
 * encabezado con identificador. Dos reglas:
 *
 *  - Un `<h2>` abre sección, y un `<h3>` es un apartado dentro de ella.
 *  - Todo lo que va entre un encabezado y el siguiente pertenece a ese
 *    encabezado, incluidos los `<h3>`: quien está leyendo un apartado
 *    quiere ver ese apartado destacado, no el de su madre.
 *
 * Por eso hace falta el orden del documento y no un `querySelectorAll`: solo
 * así se sabe qué va después de qué.
 */

export interface Heading {
  tag: string;
  id: string;
}

export interface SectionMap {
  /** Bloque de la página (cualquier elemento) → el encabezado que lo gobierna. */
  of: Map<Element, string>;
  /** Apartado (`<h3>`) → sección (`<h2>`) que lo contiene. */
  parentOf: Map<string, string>;
  /** Secciones en orden de aparición, sin duplicados. */
  sections: string[];
  /** Todos los encabezados con identificador, en orden. */
  headings: string[];
}

/**
 * Si un elemento cuenta como encabezado con identificador.
 *
 * Se comprueba la forma en vez de usar `instanceof HTMLElement` a propósito:
 * `instanceof` necesita el DOM, y sin DOM esta función no se podría probar —
 * que es justo lo que hay que garantizar aquí—. Además duck-typing aguanta
 * elementos de otro documento, que `instanceof` no.
 */
export function isHeading(node: Element): node is HTMLElement & { id: string } {
  const { tagName, id } = node as Element;
  return typeof tagName === 'string' && /^H[1-6]$/.test(tagName) && typeof id === 'string' && id !== '';
}

export function mapSections(children: Iterable<Element>): SectionMap {
  const of = new Map<Element, string>();
  const parentOf = new Map<string, string>();
  const sections: string[] = [];
  const headings: string[] = [];

  let current: string | null = null;
  let section: string | null = null;

  for (const el of children) {
    if (isHeading(el)) {
      if (el.tagName === 'H2') {
        section = el.id;
        if (!sections.includes(el.id)) sections.push(el.id);
      } else if (section) {
        parentOf.set(el.id, section);
      }
      current = el.id;
      of.set(el, el.id);
      headings.push(el.id);
      continue;
    }
    // Lo que queda antes del primer encabezado no pertenece a nada, y así se
    // queda: sin sección no hay nada que resaltar al abrir la página.
    if (current) of.set(el, current);
  }

  return { of, parentOf, sections, headings };
}
