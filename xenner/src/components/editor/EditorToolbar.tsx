import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { EDITOR_BLOCKS, SHAPE_COLORS, SHAPE_TOOLS } from "../../data/editor";
import styles from "../../styles/components/EditorToolbar.module.css";
import type {
  EditorBlockType,
  ShapeColor,
  ShapeTool,
} from "../../types/editor";
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
  PlusIcon,
  QuoteIcon,
  SquareIcon,
  TextIcon,
} from "../ui/Icons";

export interface EditorToolbarProps {
  loading: boolean;
  sourceMode: boolean;
  ready: boolean;
  imageBusy: boolean;
  shapeBusy: boolean;
  status: string;
  onApplyBlock(type: EditorBlockType): void;
  onChooseImage(): void;
  onInsertShape(tool: ShapeTool, color: ShapeColor): void;
  onAddText(): void;
  onToggleSource(): void;
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

function ShapeToolIcon(props: { tool: ShapeTool }) {
  switch (props.tool) {
    case "pen":
      return <PencilIcon />;
    case "rect":
      return <SquareIcon />;
    case "ellipse":
      return <CircleIcon />;
    case "line":
      return <LineIcon />;
    case "arrow":
      return <ArrowIcon />;
    case "text":
      return <TextIcon />;
  }
}

export function EditorToolbar(props: EditorToolbarProps) {
  const [blockMenuOpen, setBlockMenuOpen] = createSignal(false);
  const [shapeMenuOpen, setShapeMenuOpen] = createSignal(false);
  const [shapeColor, setShapeColor] = createSignal<ShapeColor>("#5b9bd5");
  let blockMenu: HTMLDivElement | undefined;
  let blockTrigger: HTMLButtonElement | undefined;
  let shapeMenu: HTMLDivElement | undefined;
  let shapeTrigger: HTMLButtonElement | undefined;

  function closePopovers(): void {
    setBlockMenuOpen(false);
    setShapeMenuOpen(false);
  }

  onMount(() => {
    const closeMenuOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!blockMenu?.contains(target) && !blockTrigger?.contains(target)) {
        setBlockMenuOpen(false);
      }
      if (!shapeMenu?.contains(target) && !shapeTrigger?.contains(target)) {
        setShapeMenuOpen(false);
      }
    };
    const closeMenuWithEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const returnFocus = blockMenuOpen() ? blockTrigger : shapeMenuOpen() ? shapeTrigger : null;
      closePopovers();
      if (returnFocus) queueMicrotask(() => returnFocus.focus());
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
    setShapeMenuOpen(false);
    setBlockMenuOpen((open) => !open);
  }

  function toggleShapeMenu(): void {
    if (props.loading || props.sourceMode || props.shapeBusy || !props.ready) return;
    setBlockMenuOpen(false);
    setShapeMenuOpen((open) => !open);
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
            <p>Bloque</p>
            <div class={styles.blockGrid} role="group" aria-label="Formatos de texto">
              <For each={EDITOR_BLOCKS}>
                {(block) => (
                  <button
                    type="button"
                    class={styles.blockItem}
                    role="menuitem"
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
          ref={(element) => (shapeTrigger = element)}
          type="button"
          class={`${styles.button} ${shapeMenuOpen() ? styles.open : ""} ${props.shapeBusy ? styles.busy : ""}`}
          disabled={props.loading || props.shapeBusy || props.sourceMode || !props.ready}
          aria-label="Dibujar"
          aria-haspopup="menu"
          aria-controls="editor-shape-menu"
          aria-expanded={shapeMenuOpen()}
          title={props.ready ? "Dibujar" : "Preparando editor"}
          onClick={toggleShapeMenu}
        >
          <PencilIcon />
        </button>
        <Show when={shapeMenuOpen()}>
          <div
            ref={(element) => (shapeMenu = element)}
            id="editor-shape-menu"
            class={`${styles.menu} ${styles.shapePicker}`}
            role="menu"
            aria-label="Dibujar e insertar figuras"
          >
            <p>Figuras</p>
            <div class={styles.shapeGrid} role="group" aria-label="Tipos de figura">
              <For each={SHAPE_TOOLS}>
                {(tool) => (
                  <button
                    type="button"
                    class={styles.shapeTool}
                    role="menuitem"
                    disabled={props.shapeBusy}
                    aria-label={`Insertar ${tool.label.toLowerCase()}`}
                    title={tool.label}
                    onClick={() => {
                      closePopovers();
                      props.onInsertShape(tool.id, shapeColor());
                    }}
                  >
                    <ShapeToolIcon tool={tool.id} />
                  </button>
                )}
              </For>
            </div>
            <div class={styles.colors}>
              <span>Color</span>
              <div role="group" aria-label="Color de la figura">
                <For each={SHAPE_COLORS}>
                  {(color) => (
                    <button
                      type="button"
                      class={`${styles.colorButton} ${shapeColor() === color ? styles.active : ""}`}
                      style={`--shape-color: ${color}`}
                      role="menuitemradio"
                      aria-label={`Color ${color}`}
                      aria-checked={shapeColor() === color}
                      title={`Color ${color}`}
                      onClick={() => setShapeColor(color)}
                    />
                  )}
                </For>
              </div>
            </div>
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
      <button
        type="button"
        class={styles.button}
        disabled={props.loading || props.sourceMode || !props.ready}
        aria-label="Añadir bloque de texto"
        title="Añadir bloque de texto"
        onClick={props.onAddText}
      >
        <PlusIcon />
      </button>
      <span class="sr-only" role="status" aria-live="polite">
        {props.status}
      </span>
    </div>
  );
}
