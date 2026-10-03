import type { Editor } from "@tiptap/core";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import {
  EDITOR_BUTTON_LABELS,
  TABLE_ACTION_GROUPS,
  type TableActionItem,
  type TableAlign,
  type TableAlignKind,
  type TableActionKind,
} from "../../editor/menu-content.ts";
import { getActiveWhiteboard } from "../../services/editorSession.ts";
import styles from "../../styles/components/NoteEditor.module.css";

export interface TableControlsProps {
  editor: Editor;
  /**
   * Se incrementa en cada transacción del editor.
   *
   * La barrita no guarda dónde está la tabla: lo lee del documento vivo cada vez
   * que este número cambia. Si guardara una posición, cualquier cosa —escribir una
   * letra, deshacer, mover el cursor a otra celda— la dejaría flotando sobre una
   * celda en la que ya no se está.
   */
  version: () => number;
  /**
   * La superficie donde se coloca la barrita.
   *
   * Se pasa en vez de buscarla desde el editor porque las coordenadas del
   * desplegable son **de la superficie**: es lo que coloca el asa y los menús, y
   * así la barrita se mueve con la columna cuando esta se desplaza.
   */
  surface: HTMLElement;
}

/** Dónde va la barrita, en coordenadas de la superficie. */
interface Ancla {
  left: number;
  top: number;
}

/** Un `editor.chain()`, que es lo que todos los comandos de tabla encadenan. */
type Cadena = ReturnType<Editor["chain"]>;

/**
 * Los comandos de la barrita, en un solo sitio.
 *
 * El mismo comando se usa dos veces: para preguntar con `can()` si el botón puede
 * presionarse —un botón que no puede se enseña apagado, que es muy distinto de un
 * botón roto— y para ejecutarlo. Con dos listas, el día que uno cambie el otro se
 * queda diciendo mal lo que es posible, y eso es un fallo que no se ve hasta que
 * alguien pulsa.
 */
const COMANDOS: Record<Exclude<TableActionKind, TableAlignKind>, (cadena: Cadena) => boolean> = {
  rowAbove: (cadena) => cadena.addRowBefore().run(),
  rowBelow: (cadena) => cadena.addRowAfter().run(),
  columnLeft: (cadena) => cadena.addColumnBefore().run(),
  columnRight: (cadena) => cadena.addColumnAfter().run(),
  deleteRow: (cadena) => cadena.deleteRow().run(),
  deleteColumn: (cadena) => cadena.deleteColumn().run(),
  deleteTable: (cadena) => cadena.deleteTable().run(),
  headerRow: (cadena) => cadena.toggleHeaderRow().run(),
};

/**
 * La barrita de dentro de la tabla: añadir y quitar filas y columnas.
 *
 * Existe por un agujero, no por gusto. Insertar una tabla sí se podía; **cambiar
 * la tabla después, no**: sin añadir filas ni columnas, quien no sabe Markdown se
 * encuentra con una tabla de 3×3 y ninguna manera de salir de ahí. Eso no es una
 * mejora de lujo, es un callejón sin salida.
 *
 * Sale pegada a la celda donde está el cursor, medida con su rectángulo real —nunca
 * con una posición calculada a mano— y desaparece cuando el cursor sale de la
 * tabla. `Tab` dentro de una tabla ya pasa a la celda siguiente
 * (`@tiptap/extension-table` lo pone en `TableKit`), y al final de la última
 * celda añade una fila: con eso, escribir una tabla entera es posible sin saber
 * una sola palabra de su formato.
 */
