import {
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import { EDITOR_BLOCKS } from "../../data/editor";
import styles from "../../styles/components/EditorToolbar.module.css";
import type { DrawingTool } from "../../types/drawing";
import type { EditorBlockType } from "../../types/editor";
import {
  BulletListIcon,
  HeadingIcon,
  ImageIcon,
  OrderedListIcon,
  PaperclipIcon,
  PencilIcon,
  QuoteIcon,
  TextIcon,
} from "../ui/Icons";

type InsertId = EditorBlockType | "image" | "whiteboard" | "attachment";

interface EditorToolbarProps {
  loading: boolean;
  ready: boolean;
  imageBusy: boolean;
  whiteboardBusy: boolean;
  attachmentBusy: boolean;
  status: string;
  onApplyBlock(type: EditorBlockType): void;
  onChooseImage(): void;
  onChooseAttachment(): void;
  onInsertWhiteboard(tool: DrawingTool): void;
}

interface InsertItem {
  id: InsertId;
  label: string;
}

/**
 * Lo que ofrece el dock, en el orden en que se lee: primero los tipos de texto
 * —que es lo que se usa casi siempre— y después lo que se inserta.
 *
 * Sin buscador y sin grupos. Diez entradas de dos palabras se leen de un
 * vistazo, y un encabezado por grupo solo repetía en mayúsculas lo que el icono
 * ya decía. `EDITOR_BLOCKS` sigue siendo la lista de tipos, la misma que
 * recorre el `+` de la barra flotante.
 */
const INSERT_ITEMS: readonly InsertItem[] = [
  ...EDITOR_BLOCKS.map((item) => ({ id: item.id, label: item.label })),
  { id: "image", label: "Imagen" },
  { id: "whiteboard", label: "Pizarra" },
  { id: "attachment", label: "Adjuntar archivo" },
];

function ItemIcon(props: { id: InsertId }) {
  if (props.id === "paragraph") return <TextIcon />;
  if (props.id === "heading1" || props.id === "heading2" || props.id === "heading3") return <HeadingIcon />;
  if (props.id === "bullet") return <BulletListIcon />;
  if (props.id === "ordered") return <OrderedListIcon />;
  if (props.id === "quote") return <QuoteIcon />;
  if (props.id === "image") return <ImageIcon />;
  if (props.id === "attachment") return <PaperclipIcon />;
  return <PencilIcon />;
}

export function EditorToolbar(props: EditorToolbarProps) {
  const [insertOpen, setInsertOpen] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(0);
  let insertMenu: HTMLDivElement | undefined;
  let insertTrigger: HTMLButtonElement | undefined;

  function closeMenu(restoreFocus = true): void {
    setInsertOpen(false);
    setActiveIndex(0);
    if (restoreFocus) queueMicrotask(() => insertTrigger?.focus());
  }

  function openMenu(): void {
    if (props.loading || !props.ready) return;
    setInsertOpen(true);
    setActiveIndex(0);
    queueMicrotask(() => {
      insertMenu?.querySelector<HTMLButtonElement>("[role='option']")?.focus({ preventScroll: true });
    });
  }

  function runItem(item: InsertItem): void {
    closeMenu(false);
    if (item.id === "image") props.onChooseImage();
    else if (item.id === "attachment") props.onChooseAttachment();
    else if (item.id === "whiteboard") props.onInsertWhiteboard("pen");
    else props.onApplyBlock(item.id);
  }

  function moveToolbarFocus(event: KeyboardEvent, container: HTMLElement): void {
    if (insertOpen() || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const controls = [...container.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = controls.length - 1;
    else if (event.key === "ArrowRight") next = (Math.max(current, 0) + 1) % controls.length;
    else next = (Math.max(current, 0) - 1 + controls.length) % controls.length;
    event.preventDefault();
    controls[next]?.focus();
  }

  function moveMenuFocus(event: KeyboardEvent, index: number): void {
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % INSERT_ITEMS.length;
    else if (event.key === "ArrowUp") next = (index - 1 + INSERT_ITEMS.length) % INSERT_ITEMS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = INSERT_ITEMS.length - 1;
    else return;
    event.preventDefault();
    setActiveIndex(next);
    queueMicrotask(() => {
      insertMenu?.querySelectorAll<HTMLButtonElement>("[role='option']")[next]?.focus();
    });
  }

  onMount(() => {
    const closeOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!insertMenu?.contains(target) && !insertTrigger?.contains(target)) closeMenu(false);
    };
    const closeEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || !insertOpen()) return;
      event.preventDefault();
      closeMenu();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    onCleanup(() => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    });
  });

  return (
    <div
      class={styles.dock}
      role="toolbar"
      data-x="toolbar"
      aria-orientation="horizontal"
      aria-label="Acciones del editor"
      onKeyDown={(event) => moveToolbarFocus(event, event.currentTarget)}
      // El dock vive fuera del contenteditable. Si el botón recibiera el foco
      // al pulsarlo, el editor perdería el cursor de texto y escribir después
      // se sentiría roto; preventDefault en mousedown lo conserva.
      onMouseDown={(event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("input, textarea")) return;
        event.preventDefault();
      }}
    >
      <div class={styles.anchor}>
        <button
          ref={(element) => (insertTrigger = element)}
          type="button"
          class={`${styles.button} ${insertOpen() ? styles.open : ""}`}
          data-x="toolbar-button"
          data-x-open={insertOpen() ? "true" : undefined}
          disabled={props.loading || !props.ready}
          aria-label="Tipo de bloque de texto"
          aria-haspopup="dialog"
          aria-controls="editor-insert-menu"
          aria-expanded={insertOpen()}
          title="Tipo de bloque de texto"
          onClick={() => (insertOpen() ? closeMenu() : openMenu())}
        >
          <TextIcon />
          <span class={styles.buttonLabel}>Texto</span>
        </button>
        <Show when={insertOpen()}>
          <div
            ref={(element) => (insertMenu = element)}
            id="editor-insert-menu"
            class={styles.menu}
            role="dialog"
            aria-label="Bloques de texto e inserciones opcionales"
          >
            {/*
              Una lista plana, sin buscador ni encabezados. Diez opciones de
              dos palabras caben de un vistazo: el buscador solo servía para
              cuando eran muchas, y los grupos repetían en mayúsculas lo que cada
              icono ya decía. Lo que sí se conserva es el recorrido con teclado
              —flechas, Inicio, Fin, Escape— que es como se usa sin ratón.
            */}
            <div class={styles.menuResults}>
              <For each={INSERT_ITEMS}>
                {(item, position) => (
                  <button
                    type="button"
                    class={`${styles.menuItem} ${activeIndex() === position() ? styles.menuItemActive : ""}`}
                    role="option"
                    aria-selected={activeIndex() === position()}
                    tabIndex={activeIndex() === position() ? 0 : -1}
                    onPointerEnter={() => setActiveIndex(position())}
                    onClick={() => runItem(item)}
                    onKeyDown={(event) => moveMenuFocus(event, position())}
                  >
                    <span class={styles.menuIcon}><ItemIcon id={item.id} /></span>
                    <span>{item.label}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
      <span class={styles.separator} aria-hidden="true" />
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
      <button
        type="button"
        class={styles.iconButton}
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
