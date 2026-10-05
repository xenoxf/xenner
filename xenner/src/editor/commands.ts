import { CommandManager } from "@tiptap/core";
import type { Command, CommandProps, Editor } from "@tiptap/core";
import { EditorState, TextSelection, Transaction } from "@tiptap/pm/state";
import type { Selection } from "@tiptap/pm/state";
import type { Fragment, MarkType, Node, NodeType, ResolvedPos, Schema } from "@tiptap/pm/model";

import type { DrawingTool } from "../types/drawing";
import type { EditorBlockType, ImportedEditorAsset } from "../types/editor";
import { normalizeTextColor } from "./extensions/text-color.ts";

/**
 * Lo que el editor **hace** cuando alguien pulsa algo.
 *
 * Va aparte de `menu-content.ts` —qué se le enseña a la persona— y del
 * componente —cómo se monta— porque son tres cosas distintas. Aquí vive todo lo
 * que despacha una transacción sobre el documento.
 *
 * Cada función tiene **dos formas de invocarse**: como comando de Tiptap, con
 * los `props` que da el editor, o contra un `EditorState` de mentira en un
 * test de Node. Por eso no se toca el DOM ni se pide la vista: con `state`, `tr`
 * y `dispatch` basta, y eso es justo lo que permite **ejecutar** estos comandos
 * en vez de leerlos.
 *
 * **Ninguna función traga excepciones.** Devuelven `false` cuando no han podido
 * hacerlo y dejan el documento como estaba. Antes había bloques `catch` sin
 * cuerpo alrededor de casi todo esto, y eso fue justo lo que escondió el fallo
 * más difícil de depurar del editor: una transacción a medio hacer deja la
 * vista a medias, el serializador de Markdown falla sobre ese documento, no se
 * guarda nada y ProseMirror se queda sin poder despachar. Quien escribe se
 * queda con un texto que desaparece y ninguna explicación. Un fallo se informa,
 * no se entierra.
 */

/** Avisa de un fallo sin dejar la vista a medias. */
export type ReportFailure = (what: string, error: unknown) => void;

/**
 * El aviso por defecto: consola y nada más.
 *
 * Quien llama puede pasar su propio aviso —la interfaz enseña un cartel—, pero
 * siempre hay uno: un `false` sin nadie detrás es un botón que no hace nada y
 * del que no se puede saber por qué.
 */
const POR_CONSOLA: ReportFailure = (what, error) => {
  console.error(`xenner: ${what}`, error);
};

/**
 * Corre un comando suelto sobre el editor de verdad, como `editor.commands.x()`.
 *
 * Los comandos de este módulo no se registran en el editor —el registro de
 * extensiones es de otro sitio y no tiene por qué saber de ellos—, así que se
 * ejecutan con los mismos `props` que usa `editor.commands`. La transacción se
 * despacha aquí, y solo si el comando dice que se aplicó y ha cambiado algo: con
 * un `false` el documento se queda como estaba.
 */
export function runCommand(editor: Editor, command: Command): boolean {
  const { view, state } = editor;
  if (view.isDestroyed) return false;
  const tr = state.tr;
  const manager = new CommandManager({ editor, state });
  if (!command(manager.buildProps(tr))) return false;
  if (!tr.docChanged && !tr.selectionSet) return true;
  view.dispatch(tr);
  return true;
}

/**
 * Una transacción aparte sobre el mismo documento, para probar el cambio antes
 * de tocar la del editor.
 *
 * `props.state.tr` no sirve: en una cadena de Tiptap devuelve la transacción que
 * ya se está construyendo, no una nueva. Lo que hace falta es un estado nuevo
 * con el mismo documento y la misma selección, y su transacción.
 */
function transaccionDePrueba(props: CommandProps): Transaction {
  const estado = EditorState.create({
    doc: props.state.doc,
    schema: props.state.schema,
    plugins: [],
  });
  return estado.tr.setSelection(props.state.selection);
}

/**
 * Mete un cambio en la transacción del editor, y solo si el documento que sale
 * es legal.
 *
 * Existe por un detalle de Tiptap que es la diferencia entre «no se ha podido» y
 * «el editor se ha roto»: `editor.commands.x()` **despacha la transacción aunque
 * el comando devuelva `false`**. Un comando que muta y luego se arrepiente deja
 * los pasos puestos a medias, que es exactamente la vista a medias, el Markdown
 * que no serializa y el ProseMirror sin poder despachar de los que habla la nota
 * de este archivo.
 *
 * Por eso el cambio se monta primero en una transacción de prueba: si al terminar
 * el documento no es legal, `doc.check()` lanza y **la transacción del editor
 * sigue intacta**. Solo cuando el resultado es bueno se aplican los mismos pasos
 * por segunda vez, ya sobre la que se despacha.
 */
