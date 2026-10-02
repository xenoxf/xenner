import styles from "../../styles/components/EditorToolbar.module.css";
import type { DrawingTool } from "../../types/drawing";
import { ImageIcon, PaperclipIcon, PencilIcon } from "../ui/Icons";

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
}

/**
 * El dock: tres botones, uno por cosa que se inserta.
 *
 * Antes había un botón «Insertar» con un menú **y** los tres botones al lado, y
 * los dos caminos hacían lo mismo. Dos caminos para la misma acción obligan a
 * decidir cuál es el bueno y hacen la barra más grande de lo que hace falta. Con
 * tres acciones, iconos solos: un clic en vez de dos, y el dock se queda en lo
 * que es, una barra de tres botones.
 *
 * Los tipos de texto **no** están aquí, y no por capricho: se cambian en la barra
 * flotante que sale encima de lo seleccionado, junto a la negrita y la cursiva.
 * Ese es el sitio donde se cambia de qué trata el texto, y tenerlos también aquí
 * convertía los dos menús en el mismo sitio.
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