import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { foldForSearch, rankSearchNotes } from "../../workspace/search";
import type { NoteSearchEntry } from "../../workspace/search";
import styles from "../../styles/components/CommandPalette.module.css";
import { CloseIcon, SearchIcon } from "../ui/Icons";
import { ModalBackdrop } from "../ui/ModalBackdrop";

export interface PaletteCommand {
  id: string;
  label: string;
  /** Qué hace, en una línea: no repite la etiqueta. */
  hint?: string;
  /** El atajo, si lo tiene. Solo informativo: la paleta no los registra. */
  shortcut?: string;
  danger?: boolean;
  run(): void;
}

export interface CommandPaletteProps {
  /** Con qué empieza: la lista de notas o los comandos. */
  mode: "notes" | "commands";
  notes: NoteSearchEntry[];
  selectedPath: string | null;
  commands: PaletteCommand[];
  /** Abrir la nota elegida: es trabajo del padre, no de la paleta. */
  onSelectNote(path: string): void;
  onClose(): void;
}

/**
 * Ir a una nota o lanzar un comando sin tocar el ratón.
 *
 * Se abre con `Ctrl+K` (notas) o `Ctrl+Mayús+P` (comandos, que es lo que usan
 * los editores de código). Escribiendo `>` se pasa a comandos y borrándolo se
 * vuelve a notas: un solo sitio, dos modos, sin tener que acordarse de dos
 * atajos.
 *
 * Es un modal de la app (`data-x-modal="command-palette"`, ver SKIN_SPEC
 * §5.0.2) y se cierra al elegir, al pulsar `Escape` o al pinchar fuera.
 */
export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = createSignal(props.mode === "commands" ? ">" : "");
  const [active, setActive] = createSignal(0);
  let input: HTMLInputElement | undefined;
  let list: HTMLUListElement | undefined;
  const returnFocusTo = typeof document !== "undefined" ? document.activeElement : null;

  const commandMode = () => query().startsWith(">");
  const commandQuery = () => (commandMode() ? query().slice(1) : query());

  const matchingNotes = createMemo(() => {
    if (commandMode()) return [];
    return rankSearchNotes(props.notes, query());
  });

  const matchingCommands = createMemo(() => {
    if (!commandMode()) return [];
    const folded = foldForSearch(commandQuery().trim());
    if (!folded) return props.commands;
    return props.commands.filter((command) =>
      foldForSearch(command.label).includes(folded),
    );
  });

  const count = () => (commandMode() ? matchingCommands().length : matchingNotes().length);

  // Al cambiar lo escrito o de modo, se vuelve a la primera opción: si no, el
  // resaltado se quedaría apuntando a una fila que ya no existe.
  createEffect(() => {
    query();
    props.notes;
    props.commands;
    setActive(0);
  });

  // La opción activa siempre a la vista, aunque la lista tenga scroll.
  createEffect(() => {
    const index = active();
    list
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });

  onMount(() => queueMicrotask(() => input?.focus()));
  onCleanup(() => {
    if (returnFocusTo instanceof HTMLElement) returnFocusTo.focus();
  });

  function runCommand(command: PaletteCommand): void {
    props.onClose();
    command.run();
  }

  function runNote(path: string): void {
    props.onClose();
    props.onSelectNote(path);
  }

  function onInputKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const total = count();
      if (!total) return;
      setActive((current) =>
        event.key === "ArrowDown"
          ? (current + 1) % total
          : (current - 1 + total) % total,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (commandMode()) {
        const command = matchingCommands()[active()];
        if (command) runCommand(command);
      } else {
        const note = matchingNotes()[active()];
        if (note) runNote(note.path);
      }
    }
  }

  const listId = "command-palette-list";

  return (
    <ModalBackdrop class={styles.top} onBackdropPointerDown={props.onClose}>
      <div
        class={styles.palette}
        data-x="modal"
        data-x-modal="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={commandMode() ? "Comandos" : "Ir a una nota"}
      >
        <div class={styles.field}>
          <span class={styles.icon} aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={(element) => {
              input = element;
            }}
            class={styles.input}
            type="text"
            value={query()}
            placeholder={commandMode() ? "Escribe un comando…" : "Escribe el nombre de una nota…"}
            aria-label={commandMode() ? "Buscar un comando" : "Buscar una nota por su nombre"}
            aria-controls={listId}
            aria-activedescendant={count() > 0 ? `palette-option-${active()}` : undefined}
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={onInputKeyDown}
          />
          <Show when={query()}>
            <button
              type="button"
              class={styles.clear}
              aria-label="Borrar la búsqueda"
              title="Borrar la búsqueda"
              onClick={() => {
                setQuery(commandMode() ? ">" : "");
                input?.focus();
              }}
            >
              <CloseIcon />
            </button>
          </Show>
        </div>

        <Show
          when={count() > 0}
          fallback={
            <p class={styles.empty} role="status">
              {commandMode()
                ? "Ningún comando se llama así."
                : "Ninguna nota se llama así. Se busca sin tildes."}
            </p>
          }
        >
          <ul
            ref={(element) => {
              list = element;
            }}
            id={listId}
            class={styles.list}
            role="listbox"
            aria-label={commandMode() ? "Comandos" : "Notas"}
          >
            <Show when={!commandMode()}>
              <For each={matchingNotes()}>
                {(note, index) => (
                  <li
                    role="option"
                    id={`palette-option-${index()}`}
                    data-index={index()}
                    aria-selected={active() === index()}
                    class={`${styles.option} ${active() === index() ? styles.optionActive : ""}`}
                  >
                    <button
                      type="button"
                      class={styles.row}
                      tabindex={-1}
                      onClick={() => runNote(note.path)}
                      onMouseMove={() => setActive(index())}
                    >
                      <span class={styles.label}>{note.title}</span>
                      <Show when={note.path === props.selectedPath}>
                        <span class={styles.tag}>abierta</span>
                      </Show>
                      <span class={styles.path}>{note.path}</span>
                    </button>
                  </li>
                )}
              </For>
            </Show>
            <Show when={commandMode()}>
              <For each={matchingCommands()}>
                {(command, index) => (
                  <li
                    role="option"
                    id={`palette-option-${index()}`}
                    data-index={index()}
                    aria-selected={active() === index()}
                    class={`${styles.option} ${active() === index() ? styles.optionActive : ""} ${command.danger ? styles.optionDanger : ""}`}
                  >
                    <button
                      type="button"
                      class={styles.row}
                      tabindex={-1}
                      onClick={() => runCommand(command)}
                      onMouseMove={() => setActive(index())}
                    >
                      <span class={styles.label}>{command.label}</span>
                      <Show when={command.shortcut}>
                        <kbd class={styles.shortcut}>{command.shortcut}</kbd>
                      </Show>
                      <Show when={command.hint}>
                        <span class={styles.path}>{command.hint}</span>
                      </Show>
                    </button>
                  </li>
                )}
              </For>
            </Show>
          </ul>
        </Show>

        <p class={styles.footer}>
          <Show when={!commandMode()} fallback={<span>Borra el `&gt;` para volver a las notas.</span>}>
            <span>
              Escribe `&gt;` para ver los comandos. `↑↓` para moverte, `Enter` para abrir.
            </span>
          </Show>
        </p>
      </div>
    </ModalBackdrop>
  );
}
