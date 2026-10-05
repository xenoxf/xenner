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
  onShowHistory(path: string): void;
}

function destinationFor(target: ExplorerContextTarget): string {
  return target.kind === "root" ? "" : target.path;
}

/**
 * Los atajos del menú, escritos una vez y usados en las dos listas.
 *
 * El menú enseña el atajo de cada opción a la derecha, y ese atajo tiene que ser
 * el mismo que de verdad la dispara: dos listas con dos juegos de teclas distintos
 * es exactamente cómo un menú acaba enseñando un atajo que no funciona. Van aquí,
 * y no en cada entrada, porque son el contrato entre el menú y `handleKeyDown`.
 */
export const EXPLORER_SHORTCUTS = {
  newNote: "Ctrl+N",
  newFolder: "Ctrl+Shift+N",
  paste: "Ctrl+V",
  history: "Ctrl+H",
  copyMarkdown: "Ctrl+C",
  cut: "Ctrl+X",
  rename: "F2",
  remove: "Supr",
} as const;

export function ExplorerContextMenu(props: ExplorerContextMenuProps) {
  const [position, setPosition] = createSignal({ left: props.x, top: props.y });
  let menu: HTMLDivElement | undefined;

  function items(): MenuItem[] {
    if (props.target.kind === "note") {
      return [
        {
          label: "Últimos cambios",
          shortcut: EXPLORER_SHORTCUTS.history,
          action: () => props.onShowHistory(props.target.path),
        },
        {
          label: "Copiar Markdown",
          shortcut: EXPLORER_SHORTCUTS.copyMarkdown,
          action: () => props.onCopyMarkdown(props.target.path),
        },
        {
          label: "Cortar para mover",
          shortcut: EXPLORER_SHORTCUTS.cut,
          action: () => props.onCut(props.target.path),
        },
        {
          label: "Renombrar",
          shortcut: EXPLORER_SHORTCUTS.rename,
          action: () => props.onRename(props.target.path),
        },
        { separator: true, label: "" },
        {
          label: "Eliminar",
          shortcut: EXPLORER_SHORTCUTS.remove,
          danger: true,
          action: () => props.onDelete(props.target.path),
        },
      ];
    }

    const destination = destinationFor(props.target);
    const result: MenuItem[] = [
      {
        label: "Nueva nota",
        shortcut: EXPLORER_SHORTCUTS.newNote,
        action: () => props.onStartCreation("note", destination),
      },
      {
        label: "Nueva carpeta",
        shortcut: EXPLORER_SHORTCUTS.newFolder,
        action: () => props.onStartCreation("folder", destination),
      },
    ];
    if (props.canPaste) {
      result.push({
        label: "Pegar aquí",
        shortcut: EXPLORER_SHORTCUTS.paste,
        action: () => props.onPaste(destination),
      });
    }
    if (props.target.kind === "directory") {
      result.push(
        { separator: true, label: "" },
        {
          label: "Renombrar",
          shortcut: EXPLORER_SHORTCUTS.rename,
          action: () => props.onRename(props.target.path),
        },
        {
          label: "Eliminar",
          shortcut: EXPLORER_SHORTCUTS.remove,
          danger: true,
          action: () => props.onDelete(props.target.path),
        },
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

  /** La tecla tal y como se escribe en el atajo: «Ctrl+N», «Supr», «F2». */
function labelFor(key: string, command: boolean, shift: boolean): string {
    if (key === "Delete") return EXPLORER_SHORTCUTS.remove;
    if (key === "F2") return EXPLORER_SHORTCUTS.rename;
    if (!command) return "";
    const letra = key.toUpperCase();
    if (letra === "C") return EXPLORER_SHORTCUTS.copyMarkdown;
    if (letra === "X") return EXPLORER_SHORTCUTS.cut;
    if (letra === "V") return EXPLORER_SHORTCUTS.paste;
    if (letra === "N") return shift ? EXPLORER_SHORTCUTS.newFolder : EXPLORER_SHORTCUTS.newNote;
    if (letra === "H") return EXPLORER_SHORTCUTS.history;
    return "";
}

function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFromMenu();
      return;
    }
    const command = event.ctrlKey || event.metaKey;
    const candidate = labelFor(event.key, command, event.shiftKey);
    // Se busca en **la lista del menú**, y no en un montón de condiciones: así una
    // opción no puede enseñar un atajo que no hace nada, y una tecla no puede hacer
    // algo que el menú no enseña. Por eso las teclas del menú y las del menú están
    // en la misma tabla.
    const item = candidate
      ? items().find((entry) => !entry.separator && entry.shortcut === candidate)
      : undefined;
    if (item) {
      event.preventDefault();
      closeFromMenu();
      item.action?.();
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
