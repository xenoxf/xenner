import type { Editor } from "@tiptap/core";
import { NodeSelection, type Selection } from "@tiptap/pm/state";
import { createEffect, createSignal, onCleanup } from "solid-js";

import { getActiveWhiteboard } from "../../services/editorSession.ts";
import styles from "../../styles/components/NoteEditor.module.css";
import { PlusIcon } from "../ui/Icons.tsx";

/** Lo que hay que saber para colocar el asa al lado de su bloque. */
interface HandleAnchor {
  /** Posición del bloque de nivel superior al que pertenece el asa. */
  pos: number;
  left: number;
  top: number;
}

export interface BlockHandleProps {
  editor: Editor;
  /**
   * Se incrementa en cada transacción del editor.
   *
   * El asa no guarda una copia de la posición: la lee del editor vivo cada vez
   * que cambia. Si guardara un número, cualquier transacción —escribir una letra,
   * deshacer, insertar una imagen— dejaría el asa en el sitio viejo.
   */
  version: () => number;
  /** Abre o cierra el menú de insertar, anclado al rectángulo del asa. */
  onToggleMenu(anchor: DOMRect): void;
}


/**
 * El asa del bloque del cursor: el `+` que abre el menú de insertar y el tirador
 * que lo mueve de sitio.
 *
 * Las dos cosas se rehacen sobre la API de ProseMirror. El `+` sale pegado al
 * rectángulo real del asa —nunca a una posición calculada a mano— y el tirador
 * mueve el bloque con `view.dragging` y los eventos de arrastre del propio
 * ProseMirror, no con el arrastre HTML5: es el que sabe dónde se puede soltar
 * un bloque (`dropPoint`) y es el que pinta el cursor de caída.
 */
export function BlockHandle(props: BlockHandleProps) {
  let host: HTMLDivElement | undefined;
  const [anchor, setAnchor] = createSignal<HandleAnchor | null>(null);
  /** `pointermove` no es una transacción: al arrastrar no hay que recolocar el asa. */
  let dragging = false;
  let stopDragging: (() => void) | null = null;

  createEffect(() => {
    props.version();
    const surface = host?.parentElement;
    const blockPos = surface ? currentBlockPos(props.editor) : null;
    if (!surface || blockPos === null || !showsHandle(props.editor)) {
      setAnchor(null);
      return;
    }
    const dom = props.editor.view.nodeDOM(blockPos);
    if (!(dom instanceof HTMLElement)) {
      setAnchor(null);
      return;
    }
    const block = dom.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    setAnchor({
      pos: blockPos,
      // Alineado con el borde del bloque. Lo de llevarlo al hueco de la izquierda
      // lo hace el CSS con un `transform`, y no la cuenta: el hueco depende del
      // margen de la columna, que es del tema y cambia con la pantalla.
      left: Math.max(0, block.left - surfaceRect.left),
      top: block.top - surfaceRect.top,
    });
  });

  function endDrag(restoreSelection: Selection | null): void {
    dragging = false;
    stopDragging?.();
    stopDragging = null;
    const view = props.editor.view;
    if (view.isDestroyed) return;
    view.dragging = null;
    // Sin esto la nota se queda con el bloque entero seleccionado y lo primero
    // que se escriba borra el bloque que se acababa de mover.
    if (restoreSelection) view.dispatch(view.state.tr.setSelection(restoreSelection));
  }

  function beginDrag(event: PointerEvent): void {
    const view = props.editor.view;
    const current = anchor();
    if (!current || view.isDestroyed || !view.editable || dragging) return;
    // Sin esto el navegador selecciona el texto que hay bajo el puntero al
    // empezar a arrastrar, que es justo lo que se quiere mover.
    event.preventDefault();
    dragging = true;
    const before = view.state.selection;
    // Al soltar, ProseMirror quita lo seleccionado y pone ahí la rebanada:
    // por eso el bloque tiene que estar seleccionado antes de arrastrarlo.
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, current.pos)));
    view.dragging = { slice: view.state.selection.content(), move: true };

    const onMove = (move: PointerEvent): void => {
      view.dom.dispatchEvent(new DragEvent("dragover", dragInit(move)));
    };
    const onUp = (up: PointerEvent): void => {
      view.dom.dispatchEvent(new DragEvent("drop", dragInit(up)));
      endDrag(null);
    };
    const onCancel = (): void => endDrag(before);
    const onKey = (key: KeyboardEvent): void => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      endDrag(before);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    stopDragging = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }

  onCleanup(() => endDrag(null));

  const current = anchor();
  // El asa se pinta siempre y se esconde con `data-show`: si el `div` solo
  // existiera cuando hay un bloque al que anclarse, su propio `ref` —del que
  // sale la superficie donde se coloca— no existiría nunca en el primer cálculo,
  // y la posición nunca se llegaría a saber.
  return (
    <div
      ref={(element) => (host = element)}
      class={styles.blockHandle}
      data-x="block-handle"
      data-show={current ? "true" : "false"}
      style={{ left: `${current?.left ?? 0}px`, top: `${current?.top ?? 0}px` }}
    >
      <button
        type="button"
        class={styles.handleAdd}
        aria-label="Insertar en la nota"
        title="Insertar en la nota"
        // El menú se abre con un clic, pero sin que el botón se lleve el foco: si
        // lo hiciera, el editor perdería el cursor de texto y el tipo se aplicaría
        // al bloque equivocado.
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          if (host) props.onToggleMenu(host.getBoundingClientRect());
        }}
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        class={styles.handleGrip}
        aria-label="Mover el bloque"
        title="Mover el bloque"
        onPointerDown={beginDrag}
      >
        ⠿
      </button>
    </div>
  );
}

/**
 * La posición del bloque de nivel superior al que pertenece el cursor.
 *
 * Se ancla al bloque **externo**, no al párrafo que hay dentro: arrastrar un
 * elemento de una lista se lleva la lista entera, que es lo que se espera al
 * mover un bloque de sitio. Con `null` no hay asa.
 */
function currentBlockPos(editor: Editor): number | null {
  if (editor.isDestroyed) return null;
  const { selection, doc } = editor.state;
  const depth = selection.$from.depth;
  // Una `AllSelection` o un nodo suelto no tienen bloque de nivel superior al que
  // anclarse con `before()`; el propio `doc` no sirve de asa.
  if (depth < 1) return null;
  const pos = depth === 1 ? selection.from : selection.$from.before(1);
  return doc.nodeAt(pos)?.isBlock === true ? pos : null;
}

/**
 * El asa se esconde cuando no hay a quién arreglarla.
 *
 * Sin foco no hay bloque del cursor. Con un lienzo abierto encima, el asa se
 * pintaría en medio de la pizarra. Y una nota vacía **sí** muestra el asa: es
 * justo donde más hace falta el `+`.
 */
function showsHandle(editor: Editor): boolean {
  if (getActiveWhiteboard() !== null) return false;
  if (editor.isDestroyed || !editor.isFocused) return false;
  return editor.state.doc.childCount > 0;
}

/**
 * Un evento de arrastre de mentira, con la posición real del puntero.
 *
 * Se despacha sobre `view.dom` para que lo atajen los mismos manejadores que
 * atajan el arrastre del navegador: el cursor de caída y el `drop` de
 * ProseMirror. El `dataTransfer` hace falta porque `drop` lee de él, aunque con
 * `view.dragging` puesto ya no usa su contenido.
 */
function dragInit(event: PointerEvent): DragEventInit {
  return {
    bubbles: true,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    dataTransfer: new DataTransfer(),
  };
}