function conValidacion(props: CommandProps, cambio: (tr: Transaction) => void): void {
  const prueba = transaccionDePrueba(props);
  cambio(prueba);
  prueba.doc.check();
  cambio(props.tr);
}

// ---------------------------------------------------------------------------
// El tipo de bloque: se rehace, no se envuelve
// ---------------------------------------------------------------------------

/**
 * Por qué aquí no se llaman los comandos de bloque de Tiptap.
 *
 * `toggleHeading`, `wrapIn` y compañía **aprietan** el tipo en vez de cambiarlo:
 *
 * - `wrapIn` **mete otro bloque alrededor**. Con el cursor en un texto suelto,
 *   «Cita» y luego «Título 2» dejan `> ## texto`, y con un texto que ya era cita
 *   «Viñetas» deja una lista **dentro** de la cita. Cada elección añade una capa y
 *   no hay forma de quitar ninguna.
 * - `wrapIn` además **falla en silencio** cuando no sabe qué envolver: sobre un
 *   título no hace nada y devuelve `false`, y dentro de un elemento de lista
 *   ningún tipo se aplica. Desde fuera es un botón que no responde.
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
interface CambioDeTipo {
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
 * Todo lo demás —una imagen, una pizarra, un separador, una tabla— **no** se
 * toca: si el bloque tiene algo de esto dentro, el cambio se rechaza y se dice
 * por qué. Un botón que se come una imagen es peor que un botón que no hace
 * nada.
 */
const CONTENEDORES_TRANSPARENTES = new Set([
  "blockquote",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
]);

/** Se lanza cuando el bloque tiene algo dentro que no se puede reconstruir. */
class ContenidoNoTextual extends Error {
  constructor(tipo: string) {
    super(`El bloque es de tipo ${tipo} y no se puede cambiar`);
    this.name = "ContenidoNoTextual";
  }
}

/** Qué hay que hacer para dejar los bloques de la selección del tipo pedido. */
interface PlanDeCambio {
  cambios: CambioDeTipo[];
  /** `true` cuando no hay nada que hacer porque ya está como se pidió. */
  yaEsta: boolean;
}

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
  for (let indice = 0; indice < nodo.childCount; indice += 1) {
    const dentro = hojasDe(nodo.child(indice));
    if (!dentro) return null;
    hojas.push(...dentro);
  }
  return hojas.length > 0 ? hojas : null;
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
 * Para un contenedor hay que mirar todos los bloques del grupo, no solo el
 * primero: seleccionar una lista y un párrafo y pedir «Viñetas» sí tiene trabajo
 * —el párrafo— aunque el primer bloque ya sea una lista. Mirar solo el primero
 * dejaba ese párrafo sin convertir y el botón parecía no hacer nada.
 * Para un bloque suelto hay que mirar sus hojas: un `blockquote` con dos
 * párrafos no es un «Título 2» aunque el primero lo fuera.
 */
