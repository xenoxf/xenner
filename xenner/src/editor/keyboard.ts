import { Extension } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { keydownHandler } from "@tiptap/pm/keymap";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Command, EditorState, Transaction } from "@tiptap/pm/state";

import type { EditorBlockType } from "../types/editor.ts";
import { setBlockType } from "./commands.ts";
import type { ReportFailure } from "./commands.ts";

/**
 * Los atajos que hacen falta para escribir sin soltar el teclado.
 *
 * El editor tiene que leerse como se escribe: poner un título, una lista o una cita
 * sin apartar la mano del teclado. Con solo `Ctrl+B/I/U` hay que buscar el botón en
 * la barra en cada línea de estructura, y eso es justo lo que hace que un editor se
 * sienta lento.
 *
 * Por eso **todos** van por los comandos de `commands.ts`: los mismos que usa
 * el menú. Un atajo que aplicase el tipo de bloque de otra manera que el botón
 * dejaría dos verdades distintas en la misma nota —«aquí el título envuelve, allá
 * no»—, y la que manda es la del botón, porque esa está probada.
 *
 * `Mod` es ⌘ en Mac y Ctrl en el resto, y eso lo decide `prosemirror-keymap`
 * según la plataforma donde se esté ejecutando: aquí no se mira
 * `navigator.platform` ni se escribe un atajo por sistema, porque un teclado
 * español y uno inglés pulsan las mismas teclas.
 *
 * **El mapa se construye con `addProseMirrorPlugins` y no con
 * `addKeyboardShortcuts`.** No por gusto: un atajo de Tiptap solo recibe
 * `{ editor }`, y desde aquí solo hay estado y una transacción, que es lo
 * único que necesitan los comandos de este motor. Con un `handleKeyDown` propio
 * cada atajo es un comando de ProseMirror —`(estado, despachar) => boolean`— y
 * eso es justo lo que se puede ejecutar en un test de Node y mirar qué
 * transacción sale. La otra forma sería probar que se llama a la función
 * correcta, que ya no dice nada de lo que le pasa a la nota.
 */

/** Un atajo: si devuelve `true`, se ha ocupado de la tecla. */
type Atajo = (estado: EditorState, despachar: (tr: Transaction) => void) => boolean;

/** Un atajo y lo que hace, para que la interfaz pueda enseñarlo. */
export interface EditorAtajo {
  /** La combinación, tal y como la entiende `prosemirror-keymap`. */
  shortcut: string;
  /** Qué hace, en español. */
  label: string;
}

/** Un atajo del editor y el rótulo con el que se enseña. */
interface AtajoDeBloque {
  shortcut: string;
  label: string;
  /** El atajo en sí, ya con su `report` puesto. */
  crear(report?: ReportFailure): Atajo;
}

/**
 * Los props que necesitan los comandos de `commands.ts`.
 *
 * Tiptap les pasa muchísimos más —`editor`, `view`, `chain`, `can`— y esos
 * comandos no los tocan: solo miran el estado, la transacción y el `dispatch`.
 * Es el mismo trato que les da el arnés de Node por el mismo motivo —lo que hay
 * que comprobar aquí es lo que hace la transacción— y la razón de que estos
 * atajos se puedan probar sin navegador.
 *
 * Sin `dispatch` el comando modifica la transacción pero no la entrega: es lo
 * que permite retocar el documento en más de un paso y mandarlo **una sola
 * vez**, que es como un atajo se deshace con `Mod-z` o no se deshace nunca.
 */
function propsDeComando(
  estado: EditorState,
  despachar?: (tr: Transaction) => void,
): CommandProps {
  return { tr: estado.tr, state: estado, dispatch: despachar } as unknown as CommandProps;
}

/**
 * Un `Command` de ProseMirror a partir de algo que sí despacha.
 *
 * El tipo de ProseMirror permite llamar sin despachador —es su forma de
 * preguntar «¿esto se podría hacer?»—, y aquí no hay a quién preguntar: sin
 * despachador el atajo dice que no sabe hacer nada y **no se come la tecla**, que
 * es lo que distingue un atajo de uno roto.
 */
