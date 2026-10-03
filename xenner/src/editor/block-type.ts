import type { EditorBlockType } from "../types/editor";

/**
 * Qué tipo de bloque hay activo en una selección, y por qué.
 *
 * Existe por un bug real: el tipo de texto solo se podía cambiar con el cursor
 * en una línea, nunca con un texto seleccionado encima. Los comandos de Tiptap
 * (`setBlockType` y compañía) saben aplicar el cambio a todos los bloques que
 * toca la selección, así que el problema no era el cambio: era que no había
 * forma de pedirlo desde el texto seleccionado, y que al pedirlo desde el dock
 * la selección se perdía por el camino.
 *
 * Para poner de relieve qué botón está pulsado hace falta saber qué tipo tiene
 * cada bloque, y eso es lo que hay aquí. Los nombres de nodo son los del esquema
 * de Tiptap —`bulletList`, `orderedList`—; no se comparan objetos del esquema
 * porque este módulo se importa también fuera del navegador.
 */

/** Lo mínimo de `ResolvedPos` que hace falta para leer los ancestros. */
export interface BlockAncestor {
  type: { name: string };
  attrs?: Record<string, unknown> | null;
}

/** Lo mínimo de `ResolvedPos`: sus ancestros y su bloque de texto. */
export interface BlockPosition {
  depth: number;
  parent: BlockAncestor;
  node(depth: number): BlockAncestor;
}

/** Lo mínimo de un nodo del documento que se puede visitar con `nodesBetween`. */
export interface BlockTextNode {
  isTextblock?: boolean;
}

/** Lo mínimo de `Node` que se necesita para visitar un rango del documento. */
export interface BlockDocument {
  resolve(pos: number): BlockPosition;
  nodesBetween(
    from: number,
    to: number,
    visit: (node: BlockTextNode, pos: number) => boolean | void,
  ): void;
}

/**
 * El tipo de bloque del texto que hay en `$pos`.
 *
 * Se mira de fuera hacia dentro, no al revés: una cita es un `blockquote` con
 * un párrafo dentro, así que el padre inmediato de un texto citado es un
 * `paragraph`. Por eso `parent` solo sirve cuando no hay lista ni cita alrededor,
 * que es el caso de un título suelto.
 */
export function blockTypeAt($pos: BlockPosition): EditorBlockType {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const name = node.type.name;
    if (name === "blockquote") return "quote";
    // Una lista de tareas es una lista de viñetas con otra forma: su contenedor
    // cuelga igual de la lista, así que el botón que se marca es el de lista y
    // no hay un botón aparte para las tareas.
    if (name === "bulletList" || name === "taskList") return "bullet";
    if (name === "orderedList") return "ordered";
    if (name === "heading") return headingType(node.attrs?.level);
  }
  const parentName = $pos.parent?.type.name;
  if (parentName === "heading") return headingType($pos.parent.attrs?.level);
  return "paragraph";
}

/**
 * Todos los tipos de bloque que toca la selección.
 *
 * Con el cursor suelto devuelve el del bloque que lo contiene, que es lo que
 * espera cualquiera que mira los botones antes de escribir. Con texto
 * seleccionado devuelve los de todos los bloques de la selección: si no
 * coinciden, el conjunto tiene más de un elemento y ningún botón se marca,
 * porque no hay un único tipo que poner.
 */
export function blockTypesInSelection(
  doc: BlockDocument,
  from: number,
  to: number,
): Set<EditorBlockType> {
  const types = new Set<EditorBlockType>();
  doc.nodesBetween(from, to, (node, pos) => {
    // `nodesBetween` también pasa por los contenedores: una `bulletList` con
    // sus dos `listItem` son tres visitas, y solo la del párrafo de dentro
    // dice qué hay escrito. Sin este filtro un elemento suelto de una lista se
    // contaría también como texto suelto.
    if (node?.isTextblock !== true) return undefined;
    // **`pos + 1`, y no `pos`.** `nodesBetween` entrega la posición *antes* del
    // nodo, y resolver ahí cae en el bloque **anterior**: con el cursor dentro de
    // un `##` se leía «Texto» y el botón de título no se marcaba. Una posición
    // más es el interior del bloque, que es lo que hay que preguntar.
    types.add(blockTypeAt(doc.resolve(pos + 1)));
    return undefined;
  });
  if (!types.size && from === to) {
    // Aquí no hace falta el desplazamiento: `from` es ya la posición del cursor,
    // y sí está dentro de su bloque.
    types.add(blockTypeAt(doc.resolve(from)));
  }
  return types;
}

/**
 * Un `h4`, `h5` o `h6` se enseña como el `Título 3` más cercano: en el menú y
 * en la barra flotante no hay un botón por cada nivel, y los títulos de 4 a 6 se
 * crean con el menú slash. Marcar el nivel cercano deja claro que la línea es
 * un título sin inventar un botón que no existe.
 */
function headingType(level: unknown): EditorBlockType {
  const value = typeof level === "number" && Number.isFinite(level) ? level : 1;
  if (value <= 1) return "heading1";
  if (value === 2) return "heading2";
  return "heading3";
}