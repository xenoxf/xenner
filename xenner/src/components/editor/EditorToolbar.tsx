import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { DRAWING_BLOCK_TOOLS } from "../../data/drawing";
import { EDITOR_BLOCKS } from "../../data/editor";
import styles from "../../styles/components/EditorToolbar.module.css";
import type { DrawingTool } from "../../types/drawing";
import type { EditorBlockType } from "../../types/editor";
import {
  ArrowIcon,
  BulletListIcon,
  CircleIcon,
  HeadingIcon,
  ImageIcon,
  LineIcon,
  MarkdownIcon,
  OrderedListIcon,
  PencilIcon,
  QuoteIcon,
  SquareIcon,
  TextIcon,
} from "../ui/Icons";

export interface EditorToolbarProps {
  loading: boolean;
  sourceMode: boolean;
  ready: boolean;
  imageBusy: boolean;
  whiteboardBusy: boolean;
  status: string;
  onApplyBlock(type: EditorBlockType): void;
  onChooseImage(): void;
  onInsertWhiteboard(tool: DrawingTool): void;
  onToggleSource(): void;
}

function DrawingToolIcon(props: { tool: DrawingTool }) {
  if (props.tool === "pen") return <PencilIcon />;
  if (props.tool === "rect") return <SquareIcon />;
  if (props.tool === "ellipse") return <CircleIcon />;
  if (props.tool === "line") return <LineIcon />;
  if (props.tool === "arrow") return <ArrowIcon />;
  return <TextIcon />;
}

function BlockIcon(props: { type: EditorBlockType }) {
  switch (props.type) {
    case "paragraph":
      return <TextIcon />;
    case "heading1":
    case "heading2":
      return <HeadingIcon />;
    case "bullet":
      return <BulletListIcon />;
    case "ordered":
      return <OrderedListIcon />;
    case "quote":
      return <QuoteIcon />;
  }
}

export function EditorToolbar(props: EditorToolbarProps) {
  const [blockMenuOpen, setBlockMenuOpen] = createSignal(false);
  const [drawMenuOpen, setDrawMenuOpen] = createSignal(false);
  let blockMenu: HTMLDivElement | undefined;
  let blockTrigger: HTMLButtonElement | undefined;
  let drawMenu: HTMLDivElement | undefined;
  let drawTrigger: HTMLButtonElement | undefined;

  function closePopovers(): void {
    setBlockMenuOpen(false);
    setDrawMenuOpen(false);
  }

  onMount(() => {
    const closeMenuOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node) {
        const outsideBlocks = !blockMenu?.contains(target) && !blockTrigger?.contains(target);
        const outsideDrawing = !drawMenu?.contains(target) && !drawTrigger?.contains(target);
        if (outsideBlocks && outsideDrawing) closePopovers();
      }
    };
    const closeMenuWithEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || (!blockMenuOpen() && !drawMenuOpen())) return;
      const returnFocus = blockMenuOpen() ? blockTrigger : drawTrigger;
      closePopovers();
      queueMicrotask(() => returnFocus?.focus());
    };
    document.addEventListener("pointerdown", closeMenuOutside);
    document.addEventListener("keydown", closeMenuWithEscape);
    onCleanup(() => {
      document.removeEventListener("pointerdown", closeMenuOutside);
      document.removeEventListener("keydown", closeMenuWithEscape);
    });
  });

  function moveToolbarFocus(event: KeyboardEvent, container: HTMLElement): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
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

  function toggleBlockMenu(): void {
    if (props.loading || props.sourceMode || !props.ready) return;
    setDrawMenuOpen(false);
    setBlockMenuOpen((open) => !open);
  }

  function toggleDrawMenu(): void {
    if (props.loading || props.whiteboardBusy || props.sourceMode || !props.ready) return;
    setBlockMenuOpen(false);
    setDrawMenuOpen((open) => !open);
  }

  return (
    <div
      class={styles.dock}
      role="toolbar"
      aria-label="Acciones del editor"
      onKeyDown={(event) => moveToolbarFocus(event, event.currentTarget)}
    >
      <div class={styles.anchor}>
        <button
          ref={(element) => (blockTrigger = element)}
          type="button"
          class={`${styles.button} ${blockMenuOpen() ? styles.open : ""}`}
          disabled={props.loading || props.sourceMode || !props.ready}
          aria-label="Tipo de bloque"
          aria-haspopup="menu"
          aria-controls="editor-block-menu"
          aria-expanded={blockMenuOpen()}
          title={props.ready ? "Tipo de bloque" : "Preparando editor"}
          onClick={toggleBlockMenu}
        >
          <TextIcon />
        </button>
        <Show when={blockMenuOpen()}>
          <div
            ref={(element) => (blockMenu = element)}
            id="editor-block-menu"
            class={`${styles.menu} ${styles.blockPicker}`}
            role="menu"
            aria-label="Tipo de bloque"
          >
            <div class={styles.blockGrid} role="group" aria-label="Formatos de texto">
              <For each={EDITOR_BLOCKS}>
                {(block) => (
                  <button
                    type="button"
                    class={styles.blockItem}
                    role="menuitem"
                    title={block.label}
                    onClick={() => {
                      closePopovers();
                      props.onApplyBlock(block.id);
                    }}
                  >
                    <span><BlockIcon type={block.id} /></span>
                    {block.label}
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
        class={`${styles.button} ${props.imageBusy ? styles.busy : ""}`}
        disabled={props.loading || props.imageBusy || props.sourceMode || !props.ready}
        aria-label="Insertar imagen"
        title={props.ready ? "Insertar imagen" : "Preparando editor"}
        onClick={props.onChooseImage}
      >
        <ImageIcon />
      </button>
      <div class={styles.anchor}>
        <button
          ref={(element) => (drawTrigger = element)}
          type="button"
          class={`${styles.button} ${drawMenuOpen() ? styles.open : ""}`}
          disabled={props.loading || props.whiteboardBusy || props.sourceMode || !props.ready}
          aria-label="Dibujar"
          aria-haspopup="menu"
          aria-controls="editor-drawing-menu"
          aria-expanded={drawMenuOpen()}
          title={props.ready ? "Dibujar" : "Preparando editor"}
          onClick={toggleDrawMenu}
        >
          <PencilIcon />
        </button>
        <Show when={drawMenuOpen()}>
          <div
            ref={(element) => (drawMenu = element)}
            id="editor-drawing-menu"
            class={`${styles.menu} ${styles.drawingPicker}`}
            role="menu"
            aria-label="Figuras para dibujar"
          >
            <For each={DRAWING_BLOCK_TOOLS}>
              {(item) => (
                <button
                  type="button"
                  class={styles.drawingItem}
                  role="menuitem"
                  title={item.label}
                  onClick={() => {
                    closePopovers();
                    props.onInsertWhiteboard(item.id);
                  }}
                >
                  <DrawingToolIcon tool={item.id} />
                  <span>{item.label}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <span class={styles.separator} aria-hidden="true" />
      <button
        type="button"
        class={`${styles.button} ${props.sourceMode ? styles.active : ""}`}
        aria-label={props.sourceMode ? "Volver a vista visual" : "Ver Markdown"}
        aria-pressed={props.sourceMode}
        title={props.sourceMode ? "Vista visual" : "Markdown"}
        onClick={props.onToggleSource}
      >
        <MarkdownIcon />
      </button>
      <span class="sr-only" role="status" aria-live="polite">
        {props.status}
      </span>
    </div>
  );
}