function conDespachar(accion: Atajo): Command {
  return (estado, despachar) => (despachar ? accion(estado, despachar) : false);
}

/** Los siete tipos de bloque del menú, tal cual los pone su botón. */
function bloqueDe(tipo: EditorBlockType, report?: ReportFailure): Atajo {
  return (estado, despachar) => setBlockType(tipo, report)(propsDeComando(estado, despachar));
}

/**
 * Los bloques de primer nivel que toca una selección.
 *
 * Hace falta para el atajo de los títulos 4 a 6: después de rehacer los bloques
 * hay que saber **cuáles** se rehícieron para no subirle el nivel a los títulos
 * que había por ahí fuera y que nadie ha pedido tocar.
 */
function rangoDeBloques(estado: EditorState): { desde: number; hasta: number } {
  const { $from, $to } = estado.selection;
  // Una selección de nodo o de documento no tiene bloque de primer nivel debajo
  // (`before(1)` lanzaría), así que ahí vale la nota entera.
  return {
    desde: $from.depth >= 1 ? $from.before(1) : 0,
    hasta: $to.depth >= 1 ? $to.after(1) : estado.doc.content.size,
  };
}

/**
 * Si todo lo que toca la selección ya es un título del nivel pedido.
 *
 * Es la misma idea que hay en `setBlockType`: pedir el tipo que ya tiene no es un
 * fallo. Y aquí además evita un despiste caro —bajar un `h4` a `h3` para
 * inmediatamente subirlo a `h4` es un cambio real en el documento, así que sin esta
 * comprobación el atajo dejaría un paso vacío en el historial y `Mod-z` parecería
 * no hacer nada—.
 */
function yaEsTituloDe(doc: Node, desde: number, hasta: number, level: number): boolean {
  let alguno = false;
  doc.nodesBetween(desde, hasta, (nodo) => {
    if (!nodo.isTextblock) return;
    alguno = true;
    if (nodo.type.name !== "heading" || nodo.attrs.level !== level) {
      // No se puede dejar de mirar el resto: el bloque que no sea del tipo pedido
      // es justo el que hay que cambiar.
      throw new NoEsTodoTituloDe(level);
    }
  });
  return alguno;
}

/** Se lanza en cuanto un bloque del rango no es del título pedido. */
class NoEsTodoTituloDe extends Error {
  constructor(level: number) {
    super(`no todo el rango es un título de nivel ${level}`);
    this.name = "NoEsTodoTituloDe";
  }
}

/**
 * Un título de nivel 4, 5 o 6.
 *
 * Los tres primeros niveles son un `EditorBlockType` y van por `setBlockType`,
 * que sustituye el bloque entero y no lo envuelve: «Cita» y luego «Título 2»
 * dejan `## texto`, no `> ## texto`. Estos tres niveles no son un tipo de bloque
 * —son el mismo `heading` con otro `level`—, así que no hay a quién preguntarle.
 *
 * En vez de reimplementar aquí el «sustituye y no envuelve» —que son sesenta
 * líneas ya probadas— se le pide a `setBlockType` un título 3, que sí sabe
 * hacer, y en la **misma transacción** se le corrige el nivel. Importa que sea la
 * misma: con dos transacciones, `Mod-z` deshacería solo el nivel y dejaría un
 * título 3 que nadie ha pedido.
 */
