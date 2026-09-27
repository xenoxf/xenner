import { createMemo, For, onMount, Show } from "solid-js";

import styles from "../../styles/components/NoteHistoryPanel.module.css";
import {
  formatDelta,
  formatVersionTime,
  HISTORY_VERSIONS,
  type NoteVersion,
  versionDelta,
  versionPreview,
} from "../../workspace/history";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { CloseIcon } from "../ui/Icons";
import { ModalBackdrop } from "../ui/ModalBackdrop";

export interface NoteHistoryPanelProps {
  notePath: string;
  noteName: string;
  versions: NoteVersion[];
  /** Reloj de referencia para las etiquetas "hace X min". */
  now: number;
  busy?: boolean;
  onClose(): void;
  onRestore(version: NoteVersion): void;
}

export function NoteHistoryPanel(props: NoteHistoryPanelProps) {
  // `versions` llega de localStorage, así que se copia para que el contador
  // relativo no dependa de la identidad del array.
  const ordered = createMemo(() => [...props.versions].sort((a, b) => b.at - a.at));
  const isCurrent = (version: NoteVersion): boolean => version === ordered()[0];
  let dialog: HTMLDivElement | undefined;

  // El menú contextual que abre este panel tenía el foco; sin recuperarlo el
  // Tab se iría al documento de fondo y Escape no llegaría al panel.
  onMount(() => queueMicrotask(() => dialog?.focus()));

  return (
    <ModalBackdrop onBackdropPointerDown={props.onClose}>
      <div
        ref={(element) => (dialog = element)}
        class={styles.modal}
        data-x="modal"
        data-x-modal="history"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-history-title"
        tabindex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
      >
        <header class={styles.header}>
          <div>
            <p title={props.notePath}>{props.noteName}</p>
            <h2 id="note-history-title">Últimos cambios</h2>
          </div>
          <IconButton aria-label="Cerrar" onClick={props.onClose}>
            <CloseIcon />
          </IconButton>
        </header>

        <div class={styles.content}>
          <Show
            when={ordered().length > 0}
            fallback={
              <p class={styles.notice}>
                Todavía no hay versiones guardadas de esta nota. Se rellenan solas
                conforme se vaya guardando.
              </p>
            }
          >
            <ul class={styles.list}>
              <For each={ordered()}>
                {(version, index) => {
                  const previous = (): NoteVersion | null => ordered()[index() + 1] ?? null;
                  return (
                    <li class={styles.row}>
                      <div class={styles.rowLabel}>
                        <strong class={isCurrent(version) ? styles.current : undefined}>
                          {isCurrent(version)
                            ? "Actual"
                            : formatVersionTime(version.at, props.now)}
                        </strong>
                        <small>{versionPreview(version.body) || "Nota vacía"}</small>
                      </div>
                      <div class={styles.rowActions}>
                        <Show when={!isCurrent(version) && versionDelta(version, previous()) !== 0}>
                          <output>{formatDelta(versionDelta(version, previous()))}</output>
                        </Show>
                        <Show when={!isCurrent(version)}>
                          <Button
                            disabled={props.busy}
                            onClick={() => props.onRestore(version)}
                            title="Volver a escribir este contenido en el archivo"
                          >
                            Restaurar
                          </Button>
                        </Show>
                      </div>
                    </li>
                  );
                }}
              </For>
            </ul>
            <p class={styles.hint}>
              Hasta {HISTORY_VERSIONS} versiones por nota. El archivo <code>.md</code>{" "}
              sigue siendo la fuente de verdad.
            </p>
          </Show>
        </div>
      </div>
    </ModalBackdrop>
  );
}
