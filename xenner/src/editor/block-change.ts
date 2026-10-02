import {
  blockquoteSchema,
  bulletListSchema,
  headingSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
} from "@milkdown/kit/preset/commonmark";
import type { Ctx } from "@milkdown/kit/ctx";
import type { Node, NodeType } from "@milkdown/kit/prose/model";

import type { EditorBlockType } from "../types/editor";

/**
 * Cómo se cambia el tipo de un bloque: se rehace, no se envuelve.
 *
 * ## Por qué existe esto en vez de llamar a los comandos de Milkdown
 *
 * Los comandos que trae Milkdown —`wrapInHeadingCommand`, `wrapInBlockquoteCommand`,
 * `wrapInBulletListCommand`— son de **`setBlockType`** o de **`wrapIn`**, y los dos
 * aprietan el tipo en vez de cambiarlo:
 *
 * - `wrapIn` ** mete otro bloque alrededor. Con el cursor en un texto suelto,
 *   «Cita» y luego «Título 2» dejan `> ## texto`, y con un texto que ya era cita
 *   «Viñetas» deja una lista **dentro** de la cita. Cada elección añade una capa y
 *   no hay forma de quitar ninguna: no existe un comando que deshaga el
 *   envolvimiento.
 * - `wrapIn` además **falla en silencio** cuando no sabe qué envolver. Medido con
 *   el editor de pruebas: «Viñetas» sobre un título no hace nada y devuelve
 *   `false`; dentro de un elemento de lista **ningún** tipo se aplica. Desde fuera
 *   es un botón que no responde, y como el fallo no era una excepción se comía
 *   sin dejar rastro.
 *
 * Aquí no hay comandos: se calcula **qué nodo tiene que haber** donde estaba el
 * que había, y se sustituye. De ahí salen las tres cosas que el menú necesita:
 *
 * 1. **Sustituye, no envuelve.** Poner «Texto» sobre una cita deja un párrafo
 *    suelto, porque el `blockquote` desaparece con el cambio.
 * 2. **Funciona siempre.** No depende de si el bloque sabe o no envolver al
 *    nuevo tipo.
 * 3. **No se pierde ni una letra.** El texto y sus marcas se llevan tal cual, y
 *    los contenedores que se quitan solo se quitan si dentro había texto.
 */

/** Un trozo del documento que hay que cambiar por otro. */
export interface CambioDeTipo {
  desde: number;
  hasta: number;
  /** Lo que va en su lugar. Puede ser más de un nodo. */
  nodos: Node[];
}

/** Un bloque de primer nivel del documento, con lo que hay escrito dentro. */
interface Bloque {
  nodo: Node;
  desde: number;
  hasta: number;
  hojas: Node[];
}

/**
 * Los contenedores que se pueden deshacer sin perder texto.
 *
 * Todo lo demás —una imagen, una pizarra, un separador— **no** se toca: si el
 * bloque tiene algo de esto dentro, el cambio se rechaza y se dice por qué. Un
 * botón que se come una imagen es peor que un botón que no hace nada.
 */
const CONTENEDORES_TRANSPARENTES = new Set([
  "blockquote",
  "bullet_list",
  "ordered_list",
  "list_item",
]);

/** El nivel de `heading` que corresponde a cada título del menú. */
function nivelDe(tipo: EditorBlockType): 1 | 2 | 3 {
  if (tipo === "heading1") return 1;
  if (tipo === "heading2") return 2;
  return 3;
}

/** Si el tipo es un bloque de texto suelto o un contenedor. */
function esContenedor(tipo: EditorBlockType): boolean {
  return tipo === "bullet" || tipo === "ordered" || tipo === "quote";
}

/**
 * Los bloques de texto que hay dentro de un nodo.
 *
 * Baja a través de las listas y las citas porque esos contenedores no tienen
 * texto propio: lo que se ve escrito está en los `paragraph` de dentro. Si el
 * nodo tiene algo que no es texto, devuelve `null` y el cambio se rechaza.
 */
