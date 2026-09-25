import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";

import styles from "../../styles/components/ExplorerContextMenu.module.css";
import type { CreationKind } from "./CreationRow";

export type ExplorerContextKind = "note" | "directory" | "root";

export interface ExplorerContextTarget {
  path: string;
  kind: ExplorerContextKind;
  name: string;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  action?: () => void;
  separator?: boolean;
}

export interface ExplorerContextMenuProps {
  target: ExplorerContextTarget;
  x: number;
  y: number;
  canPaste: boolean;
  onClose(): void;
  onCopyMarkdown(path: string): void;
  onCut(path: string): void;
  onPaste(parent: string): void;
  onRename(path: string): void;
  onDelete(path: string): void;
  onStartCreation(kind: CreationKind, parent: string): void;
}

function destinationFor(target: ExplorerContextTarget): string {
  return target.kind === "root" ? "" : target.path;
}

export function ExplorerContextMenu(props: ExplorerContextMenuProps) {
  const [position, setPosition] = createSignal({ left: props.x, top: props.y });
  let menu: HTMLDivElement | undefined;

  function items(): MenuItem[] {
    if (props.target.kind === "note") {
      return [
        { label: "Copiar Markdown", shortcut: "Ctrl+C", action: () => props.onCopyMarkdown(props.target.path) },
        { label: "Cortar para mover", shortcut: "Ctrl+X", action: () => props.onCut(props.target.path) },
        { label: "Renombrar", shortcut: "F2", action: () => props.onRename(props.target.path) },
        { separator: true, label: "" },
        { label: "Eliminar", shortcut: "Supr", danger: true, action: () => props.onDelete(props.target.path) },
      ];
    }

    const destination = destinationFor(props.target);
    const result: MenuItem[] = [
      { label: "Nueva nota", action: () => props.onStartCreation("note", destination) },
      { label: "Nueva carpeta", action: () => props.onStartCreation("folder", destination) },
    ];
    if (props.canPaste) {
      result.push({ label: "Pegar aquí", shortcut: "Ctrl+V", action: () => props.onPaste(destination) });
    }
    if (props.target.kind === "directory") {
      result.push(
        { separator: true, label: "" },
        { label: "Renombrar", shortcut: "F2", action: () => props.onRename(props.target.path) },
        { label: "Eliminar", shortcut: "Supr", danger: true, action: () => props.onDelete(props.target.path) },
      );
    }
    return result;
  }

  function fitPosition(): void {
    if (!menu || typeof window === "undefined") return;
    const margin = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    setPosition({
      left: Math.max(margin, Math.min(props.x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(props.y, window.innerHeight - height - margin)),
    });
  }

  function closeFromMenu(): void {
    props.onClose();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFromMenu();
      return;
    }
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === "c" && props.target.kind === "note") {
      event.preventDefault();
      closeFromMenu();
      props.onCopyMarkdown(props.target.path);
      return;
    }
    if (command && event.key.toLowerCase() === "x" && props.target.kind !== "root") {
      event.preventDefault();
      closeFromMenu();
      props.onCut(props.target.path);
      return;
    }
    if (command && event.key.toLowerCase() === "v" && props.canPaste) {
      event.preventDefault();
      closeFromMenu();
      const parent = props.target.kind === "note"
        ? (props.target.path.includes("/")
          ? props.target.path.slice(0, props.target.path.lastIndexOf("/"))
          : "")
        : destinationFor(props.target);
      props.onPaste(parent);
      return;
    }
    if (event.key === "F2" && props.target.kind !== "root") {
      event.preventDefault();
      closeFromMenu();
      props.onRename(props.target.path);
      return;
    }
    if (event.key === "Delete" && props.target.kind !== "root") {
      event.preventDefault();
      closeFromMenu();
      props.onDelete(props.target.path);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const controls = [...menu!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = controls.length - 1;
    else if (event.key === "ArrowDown") next = (Math.max(current, 0) + 1) % controls.length;
    else next = (Math.max(current, 0) - 1 + controls.length) % controls.length;
    event.preventDefault();
    controls[next]?.focus();
  }

  onMount(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !menu?.contains(event.target)) closeFromMenu();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    onCleanup(() => document.removeEventListener("pointerdown", onPointerDown, true));
    queueMicrotask(() => {
      fitPosition();
      menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
  });

  createEffect(() => {
    props.x;
    props.y;
    queueMicrotask(fitPosition);
  });

  return (
    <Portal>
      <div
        ref={(element) => (menu = element)}
        class={styles.menu}
        role="menu"
        aria-label="Acciones del explorador"
        style={`left: ${position().left}px; top: ${position().top}px;`}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={handleKeyDown}
      >
        <For each={items()}>
          {(item) =>
            item.separator ? (
              <div class={styles.separator} role="separator" />
            ) : (
              <button
                type="button"
                role="menuitem"
                class={`${styles.item} ${item.danger ? styles.danger : ""}`}
                disabled={item.disabled}
                onClick={() => {
                  closeFromMenu();
                  item.action?.();
                }}
              >
                <span>{item.label}</span>
                <ShowShortcut value={item.shortcut} />
              </button>
            )
          }
        </For>
      </div>
    </Portal>
  );
}

function ShowShortcut(props: { value?: string }) {
  return props.value ? <kbd>{props.value}</kbd> : null;
}