function yaEsDelTipo(grupo: Bloque[], tipo: EditorBlockType): boolean {
  if (esContenedor(tipo)) {
    return grupo.every((bloque) => {
      const nombre = bloque.nodo.type.name;
      if (tipo === "quote") return nombre === "blockquote";
      if (tipo === "bullet") return nombre === "bulletList" || nombre === "taskList";
      return nombre === "orderedList";
    });
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
 * ProseMirror nunca había visto —un `listItem` con un `text` suelto dentro— y
 * esos revientan más tarde, al serializar o al editar. `createAndFill` sí
 * valida, así que aquí un nodo mal armado sale como un error con nombre y no
 * como un fallo raro tres capas más abajo.
 */
function crear(
  tipo: NodeType,
  atributos: Record<string, unknown> | null,
  contenido: Fragment | Node | Node[] | null,
): Node {
  const nodo = tipo.createAndFill(atributos, contenido as Node | Node[] | null);
  if (!nodo) throw new Error(`No se pudo construir un bloque de tipo ${tipo.name}`);
  return nodo;
}

/** Un párrafo o un título nuevo con el contenido del que había. */
function construirHoja(esquema: Schema, tipo: EditorBlockType, hoja: Node): Node {
  const contenido = hoja.content;
  if (tipo === "paragraph") return crear(esquema.nodes.paragraph, null, contenido);
  return crear(esquema.nodes.heading, { level: nivelDe(tipo) }, contenido);
}

/** Una lista o una cita nueva con las hojas que había. */
function construirContenedor(esquema: Schema, tipo: EditorBlockType, hojas: Node[]): Node {
  // Dentro de una lista o de una cita lo que se escribe son párrafos: un
  // título dentro de una viñeta no significa nada y solo confunde al Markdown
  // que sale de aquí.
  const parrafos = hojas.map((hoja) => crear(esquema.nodes.paragraph, null, hoja.content));
  if (tipo === "quote") return crear(esquema.nodes.blockquote, null, parrafos);
  const items = parrafos.map((parrafo) => crear(esquema.nodes.listItem, null, parrafo));
  const lista = tipo === "bullet" ? esquema.nodes.bulletList : esquema.nodes.orderedList;
  return crear(lista, null, items);
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
function planearCambioDeTipo(
  esquema: Schema,
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
    if (!hojas) throw new ContenidoNoTextual(nodo.type.name);
    bloques.push({ nodo, desde: offset, hasta: fin, hojas });
  });
  if (!bloques.length) return { cambios: [], yaEsta: false };

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
        nodos: [construirContenedor(esquema, tipo, hojas)],
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
        nodos: bloque.hojas.map((hoja) => construirHoja(esquema, tipo, hoja)),
      });
    }
  }
  return { cambios, yaEsta };
}

/**
 * El rango de texto que de verdad toca la selección.
 *
 * La selección viva manda, y se lleva a texto antes de hacer nada: un cursor en
 * el borde del documento —o el `NodeSelection` que deja pulsar un bloque— tiene
 * un padre que no es un bloque de texto, y con él no hay nada que cambiar.
 * `TextSelection.near` es lo que lo arregla: busca el texto más cercano en lugar
 * de devolver un «aquí no» que desde fuera parece un botón roto.
 */
function rangoDeTexto(state: CommandProps["state"]): { from: number; to: number } {
  const { selection } = state;
  if (selection instanceof TextSelection) {
    if (selection.empty && !selection.$from.parent.isTextblock) {
      const cerca = TextSelection.near(selection.$from, 1);
      return { from: cerca.from, to: cerca.to };
    }
    return { from: selection.from, to: selection.to };
  }
  // `AllSelection` —el `Cmd+A`— también es texto: sus extremos sí son bloques de
  // texto, y el tipo se aplica a la nota entera.
  if (selection.$from.parent.isTextblock || selection.$to.parent.isTextblock) {
    return { from: selection.from, to: selection.to };
  }
  throw new ContenidoNoTextual(selection.constructor.name);
}

/**
 * Cambia el tipo de bloque de lo que está seleccionado.
 *
 * Devuelve `true` cuando los bloques quedan del tipo pedido —incluido el caso de
 * que ya lo estaban, que no es un fallo— y `false` con un aviso cuando no se ha
 * podido. Un `false` siempre llega con su motivo: un botón que no responde sin
 * explicación parece estropeado.
 *
 * @param report Quién se entera del fallo. Sin él va a la consola, nunca al
 * vacío: un fallo que nadie ve es un fallo que se repite.
 */
export const setBlockType =
  (type: EditorBlockType, report: ReportFailure = POR_CONSOLA): Command =>
  (props) => {
    try {
      const { state } = props;
      const rango = rangoDeTexto(state);
      const plan = planearCambioDeTipo(state.schema, state.doc, rango.from, rango.to, type);
      // Ya estaba como se pedía: no hay nada que hacer y no es un fallo.
      if (plan.yaEsta || !plan.cambios.length) return true;
      conValidacion(props, (tr) => {
        // De atrás hacia delante. Cada `replaceWith` cambia el tamaño de lo que hay
        // detrás, y yendo al revés las posiciones de los cambios que faltan siguen
        // valiendo.
        //
        // El contenido va **dentro de un array**, no repartido en varios argumentos:
        // `replaceWith(desde, hasta, nodos)` solo mira el tercero, así que al
        // extender los nodos con `...` se quedaba solo el primero y **todo el texto
        // del bloque se perdía**. Una cita de dos párrafos pasada a «Título 2»
        // salía con un solo título, y con ella se iba la mitad de la nota.
        for (const cambio of [...plan.cambios].reverse()) {
          tr.replaceWith(cambio.desde, cambio.hasta, cambio.nodos);
        }
      });
      props.dispatch?.(props.tr.scrollIntoView());
      return true;
    } catch (error) {
      if (error instanceof ContenidoNoTextual) {
        report("aquí no se puede cambiar el tipo", error.message);
        return false;
      }
      report(`el tipo ${type} no se pudo aplicar`, error);
      return false;
    }
  };

