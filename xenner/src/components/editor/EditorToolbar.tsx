import styles from "../../styles/components/EditorToolbar.module.css";
import type { DrawingTool } from "../../types/drawing";
import { ImageIcon, PaperclipIcon, PencilIcon, PlusIcon } from "../ui/Icons";

export interface EditorToolbarProps {
  loading: boolean;
  ready: boolean;
  imageBusy: boolean;
  whiteboardBusy: boolean;
  attachmentBusy: boolean;
  status: string;
  onChooseImage(): void;
  onChooseAttachment(): void;
  onInsertWhiteboard(tool: DrawingTool): void;
  /**
   * Abre el menú de insertar del editor, anclado al rectángulo del propio botón.
   * El dock **no** monta su copia del menú: el editor es quien sabe dónde cae
   * lo que se elija y cómo resaltar la entrada actual; el dock solo pide.
   */
  onToggleInsertMenu?(anchor: DOMRect): void;
}

/**
 * El dock: los cuatro botones de lo que se pone en la nota.
 *
 * Antes había un botón «Insertar» con un menú **y** los tres botones al lado, y
 * los dos caminos hacían lo mismo. Dos caminos para la misma acción obligan a
 * decidir cuál es el bueno y hacen la barra más grande de lo que hace falta. Con
 * un `+` para las cosas de Markdown y tres iconos para los gestos, una acción por
 * botón: un clic en vez de dos.
 *
 * Son **adjuntos, imágenes y el menú del `+`**, no formato del texto. El formato
 * —tipo de bloque, negrita, cursiva, color— vive en la barra fija de la nota, que
 * es donde está siempre visible; tener las dos cosas en el mismo sitio convertía
 * dos menús en uno solo y hacía que nadie encontrara ninguna de las dos.
 */
export function EditorToolbar(props: EditorToolbarProps) {
  return (
    <div
      class={styles.dock}
      role="toolbar"
      data-x="toolbar"
      aria-orientation="horizontal"
      aria-label="Insertar en la nota"
      // El dock vive fuera del contenteditable. Si el botón recibiera el foco
      // al pulsarlo, el editor perdería el cursor de texto y escribir después
      // se sentiría roto; preventDefault en mousedown lo conserva.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
    >
      <button
        type="button"
        class={styles.iconButton}
        disabled={props.loading || !props.ready}
        aria-label="Insertar"
        title="Insertar"
        data-x="dock-insert"
        onClick={(event) => {
          props.onToggleInsertMenu?.(event.currentTarget.getBoundingClientRect());
        }}
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        class={`${styles.iconButton} ${props.imageBusy ? styles.busy : ""}`}
        disabled={props.loading || props.imageBusy || !props.ready}
        aria-label="Insertar imagen"
        aria-busy={props.imageBusy}
        title="Insertar imagen"
        onClick={props.onChooseImage}
      >
        <ImageIcon />
      </button>
      <button
        type="button"
        class={`${styles.iconButton} ${props.whiteboardBusy ? styles.busy : ""}`}
        disabled={props.loading || props.whiteboardBusy || !props.ready}
        aria-label="Insertar pizarra"
        aria-busy={props.whiteboardBusy}
        title="Insertar pizarra"
        onClick={() => props.onInsertWhiteboard("pen")}
      >
        <PencilIcon />
      </button>
      {/* `.busy` también aquí, y no solo en imagen y pizarra: subir un PDF de
          varios megas sin nada que se mueva parece que la app se ha colgado. El
          `aria-busy` que tenía antes solo lo leen los lectores de pantalla. */}
      <button
        type="button"
        class={`${styles.iconButton} ${props.attachmentBusy ? styles.busy : ""}`}
        disabled={props.loading || props.attachmentBusy || !props.ready}
        aria-label="Adjuntar archivo"
        aria-busy={props.attachmentBusy}
        title="Adjuntar archivo"
        onClick={props.onChooseAttachment}
      >
        <PaperclipIcon />
      </button>
      <span class="sr-only" role="status" aria-live="polite">{props.status}</span>
    </div>
  );
}