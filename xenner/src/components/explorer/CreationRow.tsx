import { createSignal, onMount, Show } from "solid-js";

import styles from "../../styles/components/CreationRow.module.css";
import { FolderIcon, NoteIcon } from "../ui/Icons";

export type CreationKind = "note" | "folder";

interface CreationRowProps {
  kind: CreationKind;
  depth: number;
  busy: boolean;
  onSubmit(name: string): void;
  onCancel(): void;
}

export function CreationRow(props: CreationRowProps) {
  const [name, setName] = createSignal("");
  let input: HTMLInputElement | undefined;

  onMount(() => queueMicrotask(() => input?.focus()));

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (props.busy || !name().trim()) return;
    props.onSubmit(name().trim());
  }

  return (
    <form
      class={styles.row}
      style={`--tree-depth: ${props.depth}`}
      onSubmit={submit}
      role="group"
      aria-label={props.kind === "note" ? "Crear nota" : "Crear carpeta"}
    >
      <span class={styles.icon}>
        <Show when={props.kind === "note"} fallback={<FolderIcon />}>
          <NoteIcon />
        </Show>
      </span>
      <input
        ref={(element) => {
          input = element;
        }}
        class={styles.input}
        value={name()}
        placeholder={props.kind === "note" ? "nombre.md" : "Nombre de carpeta"}
        aria-label={props.kind === "note" ? "Nombre de la nota" : "Nombre de la carpeta"}
        disabled={props.busy}
        onInput={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            props.onCancel();
          }
        }}
        onBlur={() => {
          if (!name().trim()) props.onCancel();
        }}
      />
      <span class={styles.hint}>{props.busy ? "Creando…" : "Enter"}</span>
    </form>
  );
}