function tituloDeNivel(level: 4 | 5 | 6, report?: ReportFailure): Atajo {
  return (estado, despachar) => {
    const antes = rangoDeBloques(estado);
    if (antes.hasta > antes.desde) {
      try {
        // Si ya está como se pidió, se dice que sí y no se toca nada: sin esto,
        // bajar a título 3 para volver a subir a título 4 sería un paso de
        // historial que no cambia la nota, y `Mod-z` parecería roto.
        if (yaEsTituloDe(estado.doc, antes.desde, antes.hasta, level)) return true;
      } catch (error) {
        if (!(error instanceof NoEsTodoTituloDe)) {
          report?.(`no se pudo poner el título ${level}`, error);
          return false;
        }
        // Es lo normal: hay algo que cambiar, y para eso está `setBlockType`.
      }
    }
    const props = propsDeComando(estado);
    if (!setBlockType("heading3", report)(props)) return false;
    try {
      const { tr } = props;
      const desde = Math.max(0, Math.min(tr.mapping.map(antes.desde, 1), tr.doc.content.size));
      const hasta = Math.max(0, Math.min(tr.mapping.map(antes.hasta, -1), tr.doc.content.size));
      // Se recogen primero y se cambian después: `setNodeMarkup` no mueve nada,
      // pero leer y escribir el mismo documento a la vez es de las cosas que se
      // rompen sin que se note hasta que hay una nota de mil líneas.
      const titulos: { pos: number; attrs: Record<string, unknown> }[] = [];
      if (hasta > desde) {
        tr.doc.nodesBetween(desde, hasta, (nodo, pos) => {
          if (nodo.type.name !== "heading" || nodo.attrs.level !== 3) return;
          titulos.push({ pos, attrs: { ...nodo.attrs, level } });
        });
      }
      for (const titulo of titulos) tr.setNodeMarkup(titulo.pos, null, titulo.attrs);
      // Lo que sale de aquí va a acabar en el Markdown que se guarda: si no es
      // un documento legal, mejor que se pegue el texto tal cual.
      tr.doc.check();
      despachar(tr.scrollIntoView());
      return true;
    } catch (error) {
      report?.(`no se pudo poner el título ${level}`, error);
      return false;
    }
  };
}

/**
 * Una lista de casillas.
 *
 * Las tareas no son un `EditorBlockType` —el menú las inserta con su propio
 * comando—, así que tampoco hay a quién preguntarle. Se hacen como las otras
 * listas: primero se pone una lista de viñetas con `setBlockType`, que es el
 * único camino que sabe rehacer los bloques sin envuelvo ni pérdida de texto, y
 * después cada `bulletList` del rango se cambia por su `taskList` equivalente,
 * con el mismo contenido y sin marcar. Otra vez en una sola transacción.
 */
function listaDeTareas(report?: ReportFailure): Atajo {
  return (estado, despachar) => {
    const antes = rangoDeBloques(estado);
    const props = propsDeComando(estado);
    if (!setBlockType("bullet", report)(props)) return false;
    try {
      const { tr } = props;
      const esquema = estado.schema;
      const lista = esquema.nodes.taskList;
      const tarea = esquema.nodes.taskItem;
      if (!lista || !tarea) throw new Error("El editor no tiene el nodo de lista de tareas");
      const desde = Math.max(0, Math.min(tr.mapping.map(antes.desde, 1), tr.doc.content.size));
      const hasta = Math.max(0, Math.min(tr.mapping.map(antes.hasta, -1), tr.doc.content.size));
      const posiciones: number[] = [];
      if (hasta > desde) {
        tr.doc.nodesBetween(desde, hasta, (nodo, pos) => {
          if (nodo.type.name === "bulletList") posiciones.push(pos);
        });
      }
      for (const pos of posiciones.reverse()) {
        const original = tr.doc.nodeAt(pos);
        if (!original) continue;
        const items = original.content.content.map((item) => {
          const nuevo = tarea.createAndFill({ checked: false }, item.content);
          if (!nuevo) throw new Error("No se pudo crear un elemento de la lista de tareas");
          return nuevo;
        });
        const nueva = lista.createAndFill(null, items);
        if (!nueva) throw new Error("No se pudo crear la lista de tareas");
        tr.replaceWith(pos, pos + original.nodeSize, nueva);
      }
      tr.doc.check();
      // Sin cambios, sin despachar: un atajo que no ha hecho nada tampoco tiene
      // que ensuciar el historial con un paso vacío.
      if (!tr.docChanged) return true;
      despachar(tr.scrollIntoView());
      return true;
    } catch (error) {
      report?.("no se pudo hacer la lista de tareas", error);
      return false;
    }
  };
}