/**
 * Deja el cursor al final de lo que se acaba de retocar, con nada seleccionado.
 *
 * Sin esto la selección se queda puesta y el siguiente carácter sustituye el
 * texto entero: cambiar el tipo y seguir escribiendo —el gesto más natural del
 * mundo— borra lo que se acaba de formatear. El texto se conserva entero; lo
 * que se suelta es la selección, que ya hizo su trabajo.
 *
 * La posición sale de `tr.selection`, **no** de `state.selection`, y esa
 * diferencia era un aviso de error en cada opción de bloque. Este comando va
 * siempre después de otro que ya ha cambiado el documento, y dentro de la misma
 * transacción: `state` es la foto que había antes de eso —Tiptap la crea al abrir
 * el comando y solo la actualiza cuando alguien lee `state.tr`—, así que la
 * selección que salía de ahí apuntaba al documento anterior. `tr.setSelection`
 * exige que apunte al actual y tiraba un `RangeError`, que el `catch` de abajo
 * traducía a «No se pudo aplicar el formato» con el texto ya cambiado en la nota.
 */
export const leaveCaretBehind =
  (report: ReportFailure = POR_CONSOLA): Command =>
  (props) => {
    try {
      // Se calcula antes de tocar nada: si `near` no encuentra un sitio donde
      // escribir, la transacción del editor tiene que quedarse como estaba.
      const final = TextSelection.near(props.tr.selection.$to, 1);
      props.tr.setSelection(final);
      props.dispatch?.(props.tr.scrollIntoView());
      return true;
    } catch (error) {
      report("el cambio se aplicó pero el cursor no se quedó al final", error);
      return false;
    }
  };

// ---------------------------------------------------------------------------
// Lo que se inserta
// ---------------------------------------------------------------------------

/**
 * El punto de texto donde se va a insertar.
 *
 * Insertar desde el dock puede llegar con un bloque **seleccionado** —una imagen
 * marcada con un clic— y sin que el editor tenga el foco, porque el botón está
 * fuera del `contenteditable`. Con un bloque seleccionado no hay cursor de texto
 * al que_insertarse, así que se va al texto más cercano: si no, el bloque caería
 * al final de la nota o el comando no haría nada.
 */
function anclaDeTexto(selection: Selection): ResolvedPos {
  return selection.$from.parent.isTextblock
    ? selection.$from
    : TextSelection.near(selection.$from, 1).$from;
}

/**
 * Un bloque de texto vacío, que es lo que se abre debajo de lo insertado para
 * poder seguir escribiendo sin tabular.
 *
 * `createAndFill` devuelve `null` si el esquema no sabe qué poner, y eso es un
 * fallo que se dice, no un párrafo que se queda sin crear.
 */
function bloqueVacio(esquema: Schema): Node {
  const vacio = esquema.nodes.paragraph.createAndFill();
  if (!vacio) throw new Error("El esquema no tiene un bloque de texto donde escribir");
  return vacio;
}

/**
 * Inserta la tarjeta de un archivo adjunto.
 *
 * Entra como un bloque, no como un enlace dentro de una frase: una tarjeta es un
 * bloque. Va en su propia línea porque es como se lee —si el cursor estaba a
 * media frase, se parte el bloque y la frase queda arriba, la tarjeta en medio y el
 * resto debajo— y con texto seleccionado ese texto se sustituye: adjuntar encima
 * de un texto significa que ese texto era el nombre del archivo.
 *
 * El `size` se guarda porque la tarjeta lo enseña y leerlo del disco en cada pintado
 * sería una llamada al sistema por cada adjunto de la nota cada vez que se
 * repinta. No se serializa: sale en el Markdown como un enlace normal, que es lo
 * que se lee en cualquier otro sitio.
 */
/**
 * El cursor en el primer sitio donde se puede escribir a partir de `pos`.
 *
 * Un bloque —una imagen, un adjunto— no tiene texto dentro, así que la posición que
 * queda justo detrás no es un sitio válido: resolverla da el `doc`, no el párrafo
 * siguiente, y una selección ahí es una selección rara en medio de la nota. Se
 * avanza un paso y se busca el texto más cercano, que es lo único que ProseMirror
 * garantiza.
 */
