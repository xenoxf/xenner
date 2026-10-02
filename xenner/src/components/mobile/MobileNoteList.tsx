import { createSignal, For, Show } from "solid-js";

import { noteTitleFromPath } from "../../workspace/note";
import styles from "../../styles/components/MobileNoteList.module.css";
import {
  ExplorerContextMenu,
  type ExplorerContextTarget,
} from "../explorer/ExplorerContextMenu";
import { CreationRow, type CreationKind } from "../explorer/CreationRow";
import type { CreationDraft } from "../explorer/Explorer";
import { DotsIcon, NoteIcon } from "../ui/Icons";
import { IconButton } from "../ui/IconButton";

export interface MobileNoteEntry {
  path: string;
  /** Nombre del archivo tal cual está en disco, con su `.md`. */
  name: string;
}

export interface MobileNoteListProps {
  /** Notas visibles, ya ordenadas y ya filtradas por el padre. */
  notes: readonly MobileNoteEntry[];
  loading: boolean;
  selectedPath: string | null;
  canPaste: boolean;
  /** Por qué la lista está vacía: cambia según si se busca o se filtra. */
  emptyMessage: string;
  emptyHint?: string;
  /** Creación en curso: la fila de escritura va aquí, nunca en el scroller de chips. */
  creation: CreationDraft | null;
  creating: boolean;
  onSubmitCreation(name: string): void;
  onCancelCreation(): void;
  onStartCreation(kind: CreationKind, parent: string): void;
  onSelect(path: string): void;
  onCopyMarkdown(path: string): void;
  onCut(path: string): void;
  onPaste(parent: string): void;
  onRename(path: string): void;
  onDelete(path: string): void;
  onShowHistory(path: string): void;
}

/**
 * Lista de notas de la vista móvil: una fila por nota, con el nombre sin la
 * extensión y su botón de acciones a la derecha.
 *
 * El botón abre el mismo `ExplorerContextMenu` del explorador de escritorio, con
 * su Portal y su ajuste a la pantalla; solo cambia de dónde sale la posición,
 * que aquí es el rectángulo del botón porque no hay clic derecho.
 */
export function MobileNoteList(props: MobileNoteListProps) {
  const [contextTarget, setContextTarget] = createSignal<ExplorerContextTarget | null>(null);
  const [contextPosition, setContextPosition] = createSignal({ x: 0, y: 0 });

  function closeContextMenu(): void {
    setContextTarget(null);
  }

  function openContextMenu(event: MouseEvent, note: MobileNoteEntry): void {
    event.preventDefault();
    event.stopPropagation();
    // Sin clic derecho, el ancla es el rectángulo del propio botón: el menú sale
    // de su esquina inferior derecha y `ExplorerContextMenu` lo recoloca dentro
    // de la pantalla si se saldría por abajo o por la derecha.
    const anchor = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const rect = anchor?.getBoundingClientRect();
    setContextPosition({
      x: rect ? rect.right : event.clientX,
      y: rect ? rect.bottom : event.clientY,
    });
    setContextTarget({ path: note.path, kind: "note", name: note.name });
  }

  return (
    <div
      class={`${styles.scroll} ${props.loading ? styles.loading : ""}`}
      data-x="mobile-note-list"
      data-x-mobile="note-list"
      aria-busy={props.loading}
    >
      <Show when={props.creation}>
        {(creation) => (
          <div class={styles.creation}>
            <CreationRow
              kind={creation().kind}
              depth={0}
              busy={props.creating}
              onSubmit={props.onSubmitCreation}
              onCancel={props.onCancelCreation}
            />
          </div>
        )}
      </Show>

      <Show
        when={props.notes.length > 0}
        fallback={
          <div class={styles.empty} data-x="mobile-note-empty">
            <NoteIcon />
            <strong>{props.emptyMessage}</strong>
            <span>{props.emptyHint}</span>
          </div>
        }
      >
        <ul class={styles.list} aria-label="Notas">
          <For each={props.notes}>
            {(note) => {
              const title = () => noteTitleFromPath(note.path);
              const selected = () => props.selectedPath === note.path;
              return (
                <li
                  class={`${styles.row} ${selected() ? styles.rowActive : ""}`}
                  data-x="mobile-note-row"
                  data-x-mobile="note-row"
                  data-selected={selected() ? "true" : undefined}
                >
                  <button
                    type="button"
                    class={styles.open}
                    aria-current={selected() ? "page" : undefined}
                    aria-label={`Abrir la nota ${title()}`}
                    onClick={() => props.onSelect(note.path)}
                  >
                    <span class={styles.icon} data-x="mobile-note-row-icon">
                      <NoteIcon />
                    </span>
                    <span class={styles.label}>{title()}</span>
                  </button>
                  <IconButton
                    size="small"
                    aria-label={`Acciones de ${title()}`}
                    title="Más acciones"
                    onClick={(event) => openContextMenu(event, note)}
                  >
                    <DotsIcon />
                  </IconButton>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>

      <Show when={contextTarget()} keyed>
        {(target) => (
          <ExplorerContextMenu
            target={target}
            x={contextPosition().x}
            y={contextPosition().y}
            canPaste={props.canPaste}
            onClose={closeContextMenu}
            onCopyMarkdown={props.onCopyMarkdown}
            onCut={props.onCut}
            onPaste={props.onPaste}
            onRename={props.onRename}
            onDelete={props.onDelete}
            onStartCreation={(kind, parent) => props.onStartCreation(kind, parent)}
            onShowHistory={props.onShowHistory}
          />
        )}
      </Show>
    </div>
  );
}