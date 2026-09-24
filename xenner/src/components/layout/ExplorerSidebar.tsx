import { Show } from "solid-js";

import type { VaultErrorShape, WorkspaceScan, WorkspaceTreeNode } from "../../types/workspace";
import { baseName } from "../../utils/paths";
import { CreationRow, type CreationKind } from "../explorer/CreationRow";
import { Explorer, type CreationDraft } from "../explorer/Explorer";
import { FolderOpenIcon, FolderPlusIcon, GearIcon, PlusIcon, RefreshIcon } from "../ui/Icons";
import { IconButton } from "../ui/IconButton";
import styles from "../../styles/components/ExplorerSidebar.module.css";

export interface ExplorerSidebarProps {
  workspace: WorkspaceScan | null;
  tree: WorkspaceTreeNode[];
  loading: boolean;
  canChooseWorkspace: boolean;
  error: VaultErrorShape | null;
  selectedPath: string | null;
  selectedTitle: string;
  expandedPaths: ReadonlySet<string>;
  creation: CreationDraft | null;
  creating: boolean;
  legacyNoteCount: number;
  legacyIssue: string | null;
  onChooseWorkspace(): void;
  onRefresh(): void;
  onOpenSettings(): void;
  onDismissError(): void;
  onImportLegacy(): void;
  onStartCreation(kind: CreationKind, parent?: string): void;
  onSubmitCreation(name: string): void;
  onCancelCreation(): void;
  onSelect(path: string): void;
  onToggle(path: string): void;
  onRename(path: string): void;
  onDelete(path: string): void;
}

export function ExplorerSidebar(props: ExplorerSidebarProps) {
  const root = () => props.workspace?.info.root ?? "";
  const noteCount = () => props.workspace?.info.noteCount ?? 0;

  return (
    <aside class={styles.sidebar} aria-label="Explorador de archivos">
      <header class={styles.header}>
        <div class={styles.titleRow}>
          <div class={styles.titleCopy}>
            <span>Explorador</span>
            <strong title={root()}>{baseName(root() || "Biblioteca")}</strong>
          </div>
          <div class={styles.windowActions}>
            <IconButton
              size="compact"
              disabled={!props.canChooseWorkspace}
              aria-label="Abrir otra biblioteca"
              title="Abrir carpeta"
              onClick={props.onChooseWorkspace}
            >
              <FolderOpenIcon />
            </IconButton>
            <IconButton
              size="compact"
              aria-label="Actualizar explorador"
              title="Actualizar"
              onClick={props.onRefresh}
            >
              <RefreshIcon />
            </IconButton>
            <IconButton
              size="compact"
              aria-label="Configuración"
              title="Configuración"
              onClick={props.onOpenSettings}
            >
              <GearIcon />
            </IconButton>
          </div>
        </div>
        <div class={styles.toolbar}>
          <button type="button" class={styles.primary} onClick={() => props.onStartCreation("note")}>
            <PlusIcon />
            <span>Nueva nota</span>
          </button>
          <IconButton
            size="compact"
            aria-label="Nueva carpeta"
            title="Nueva carpeta"
            onClick={() => props.onStartCreation("folder")}
          >
            <FolderPlusIcon />
          </IconButton>
          <span class={styles.count} title={`${noteCount()} notas`} aria-label={`${noteCount()} notas`}>
            {noteCount()}
          </span>
        </div>
      </header>

      <Show when={props.error}>
        {(error) => (
          <div class={styles.workspaceAlert} role="group" aria-label="Error de biblioteca">
            <div>
              <strong>{error().code === "conflict" ? "Conflicto" : "Biblioteca"}</strong>
              <span>{error().message}</span>
            </div>
            <button type="button" class={styles.textButton} onClick={props.onDismissError}>
              Descartar
            </button>
          </div>
        )}
      </Show>

      <Show when={props.legacyNoteCount > 0}>
        <div class={styles.legacyCard}>
          <div>
            <strong>Notas antiguas disponibles</strong>
            <span>{props.legacyNoteCount} notas de la versión local.</span>
          </div>
          <button type="button" class={styles.textButton} onClick={props.onImportLegacy}>
            Importar
          </button>
        </div>
      </Show>
      <Show when={props.legacyIssue}>
        {(message) => <p class={styles.legacyIssue}>{message()}</p>}
      </Show>

      <div
        class={`${styles.scroll} ${props.loading ? styles.loading : ""}`}
        aria-busy={props.loading}
      >
        <Show when={props.creation?.parent === ""}>
          <CreationRow
            kind={props.creation?.kind ?? "note"}
            depth={0}
            busy={props.creating}
            onSubmit={props.onSubmitCreation}
            onCancel={props.onCancelCreation}
          />
        </Show>
        <Show
          when={props.tree.length > 0}
          fallback={
            <Show when={!props.loading && props.creation === null}>
              <div class={styles.placeholder}>
                <FolderOpenIcon />
                <strong>Sin notas todavía</strong>
                <span>Crea una nota Markdown o abre una carpeta existente.</span>
              </div>
            </Show>
          }
        >
          <Explorer
            nodes={props.tree}
            selectedPath={props.selectedPath}
            selectedTitle={props.selectedTitle}
            expandedPaths={props.expandedPaths}
            creation={props.creation}
            busy={props.creating}
            onSelect={props.onSelect}
            onToggle={props.onToggle}
            onStartCreation={props.onStartCreation}
            onSubmitCreation={props.onSubmitCreation}
            onCancelCreation={props.onCancelCreation}
            onRename={props.onRename}
            onDelete={props.onDelete}
          />
        </Show>
      </div>

      <footer class={styles.footer}>
        <strong>xenner</strong>
        <span title={root()}>
          {props.workspace?.info.truncated ? "Explorer limitado" : "Markdown local"}
        </span>
      </footer>
    </aside>
  );
}