function textoDespues(tr: Transaction, pos: number): Selection {
  const dentro = Math.max(0, Math.min(pos, tr.doc.content.size));
  const $pos = tr.doc.resolve(dentro);
  if ($pos.parent.isTextblock) return TextSelection.create(tr.doc, dentro);
  return TextSelection.near(tr.doc.resolve(Math.min(dentro + 1, tr.doc.content.size)), 1);
}

export const insertAttachment =
  (
    relativePath: string,
    label: string,
    size?: number,
    report: ReportFailure = POR_CONSOLA,
  ): Command =>
  (props) => {
    const texto = label.trim() || "Archivo";
    try {
      const { state } = props;
      const tipo = state.schema.nodes.noteAttachment;
      if (!tipo) throw new Error("El editor no tiene el nodo de adjunto");
      const nodo = crear(tipo, { href: relativePath, label: texto, size: size ?? null }, null);
      conValidacion(props, (tr) => {
        // Sin un cursor de texto no hay sitio donde insertar: se va al más cercano,
        // sin tocar el bloque que estuviera seleccionado.
        if (!tr.selection.$from.parent.isTextblock) {
          tr.setSelection(TextSelection.near(tr.selection.$from, 1));
        }
        if (!tr.selection.empty) tr.deleteSelection();
        const cursor = tr.selection.$from;
        // Al principio de un bloque de primer nivel la tarjeta entra **encima**, sin
        // partirlo: partir por el principio dejaba un párrafo vacío delante, que en
        // el Markdown son dos líneas en blanco al principio de la nota. Solo a
        // nivel de bloque: dentro de una lista o una cita, `before()` sacaría la
        // tarjeta de donde se está escribiendo.
        const encima = cursor.parentOffset === 0 && cursor.depth === 1 && cursor.parent.content.size > 0;
        let desde: number;
        if (cursor.parent.content.size === 0) {
          // En un párrafo vacío la tarjeta lo sustituye entero: si no, se quedaba
          // una línea en blanco encima del archivo.
          desde = cursor.before();
          tr.replaceWith(desde, cursor.after(), nodo);
        } else if (encima) {
          desde = cursor.before();
          tr.insert(desde, nodo);
        } else {
          // A media frase se parte el bloque, igual que al pulsar Enter: la frase
          // queda arriba, la tarjeta en medio y el resto debajo.
          desde = cursor.pos;
          tr.insert(desde, nodo);
        }
        // El cursor detrás de la tarjeta, en un sitio donde se pueda escribir:
        // seguir escribiendo no puede borrar lo que se acaba de adjuntar.
        tr.setSelection(textoDespues(tr, desde + nodo.nodeSize));
      });
      props.dispatch?.(props.tr.scrollIntoView());
      return true;
    } catch (error) {
      if (error instanceof ContenidoNoTextual) {
        report("aquí no se puede poner el archivo", error.message);
        return false;
      }
      report("no se pudo poner el archivo", error);
      return false;
    }
  };

/**
 * Inserta un bloque —una imagen o una pizarra— junto al bloque del cursor, y
 * deja una línea debajo para poder seguir escribiendo sin tabular.
 *
 * El bloque entra **después** del bloque de primer nivel donde está el cursor, y
 * no en medio de la frase: partir un párrafo para meter una imagen deja media
 * frase debajo de la línea nueva, que no es lo que quiere nadie. Un bloque vacío
 * se sustituye, para no dejar un párrafo en blanco encima.
 *
 * `nombres` son los nombres de nodo que valen, en orden: el editor solo necesita
 * «el sitio donde va esta cosa», y mirar dentro del `try` es lo que hace que un
 * editor al que le falte el nodo avise en vez de reventar en el clic.
 *
 * Sin `scrollIntoView()` a propósito: el bloque recién insertado es alto, y un
 * scroll mínimo desplaza la vista justo cuando se está mirando la línea desde la
 * que se insertó.
 */
