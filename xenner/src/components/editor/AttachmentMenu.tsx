import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

import type { AttachmentMenuTarget } from "../../editor/extensions/note-attachment.ts";
import styles from "../../styles/components/AttachmentMenu.module.css";

export interface AttachmentMenuProps {
  target: AttachmentMenuTarget;
  x: number;
  y: number;
  onClose(): void;
}

interface MenuEntry {
  label: string;
  shortcut: string;
  action?(): void;
  /** Una raya entre grupos: no hace nada y no tiene tecla. */
  separator?: true;
  danger?: boolean;
}

/**
 * Los atajos de la tarjeta, en un solo sitio.
 *
 * Se escriben aquí y el menú los recorre **buscando en su propia lista**, igual
 * que hace el del explorador: una opción no puede enseñar una tecla que no haga
 * nada, porque la tecla y la tecla que se ejecuta son el mismo dato.
 */
export const ATTACHMENT_SHORTCUTS = {
  open: "Ctrl+O",
  reveal: "Ctrl+Shift+O",
  copyPath: "Ctrl+C",
  copyMarkdown: "Ctrl+Shift+C",
} as const;

const MARGEN = 8;

/**
 * El menú de una tarjeta de adjunto, como el de un chat.
 *
 * Sale del clic derecho sobre la tarjeta y hace lo mismo que hacen allí: abrir el
 * archivo, mostrarlo en la carpeta, y copiarse la ruta o el enlace. «Abrir como…»
 * **no** está, y no por descuido: no hay manera honesta de hacerlo desde una app
 * sin que el sistema muestre su propio diálogo —Windows y macOS no lo ofrecen por
 * línea de órdenes—, y Preferencias > Archivos > Aplicaciones es el camino de
 * verdad. En su lugar está «Mostrar en la carpeta», que deja el archivo a un clic
 * de abrirse con lo que se elija.
 */
export function AttachmentMenu(props: AttachmentMenuProps) {
  const [position, setPosition] = createSignal({ left: props.x, top: props.y });
  let menu: HTMLDivElement | undefined;

  const entries = (): MenuEntry[] => [
    { label: "Abrir", shortcut: ATTACHMENT_SHORTCUTS.open, action: props.target.open },
    {
      label: "Mostrar en la carpeta",
      shortcut: ATTACHMENT_SHORTCUTS.reveal,
      action: props.target.reveal,
    },
    { separator: true, label: "", shortcut: "" },
    {
      label: "Copiar la ruta",
      shortcut: ATTACHMENT_SHORTCUTS.copyPath,
      action: props.target.copyPath,
    },
    {
      label: "Copiar el enlace Markdown",
      shortcut: ATTACHMENT_SHORTCUTS.copyMarkdown,
      action: props.target.copyMarkdown,
    },
  ];

  /** La tecla tal y como se escribe en el atajo. */
  function labelFor(key: string, command: boolean, shift: boolean): string {
    if (!command) return "";
    const letra = key.toUpperCase();
    if (letra === "O") return shift ? ATTACHMENT_SHORTCUTS.reveal : ATTACHMENT_SHORTCUTS.open;
    if (letra === "C") {
      return shift ? ATTACHMENT_SHORTCUTS.copyMarkdown : ATTACHMENT_SHORTCUTS.copyPath;
    }
    return "";
  }

  /** Un menú que se sale de la ventana no es un menú: se coloca dentro. */
  function fitPosition(): void {
    if (!menu || typeof window === "undefined") return;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    setPosition({
      left: Math.max(MARGEN, Math.min(props.x, window.innerWidth - width - MARGEN)),
      top: Math.max(MARGEN, Math.min(props.y, window.innerHeight - height - MARGEN)),
    });
  }

  function choose(entry: MenuEntry): void {
    if (entry.separator) return;
    props.onClose();
    entry.action?.();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    const candidate = labelFor(event.key, event.ctrlKey || event.metaKey, event.shiftKey);
    const entry = candidate
      ? entries().find((item) => !item.separator && item.shortcut === candidate)
      : undefined;
    if (entry) {
      event.preventDefault();
      choose(entry);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const botones = [...menu!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (!botones.length) return;
    const current = botones.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = botones.length - 1;
    else if (event.key === "ArrowDown") next = (Math.max(current, 0) + 1) % botones.length;
    else next = (Math.max(current, 0) - 1 + botones.length) % botones.length;
    event.preventDefault();
    botones[next]?.focus();
  }

  onMount(() => {
    const fuera = (event: PointerEvent): void => {
      if (event.target instanceof Node && !menu?.contains(event.target)) props.onClose();
    };
    document.addEventListener("pointerdown", fuera, true);
    onCleanup(() => document.removeEventListener("pointerdown", fuera, true));
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
        aria-label={`Acciones de ${props.target.label}`}
        style={`left: ${position().left}px; top: ${position().top}px;`}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={handleKeyDown}
      >
        <Show when={props.target.label}>
          <p class={styles.heading} aria-hidden="true">
            {props.target.label}
          </p>
        </Show>
        <For each={entries()}>
          {(entry) =>
            entry.separator ? (
              <div class={styles.separator} role="separator" />
            ) : (
              <button
                type="button"
                role="menuitem"
                class={`${styles.item}${entry.danger ? ` ${styles.danger}` : ""}`}
                onClick={() => choose(entry)}
              >
                <span>{entry.label}</span>
                <kbd>{entry.shortcut}</kbd>
              </button>
            )
          }
        </For>
      </div>
    </Portal>
  );
}