/**
 * Código en línea.
 *
 * Alterna como el botón de la barra: lo pone y lo quita, porque quien lo pulsa
 * dos veces lo que quiere es volver al texto normal y no estar buscándose el
 * botón. Con el cursor suelto no hace nada —no hay texto al que marcar— y
 * devuelve `false`, que es como se dice «esta tecla no era mía» sin comerse el
 * carácter que se iba a escribir.
 */
function codigoEnLinea(report?: ReportFailure): Atajo {
  return (estado, despachar) => {
    const { from, to } = estado.selection;
    if (from === to) return false;
    const marca = estado.schema.marks.code;
    if (!marca) {
      report?.("no se pudo marcar el código", "el editor no tiene la marca de código");
      return false;
    }
    const tr = estado.tr;
    const puesto = estado.doc.rangeHasMark(from, to, marca);
    tr.removeMark(from, to, marca);
    if (!puesto) tr.addMark(from, to, marca.create());
    despachar(tr.scrollIntoView());
    return true;
  };
}

/**
 * Los atajos de bloque, cada uno con su rótulo.
 *
 * Es la lista de la casa: de aquí salen a la vez el mapa de teclas y
 * `EDITOR_SHORTCUTS`, así que un atajo sin rótulo o un rótulo sin atajo no
 * pueden quedarse descolgados.
 */
const ATAJOS_DE_BLOQUE: readonly AtajoDeBloque[] = [
  { shortcut: "Mod-Alt-0", label: "Párrafo normal", crear: (r) => bloqueDe("paragraph", r) },
  { shortcut: "Mod-Alt-1", label: "Título 1", crear: (r) => bloqueDe("heading1", r) },
  { shortcut: "Mod-Alt-2", label: "Título 2", crear: (r) => bloqueDe("heading2", r) },
  { shortcut: "Mod-Alt-3", label: "Título 3", crear: (r) => bloqueDe("heading3", r) },
  { shortcut: "Mod-Alt-4", label: "Título 4", crear: (r) => tituloDeNivel(4, r) },
  { shortcut: "Mod-Alt-5", label: "Título 5", crear: (r) => tituloDeNivel(5, r) },
  { shortcut: "Mod-Alt-6", label: "Título 6", crear: (r) => tituloDeNivel(6, r) },
  { shortcut: "Mod-Shift-7", label: "Lista con viñetas", crear: (r) => bloqueDe("bullet", r) },
  { shortcut: "Mod-Shift-8", label: "Lista numerada", crear: (r) => bloqueDe("ordered", r) },
  { shortcut: "Mod-Shift-9", label: "Lista de tareas", crear: (r) => listaDeTareas(r) },
  { shortcut: "Mod-Shift-.", label: "Cita", crear: (r) => bloqueDe("quote", r) },
  { shortcut: "Mod-Alt-c", label: "Código en línea", crear: (r) => codigoEnLinea(r) },
];

/**
 * Las teclas que este editor **no** vuelve a registrar, y de quién son.
 *
 * No es una lista de deseos: es el contrato de no pisar lo que ya funciona.
 * Los plugins de ProseMirror se prueban en el orden de la lista de extensiones
 * —el último va primero—, así que una tecla que se registra dos veces gana la
 * del final, y la de aquí taparía a la buena. Cada atajo nuevo que se añada
 * tiene que mirar esta lista antes.
 *
 * Deshacer y rehacer están en ella y son los tres que pedía el encargo
 * (`Mod-z`, `Mod-Shift-z`, `Mod-y`): `StarterKit` ya los pone con exactamente ese
 * comportamiento, y volver a registrarlos no daría deshacer a quien no lo tenía,
 * solo una segunda oportunidad de romperlo.
 */