function insertBlock(
  props: CommandProps,
  nombres: readonly string[],
  attrs: Record<string, unknown>,
  report: ReportFailure,
): boolean {
  try {
    const { state } = props;
    const tipo = nombres.map((nombre) => state.schema.nodes[nombre]).find(Boolean);
    if (!tipo) throw new Error(`El editor no tiene el nodo ${nombres[0]}`);
    const ancla = anclaDeTexto(state.selection);
    const nodo = crear(tipo, attrs, null);
    const desde = ancla.before(1);
    const hasta = ancla.after(1);
    const bloque = state.doc.nodeAt(desde);
    const linea = bloqueVacio(state.schema);
    conValidacion(props, (tr) => {
      if (bloque?.isTextblock && bloque.content.size === 0) {
        // El párrafo vacío desaparece: en su lugar quedan el bloque y la línea de
        // debajo, que es lo que hay que poder escribir.
        tr.replaceWith(desde, hasta, [nodo, linea]);
        return;
      }
      tr.insert(hasta, [nodo, linea]);
    });
    // Sin `scrollIntoView()` a propósito: el bloque recién insertado es alto, y
    // un scroll mínimo desplaza la vista justo cuando se está mirando la línea
    // desde la que se insertó.
    props.dispatch?.(props.tr);
    return true;
  } catch (error) {
    if (error instanceof ContenidoNoTextual) {
      report("aquí no se puede insertar el bloque", error.message);
      return false;
    }
    report("no se pudo insertar el bloque", error);
    return false;
  }
}

/**
 * Inserta una imagen de bloque y abre una línea debajo.
 *
 * `alt` es el pie de la imagen y es opcional: si el nodo no lo declara, se
 * ignora y no pasa nada.
 */
export const insertImage =
  (asset: ImportedEditorAsset, alt?: string, report: ReportFailure = POR_CONSOLA): Command =>
  (props) => insertBlock(props, ["noteImage", "image"], { src: asset.dataUrl, alt }, report);

/**
 * Inserta una pizarra en blanco y abre una línea debajo.
 *
 * `draft: true` es lo que le dice a la vista que abra el lienzo: una pizarra
 * recién creada no tiene nada que enseñar, así que sin ese atributo se vería un
 * tablero blanco del tamaño de un bloque vacío.
 */
export const insertWhiteboard =
  (
    asset: ImportedEditorAsset,
    drawingId: string,
    tool: DrawingTool,
    report: ReportFailure = POR_CONSOLA,
  ): Command =>
  (props) =>
    insertBlock(
      props,
      ["whiteboard"],
      { src: asset.dataUrl, tool, draft: true, drawingId },
      report,
    );

// ---------------------------------------------------------------------------
// Color y fondo del texto
// ---------------------------------------------------------------------------

/**
 * La marca de color y fondo del texto.
 *
 * Se busca por lo que declara —una marca con atributo `color` y `background`— y
 * no por su nombre, para que este archivo no tenga que saber cómo se llama. Si
 * no hay ninguna, el editor no puede colorear y se dice.
 */
function marcaDeColor(esquema: Schema): MarkType | undefined {
  return Object.values(esquema.marks).find((marca) => {
    const atributos = marca.spec.attrs ?? {};
    return "color" in atributos && "background" in atributos;
  });
}

/**
 * Pone color de texto y/o de fondo a lo seleccionado.
 *
 * Un color a la vez: el otro se lee de lo que ya hay puesto, para no borrarlo al
 * cambiar solo el fondo. Con el cursor suelto no se hace nada y no es un fallo —
 * no hay texto al que colorear—; con un color que no es hexadecimal tampoco: se
 * devuelve `false` sin tocar el documento.
 */
export const setTextStyle =
  (
    target: "color" | "background",
    value: string,
    report: ReportFailure = POR_CONSOLA,
  ): Command =>
  (props) => {
    try {
      const color = normalizeTextColor(value);
      if (!color) return false;
      const { state } = props;
      const { from, to, empty } = state.selection;
      if (empty) return false;
      const marca = marcaDeColor(state.schema);
      if (!marca) throw new Error("El editor no tiene la marca de color de texto");

      // Un color a la vez: el otro se lee de lo ya puesto.
      let actualColor = "";
      let actualFondo = "";
      state.doc.nodesBetween(from, to, (nodo) => {
        if (!nodo.isText) return;
        const puesta = nodo.marks.find((candidata) => candidata.type === marca);
        if (!puesta) return;
        actualColor ||= normalizeTextColor(String(puesta.attrs.color ?? "")) ?? "";
        actualFondo ||= normalizeTextColor(String(puesta.attrs.background ?? "")) ?? "";
      });
      const atributos =
        target === "color"
          ? { color, background: actualFondo }
          : { color: actualColor, background: color };
      conValidacion(props, (tr) => {
        tr.removeMark(from, to, marca);
        if (atributos.color || atributos.background) tr.addMark(from, to, marca.create(atributos));
      });
      props.dispatch?.(props.tr.scrollIntoView());
      return true;
    } catch (error) {
      report("no se pudo aplicar el color", error);
      return false;
    }
  };