export function TableControls(props: TableControlsProps) {
  let bar: HTMLDivElement | undefined;
  const [ancla, setAncla] = createSignal<Ancla | null>(null);
  /**
   * La tabla en la que alguien echó la barrita, o `null` si está a la vista.
   *
   * Se guarda **qué tabla** y no un sí/no, porque el Escape de una tabla no puede
   * dejar la barrita escondida en la siguiente: al cambiar de tabla vuelve a salir.
   */
  const [descartadaEn, setDescartadaEn] = createSignal<number | null>(null);

  onMount(() => {
    const conservarLaSeleccion = (event: Event): void => event.preventDefault();
    bar?.addEventListener("pointerdown", conservarLaSeleccion);
    bar?.addEventListener("mousedown", conservarLaSeleccion);
    onCleanup(() => {
      bar?.removeEventListener("pointerdown", conservarLaSeleccion);
      bar?.removeEventListener("mousedown", conservarLaSeleccion);
    });
  });

  /**
   * La celda donde está el cursor y la tabla a la que pertenece, o `null`.
   *
   * La celda es un ancestro del cursor, así que se busca a qué nivel está y se le
   * pide su nodo al documento: `nodeDOM` es lo único que sabe decir dónde está una
   * cosa en la pantalla. Con un lienzo de pizarra abierto encima no se enseña nada,
   * porque taparía el tablero.
   */
  function celdaDelCursor(): { celda: Ancla; tabla: number } | null {
    const editor = props.editor;
    if (editor.isDestroyed || !editor.isFocused) return null;
    if (getActiveWhiteboard() !== null) return null;
    const { $from } = editor.state.selection;
    let nivelCelda = -1;
    let nivelTabla = -1;
    for (let nivel = $from.depth; nivel > 0; nivel -= 1) {
      const name = $from.node(nivel).type.name;
      if (name === "tableCell" || name === "tableHeader") nivelCelda = nivel;
      if (name === "table" && nivelTabla < 0) nivelTabla = nivel;
    }
    if (nivelCelda < 0 || nivelTabla < 0) return null;
    const dom = editor.view.nodeDOM($from.before(nivelCelda));
    if (!(dom instanceof HTMLElement)) return null;
    const celda = dom.getBoundingClientRect();
    const base = props.surface.getBoundingClientRect();
    return {
      celda: { left: celda.left - base.left, top: celda.top - base.top },
      tabla: $from.before(nivelTabla),
    };
  }

  createEffect(() => {
    props.version();
    const encontrada = celdaDelCursor();
    const descartada = descartadaEn();
    if (!encontrada) {
      // Al salir de la tabla se vuelve a armar: el Escape de una tabla no puede
      // dejar la barrita escondida en la siguiente. Poner `null` cuando ya lo
      // está no vuelve a disparar el efecto, así que no se pasa a sí mismo.
      if (descartada !== null) setDescartadaEn(null);
      setAncla(null);
      return;
    }
    if (descartada !== null && descartada === encontrada.tabla) return;
    // Se enseña: lo que quedó echado era de otra tabla y ya no cuenta.
    setDescartadaEn(null);
    // La barrita se mide a sí misma para no salirse de la columna: por mucho que
    // la celda esté a la derecha, el borde derecho tiene que estar dentro.
    const ancho = bar?.getBoundingClientRect().width ?? 0;
    const limite = props.surface.getBoundingClientRect().width;
    setAncla({
      left: Math.max(0, Math.min(encontrada.celda.left, limite - ancho - 8)),
      top: encontrada.celda.top,
    });
  });

  /** Echar la barrita de la tabla en la que está el cursor. */
  function descartar(): void {
    const encontrada = celdaDelCursor();
    if (!encontrada) return;
    setDescartadaEn(encontrada.tabla);
  }

  createEffect(() => {
    if (!ancla()) return;
    const alPincharFuera = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-x='table-controls']")) return;
      // Un clic dentro del editor no echa la barrita: lo que decide de qué se
      // trata es dónde esté el cursor, y eso se mira en cada transacción.
      if (target.closest("[data-x='editor']")) return;
      descartar();
    };
    const alPulsar = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      descartar();
      props.editor.view.focus();
    };
    // En captura y en `document`: el foco lo tiene el editor, así que un manejador
    // dentro de la barrita no se enteraría de lo que pasa fuera.
    document.addEventListener("pointerdown", alPincharFuera, true);
    document.addEventListener("keydown", alPulsar, true);
    onCleanup(() => {
      document.removeEventListener("pointerdown", alPincharFuera, true);
      document.removeEventListener("keydown", alPulsar, true);
    });
  });

  /**
   * La alineación que tiene la celda del cursor.
   *
   * La cabecera y la celda son dos tipos de nodo distintos con el mismo atributo,
   * así que se mira el que esté. Sin alineación el atributo es `null` —que es lo
   * que significa—, y por eso ningún botón se marca.
   */
  function alineacionActual(): TableAlign | null {
    props.version();
    const editor = props.editor;
    if (editor.isDestroyed) return null;
    const valor =
      editor.getAttributes("tableCell").align ?? editor.getAttributes("tableHeader").align;
    return valor === "left" || valor === "center" || valor === "right" ? valor : null;
  }

  /** Si la fila en la que está el cursor es la fila de cabecera. */
  function cabeceraActiva(): boolean {
    props.version();
    return props.editor.isActive("tableHeader");
  }

  /**
   * Si cada botón puede presionarse aquí, en una sola vuelta.
   *
   * Un botón que no puede se enseña apagado, que es muy distinto de un botón roto.
   * Preguntarlo al editor cuesta un `can()` —que construye el mapa entero de
   * comandos— así que se hace una vez por transacción y no once por botón: en cada
   * pulsación de tecla se repintaría el mismo mapa once veces.
   */
  const puedenCorrer = createMemo(() => {
    props.version();
    const editor = props.editor;
    const valores = new Map<TableActionKind, boolean>();
    if (editor.isDestroyed) return valores;
    const puede = editor.can();
    for (const grupo of TABLE_ACTION_GROUPS) {
      for (const item of grupo.items) {
        valores.set(
          item.kind,
          item.align !== undefined
            ? puede.setCellAttribute("align", item.align)
            : COMANDOS[item.kind](puede.chain()),
        );
      }
    }
    return valores;
  });

  /** Si este botón tiene algo que enseñar: la alineación o la cabecera. */
  function tieneEstado(item: TableActionItem): boolean {
    return item.align !== undefined || item.kind === "headerRow";
  }

  function estaPuesto(item: TableActionItem): boolean {
    if (item.align !== undefined) return alineacionActual() === item.align;
    if (item.kind === "headerRow") return cabeceraActiva();
    return false;
  }

  function correr(item: TableActionItem): void {
    const editor = props.editor;
    if (editor.isDestroyed) return;
    if (item.align !== undefined) {
      // Pulsar el botón que ya está puesto lo quita: alinear a la izquierda dos
      // veces devuelve la celda a su estado, y sin esto se quedaría con el
      // atributo puesto para siempre sin poder quitarlo.
      const nuevo = alineacionActual() === item.align ? null : item.align;
      editor.chain().focus().setCellAttribute("align", nuevo).run();
      editor.view.focus();
      return;
    }
    COMANDOS[item.kind](editor.chain().focus());
    editor.view.focus();
  }

  return (
    <div
      ref={(element) => (bar = element)}
      class={styles.tableControls}
      data-x="table-controls"
      data-show={ancla() ? "true" : "false"}
      role="toolbar"
      aria-orientation="horizontal"
      aria-label={EDITOR_BUTTON_LABELS.table}
      // Encima de la celda, y no pegado a un borde calculado: la altura de la
      // barrita no se sabe hasta que está pintada, y `translateY` la sube lo justo
      // sin tener que medirla antes.
      style={{ left: `${ancla()?.left ?? 0}px`, top: `${ancla()?.top ?? 0}px` }}
    >
      <For each={TABLE_ACTION_GROUPS}>
        {(grupo, indice) => (
          <>
            {/* Una raya entre grupo y grupo: once botones en hilada no se leen. */}
            <Show when={indice() > 0}>
              <span class={styles.tableSeparator} aria-hidden="true" />
            </Show>
            <div class={styles.tableGroup} role="group" aria-label={grupo.group}>
              <For each={grupo.items}>
                {(item) => (
                  <button
                    type="button"
                    class={`${styles.tool}${estaPuesto(item) ? ` ${styles.toolActive}` : ""}`}
                    aria-label={item.label}
                    title={item.label}
                    // `aria-pressed` solo en los que se quedan pulsados. En un
                    // botón de una sola vez no significa nada y hace ruido.
                    aria-pressed={tieneEstado(item) ? estaPuesto(item) : undefined}
                    disabled={!puedenCorrer().get(item.kind)}
                    onClick={() => correr(item)}
                  >
                    <span class={styles.toolIcon} innerHTML={item.icon} />
                  </button>
                )}
              </For>
            </div>
          </>
        )}
      </For>
    </div>
  );
}