export const TECLAS_DE_OTROS: readonly { shortcut: string; deQuien: string }[] = [
  { shortcut: "Mod-b", deQuien: "StarterKit: negrita" },
  { shortcut: "Mod-i", deQuien: "StarterKit: cursiva" },
  { shortcut: "Mod-u", deQuien: "StarterKit: subrayado" },
  { shortcut: "Mod-z", deQuien: "StarterKit: deshacer" },
  { shortcut: "Mod-Shift-z", deQuien: "StarterKit: rehacer" },
  { shortcut: "Mod-y", deQuien: "StarterKit: rehacer" },
  // En una tabla `Tab` va a la celda siguiente y, cuando ya no hay celda a la que
  // ir, añade una fila; `Shift-Tab` va a la anterior. Y fuera de la tabla, `Tab`
  // sangra el elemento de la lista en el que está. Todo eso lo pone `TableKit` y
  // `StarterKit`, y es mejor que lo que se pueda volver a escribir aquí.
  { shortcut: "Tab", deQuien: "TableKit: celda siguiente, y `StarterKit`: sangrar en la lista" },
  { shortcut: "Shift-Tab", deQuien: "TableKit: celda anterior" },
  { shortcut: "Enter", deQuien: "StarterKit: partir el bloque" },
  { shortcut: "Backspace", deQuien: "StarterKit: borrar y unir" },
  { shortcut: "Mod-Enter", deQuien: "StarterKit: salir del código" },
  { shortcut: "Mod-a", deQuien: "StarterKit: seleccionar la nota" },
];

/**
 * Los rótulos en español, uno por atajo.
 *
 * Los exporta para que la interfaz los enseñe al lado de la tecla: son
 * datos puros, sin editor detrás, y el rótulo de un atajo solo sirve si está
 * escrito en el idioma en el que se está escribiendo la nota.
 */
export const EDITOR_SHORTCUTS: readonly EditorAtajo[] = ATAJOS_DE_BLOQUE.map(
  ({ shortcut, label }) => ({ shortcut, label }),
);

/**
 * El mapa de atajos, como lo resuelve `prosemirror-keymap`.
 *
 * Se exporta para poder probarlo: un atajo es un cambio de documento, y el
 * cambio se mide, no se lee.
 */
export function atajosDeBloque(report?: ReportFailure): Record<string, Command> {
  return Object.fromEntries(
    ATAJOS_DE_BLOQUE.map(({ shortcut, crear }) => [shortcut, conDespachar(crear(report))]),
  );
}

interface KeyboardNoteOptions {
  /** Quién se entera cuando un atajo no se puede aplicar. */
  report?: ReportFailure;
}

/**
 * Los atajos de bloque del editor.
 *
 * Se registra **al final** de la lista de extensiones a propósito: los plugins
 * de ProseMirror se prueban en el orden inverso al de la lista, así que
 * registrarlo aquí es lo que hace que estos atajos ganen a los de `StarterKit`
 * para `Mod-Alt-1` a `Mod-Alt-6`, que también los tenía y como alternancia. Ganar
 * ahí es justo lo que se busca: un título se pone, no se alterna, y se pone
 * igual que lo pone el botón del menú. El resto de teclas —`Mod-b`, `Mod-z`,
 * `Tab`— no se registran (ver `TECLAS_DE_OTROS`), así que ningún atajo de
 * bloque se come una tecla que ya funcionaba.
 */
export const KeyboardNote = Extension.create<KeyboardNoteOptions>({
  name: "noteKeyboard",

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    const report = this.options.report;
    return [
      new Plugin({
        key: new PluginKey("noteKeyboard"),
        props: { handleKeyDown: keydownHandler(atajosDeBloque(report)) },
      }),
    ];
  },
});