function hojasDe(nodo: Node): Node[] | null {
  if (nodo.isTextblock) return [nodo];
  if (!CONTENEDORES_TRANSPARENTES.has(nodo.type.name)) return null;
  const hojas: Node[] = [];
  // Se recorre por índice y no con `firstChild`/`nextSibling` porque esos
  // `nextSibling` son de los nodos del **DOM**: en un `Node` de ProseMirror no
  // existen, así que el bucle se paraba en el primer hijo y una cita de dos
  // párrafos llegaba al cambio con uno solo. Con uno solo, «Título 2» se comía
  // el segundo párrafo sin dejar rastro.
  for (let indice = 0; indice < nodo.childCount; indice += 1) {
    const dentro = hojasDe(nodo.child(indice));
    if (!dentro) return null;
    hojas.push(...dentro);
  }
  return hojas.length > 0 ? hojas : null;
}

/**
 * Por qué no se puede cambiar el tipo aquí.
 *
 * No es un fallo del usuario ni un error: es un «aquí no». Se distingue del
 * fallo porque el mensaje es otro.
 */
export type MotivoDeNoCambio = "seleccion" | "contenido" | "nada";

/** Qué hay que hacer para dejar los bloques de la selección del tipo pedido. */
export interface PlanDeCambio {
  cambios: CambioDeTipo[];
  motivo: MotivoDeNoCambio;
  /** `true` cuando no hay nada que hacer porque ya está como se pidió. */
  yaEsta: boolean;
}

/**
 * Calcula el cambio de tipo de los bloques que toca la selección.
 *
 * Se trabaja siempre a nivel de **bloque de primer nivel**: una cita son dos
 * niveles, y cambiar el tipo de «una cita» significa quitar el `blockquote`, no
 * añadir otro dentro. Por eso los bloques se agrupan y se reconstruyen enteros.
 *
 * Los bloques que no se tocan se dejan como están, y si hay bloques sin tocar en
 * medio de los que sí —seleccionar el primero y el tercero de tres párrafos— se
 * corta el grupo ahí, porque meterlos dentro del grupo se comería el segundo.
 */
export function planearCambioDeTipo(
  ctx: Ctx,
  doc: Node,
  desde: number,
  hasta: number,
  tipo: EditorBlockType,
): PlanDeCambio {
  const bloques: Bloque[] = [];
  doc.forEach((nodo, offset) => {
    const fin = offset + nodo.nodeSize;
    if (offset >= hasta || fin <= desde) return;
    const hojas = hojasDe(nodo);
    if (!hojas) {
      throw new ContenidoNoTextual(nodo.type.name);
    }
    bloques.push({ nodo, desde: offset, hasta: fin, hojas });
  });

  if (!bloques.length) return { cambios: [], motivo: "nada", yaEsta: false };

  const cambios: CambioDeTipo[] = [];
  let yaEsta = true;
  for (const grupo of agruparContiguos(bloques)) {
    if (yaEsDelTipo(grupo, tipo)) continue;
    yaEsta = false;
    const hojas = grupo.flatMap((bloque) => bloque.hojas);
    if (esContenedor(tipo)) {
      cambios.push({
        desde: grupo[0].desde,
        hasta: grupo[grupo.length - 1].hasta,
        nodos: [construirContenedor(ctx, tipo, hojas)],
      });
      continue;
    }
    // Un bloque suelto: cada bloque del grupo se queda con sus hojas, ya
    // convertidas. Una cita de tres párrafos pasada a «Título 2» son tres
    // títulos, no uno, porque quedaría fuera el texto que no cabe.
    for (const bloque of grupo) {
      cambios.push({
        desde: bloque.desde,
        hasta: bloque.hasta,
        nodos: bloque.hojas.map((hoja) => construirHoja(ctx, tipo, hoja)),
      });
    }
  }
  return { cambios, motivo: "nada", yaEsta };
}

/** Se lanza cuando el bloque tiene algo dentro que no se puede reconstruir. */
export class ContenidoNoTextual extends Error {
  constructor(tipo: string) {
    super(`El bloque es de tipo ${tipo} y no se puede cambiar`);
    this.name = "ContenidoNoTextual";
  }
}

