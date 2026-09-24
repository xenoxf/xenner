import {
  createMemo,
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
  PencilIcon,
  QuoteIcon,
  TextIcon,
} from "../ui/Icons";

type InsertId = EditorBlockType | "image" | "whiteboard";

interface EditorToolbarProps {
  loading: boolean;
  ready: boolean;
  imageBusy: boolean;
  whiteboardBusy: boolean;
  status: string;
  onApplyBlock(type: EditorBlockType): void;
  onChooseImage(): void;
  onInsertWhiteboard(tool: DrawingTool): void;
}

interface InsertItem {
  id: InsertId;
  label: string;
  group: "Texto" | "Insertar";
  keywords: string;
}

const INSERT_ITEMS: readonly InsertItem[] = [
  ...EDITOR_BLOCKS.map((item) => ({
    id: item.id,
    label: item.label,
    group: "Texto" as const,
    keywords: item.label.toLocaleLowerCase("es"),
  })),
  {
    id: "image",
    label: "Imagen",
    group: "Insertar",
    keywords: "imagen foto archivo png jpg jpeg webp",
  },
  {
    id: "whiteboard",
    label: "Pizarra",
    group: "Insertar",
    keywords: "pizarra dibujo lienzo trazo formas svg",
  },
];

function ItemIcon(props: { id: InsertId }) {
  if (props.id === "paragraph") return <TextIcon />;
  if (props.id === "heading1" || props.id === "heading2" || props.id === "heading3") return <HeadingIcon />;
  if (props.id === "bullet") return <BulletListIcon />;
  if (props.id === "ordered") return <OrderedListIcon />;
  if (props.id === "quote") return <QuoteIcon />;
  if (props.id === "image") return <ImageIcon />;
  return <PencilIcon />;
}

export function EditorToolbar(props: EditorToolbarProps) {
  const [insertOpen, setInsertOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  let insertMenu: HTMLDivElement | undefined;
  let insertTrigger: HTMLButtonElement | undefined;
  let searchInput: HTMLInputElement | undefined;

  const visibleItems = createMemo(() => {
    const normalized = query().trim().toLocaleLowerCase("es");
    if (!normalized) return INSERT_ITEMS;
    return INSERT_ITEMS.filter((item) => item.keywords.includes(normalized));
  });
  const groupedItems = createMemo(() => {
    const items = visibleItems();
    return [
      { label: "Texto" as const, items: items.filter((item) => item.group === "Texto") },
      { label: "Insertar" as const, items: items.filter((item) => item.group === "Insertar") },
    ].filter((group) => group.items.length > 0);
  });

  function closeMenu(restoreFocus = true): void {
    setInsertOpen(false);
    setQuery("");
    setActiveIndex(0);
    if (restoreFocus) queueMicrotask(() => insertTrigger?.focus());
  }

  function openMenu(): void {
    if (props.loading || !props.ready) return;
    setInsertOpen(true);
    setQuery("");
    setActiveIndex(0);
    queueMicrotask(() => {
      insertMenu?.querySelector<HTMLButtonElement>("[role='option']")?.focus({ preventScroll: true });
    });
  }

  function runItem(item: InsertItem): void {
    closeMenu(false);
    if (item.id === "image") props.onChooseImage();
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
    const items = visibleItems();
    if (!items.length) return;
    let next = index;
    if (event.key === "ArrowDown") {
      next = event.currentTarget === searchInput ? 0 : (index + 1) % items.length;
    }
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
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
      aria-orientation="horizontal"
      aria-label="Acciones del editor"
      onKeyDown={(event) => moveToolbarFocus(event, event.currentTarget)}
    >
      <div class={styles.anchor}>
        <button
          ref={(element) => (insertTrigger = element)}
          type="button"
          class={`${styles.button} ${insertOpen() ? styles.open : ""}`}
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
            <div class={styles.menuSearch}>
              <SearchIcon />
              <input
                ref={(element) => (searchInput = element)}
                type="search"
                value={query()}
                placeholder="Buscar bloque…"
                aria-label="Buscar bloque"
                onInput={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveMenuFocus(event, 0);
                  } else if (event.key === "Enter" && visibleItems()[0]) {
                    event.preventDefault();
                    runItem(visibleItems()[0]);
                  }
                }}
              />
            </div>
            <Show when={visibleItems().length > 0} fallback={<p class={styles.emptyMenu}>No hay coincidencias</p>}>
              <For each={groupedItems()}>
                {(group) => (
                  <section class={styles.menuGroup} role="group" aria-label={group.label}>
                    <p>{group.label}</p>
                    <For each={group.items}>
                      {(item) => {
                        const index = () => visibleItems().findIndex((candidate) => candidate.id === item.id);
                        return (
                          <button
                            type="button"
                            class={`${styles.menuItem} ${activeIndex() === index() ? styles.menuItemActive : ""}`}
                            role="option"
                            aria-selected={activeIndex() === index()}
                            tabIndex={activeIndex() === index() ? 0 : -1}
                            onPointerEnter={() => setActiveIndex(index())}
                            onClick={() => runItem(item)}
                            onKeyDown={(event) => moveMenuFocus(event, index())}
                          >
                            <span class={styles.menuIcon}><ItemIcon id={item.id} /></span>
                            <span>{item.label}</span>
                            {item.id === "whiteboard" && <small>Dibuja con el lápiz</small>}
                          </button>
                        );
                      }}
                    </For>
                  </section>
                )}
              </For>
            </Show>
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
      <span class="sr-only" role="status" aria-live="polite">{props.status}</span>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