/** Los bloques de la selección, en trozos sin huecos. */
function agruparContiguos(bloques: Bloque[]): Bloque[][] {
  const grupos: Bloque[][] = [];
  let grupo: Bloque[] = [];
  for (const bloque of bloques) {
    const anterior = grupo[grupo.length - 1];
    if (anterior && anterior.hasta === bloque.desde) grupo.push(bloque);
    else {
      if (grupo.length) grupos.push(grupo);
      grupo = [bloque];
    }
  }
  if (grupo.length) grupos.push(grupo);
  return grupos;
}

/**
 * Si un grupo de bloques ya es del tipo pedido.
 *
 * Para un contenedor basta con mirar el bloque de fuera —una cita es una cita—.
 * Para un bloque suelto hay que mirar sus hojas: un `blockquote` con dos
 * párrafos no es un «Título 2» aunque el primero lo fuera.
 */
function yaEsDelTipo(grupo: Bloque[], tipo: EditorBlockType): boolean {
  if (esContenedor(tipo)) {
    const nombre = grupo[0].nodo.type.name;
    if (tipo === "quote") return nombre === "blockquote";
    if (tipo === "bullet") return nombre === "bullet_list";
    return nombre === "ordered_list";
  }
  return grupo.every(
    (bloque) =>
      // El bloque tiene que **ser** el texto, no contenerlo. Un párrafo dentro
      // de una cita es un párrafo, pero el bloque es la cita, así que pedir
      // «Texto» sí tiene trabajo que hacer: quitar la cita.
      bloque.nodo.isTextblock &&
      bloque.hojas.every((hoja) => {
        if (tipo === "paragraph") return hoja.type.name === "paragraph";
        return hoja.type.name === "heading" && hoja.attrs.level === nivelDe(tipo);
      }),
  );
}

/**
 * Crea un nodo y **comprueba que vale**.
 *
 * `NodeType.create` no valida el contenido: deja construir documentos que
 * ProseMirror nunca había visto —un `list_item` con un `text` suelto dentro— y
 * esos revientan más tarde, al serializar o al EDITar. `createAndFill` sí
 * valida, así que aquí un nodo mal armado sale como un error con nombre y no
 * como un fallo raro tres capas más abajo.
 */
function crear(tipo: NodeType, atributos: Record<string, unknown> | null, contenido: Node | Node[]): Node {
  const nodo = tipo.createAndFill(atributos, contenido as never);
  if (!nodo) throw new Error(`No se pudo construir un bloque de tipo ${tipo.name}`);
  return nodo;
}

/** Un párrafo o un título nuevo con el contenido del que había. */
function construirHoja(ctx: Ctx, tipo: EditorBlockType, hoja: Node): Node {
  const contenido = hoja.content;
  if (tipo === "paragraph") return crear(paragraphSchema.type(ctx), null, contenido as never);
  return crear(
    headingSchema.type(ctx),
    { level: nivelDe(tipo), id: "" },
    contenido as never,
  );
}

/** Una lista o una cita nueva con las hojas que había. */
function construirContenedor(ctx: Ctx, tipo: EditorBlockType, hojas: Node[]): Node {
  // Dentro de una lista o de una cita lo que se escribe son párrafos: un
  // título dentro de una viñeta no significa nada y solo confunde al Markdown
  // que sale de aquí.
  const parrafos = hojas.map((hoja) => crear(paragraphSchema.type(ctx), null, hoja.content as never));
  if (tipo === "quote") return crear(blockquoteSchema.type(ctx), null, parrafos);
  const esVineta = tipo === "bullet";
  const items = parrafos.map((parrafo, indice) =>
    crear(
      listItemSchema.type(ctx),
      {
        label: esVineta ? "•" : String(indice + 1),
        listType: esVineta ? "bullet" : "ordered",
        spread: true,
      },
      // El `list_item` guarda **el párrafo**, no su contenido suelto: su tipo de
      // contenido es `paragraph block*`, y un `text` directamente dentro es un
      // documento que ProseMirror no valida al crear pero que luego no serializa.
      parrafo,
    ),
  );
  const lista = esVineta ? bulletListSchema.type(ctx) : orderedListSchema.type(ctx);
  return crear(lista, null, items);
}