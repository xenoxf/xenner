import { Show } from "solid-js";

import { sidebarWidthVariable } from "../../services/sidebarLayout";
import type { VaultErrorShape, WorkspaceScan, WorkspaceTreeNode } from "../../types/workspace";
import { CreationRow, type CreationKind } from "../explorer/CreationRow";
import { Explorer, type CreationDraft } from "../explorer/Explorer";
import { FolderOpenIcon, FolderPlusIcon, PlusIcon, RefreshIcon } from "../ui/Icons";
import { IconButton } from "../ui/IconButton";
import { SidebarResizer } from "./SidebarResizer";
import styles from "../../styles/components/ExplorerSidebar.module.css";

export interface ExplorerSidebarProps {
  workspace: WorkspaceScan | null;
  tree: WorkspaceTreeNode[];
  loading: boolean;
  canChooseWorkspace: boolean;
  error: VaultErrorShape | null;
  selectedPath: string | null;
  expandedPaths: ReadonlySet<string>;
  creation: CreationDraft | null;
  creating: boolean;
  canPaste: boolean;
  legacyNoteCount: number;
  legacyIssue: string | null;
  /** El ancho elegido al arrastrar el tirador, o `null` para el de la hoja CSS. */
  width: number | null;
  onWidthChange(width: number | null): void;
  onChooseWorkspace(): void;
  onRefresh(): void;
  onDismissError(): void;
  onImportLegacy(): void;
  onStartCreation(kind: CreationKind, parent?: string): void;
  onSubmitCreation(name: string): void;
  onCancelCreation(): void;
  onSelect(path: string): void;
  onToggle(path: string): void;
  onRename(path: string): void;
  onDelete(path: string): void;
  onMove(path: string, targetParent: string): void;
  onCopyMarkdown(path: string): void;
  onCut(path: string): void;
  onPaste(parent: string): void;
  onShowHistory(path: string): void;
}

export function ExplorerSidebar(props: ExplorerSidebarProps) {
  const root = () => props.workspace?.info.root ?? "";
  const noteCount = () => props.workspace?.info.noteCount ?? 0;

  return (
    <aside
      class={styles.sidebar}
      /*
       * El ancho llega como variable en vez de como `width` en la hoja: si se
       * escribiera el ancho aquí, el `clamp()` de la hoja —y con él el
       * comportamiento en ventanas estrechas— dejaría de mandar cuando no hay
       * ancho elegido. Es un detalle de una línea que evita tener dos reglas
       * compitiendo por la misma propiedad.
       */
      style={sidebarWidthVariable(props.width)}
      data-x="sidebar"
      aria-label="Explorador de archivos"
    >
      {/*
        La cabecera es la del panel: el nombre de la sección a la izquierda y sus
        acciones a la derecha. El engranaje no vive aquí porque la configuración
        está al pie de la barra de secciones (`ActivityBar`), que es donde se
        busca en un editor de código y donde se encuentra aquí.
      */}
      <header class={styles.header} data-x="sidebar-header">
        <div class={styles.titleRow}>
          <div class={styles.titleCopy}>
            <strong>Notas</strong>
          </div>
          <div class={styles.windowActions} data-x="sidebar-window-actions">
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
          </div>
        </div>
        <div class={styles.toolbar} data-x="sidebar-toolbar">
          <button type="button" class={styles.primary} data-x="button" data-x-role="primary" onClick={() => props.onStartCreation("note")}>
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
          <span
            class={styles.count}
            data-x="sidebar-count"
            title={`${noteCount()} ${noteCount() === 1 ? "nota" : "notas"}`}
            aria-label={`${noteCount()} ${noteCount() === 1 ? "nota" : "notas"}`}
          >
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
        data-x="tree"
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
            expandedPaths={props.expandedPaths}
            creation={props.creation}
            busy={props.creating}
            canPaste={props.canPaste}
            onSelect={props.onSelect}
            onToggle={props.onToggle}
            onStartCreation={props.onStartCreation}
            onSubmitCreation={props.onSubmitCreation}
            onCancelCreation={props.onCancelCreation}
            onRename={props.onRename}
            onDelete={props.onDelete}
            onMove={props.onMove}
            onCopyMarkdown={props.onCopyMarkdown}
            onCut={props.onCut}
            onPaste={props.onPaste}
            onShowHistory={props.onShowHistory}
          />
        </Show>
      </div>

      <footer class={styles.footer}>
        <strong>xenner</strong>
        {/* La carpeta de la biblioteca, que antes solo vivía en el `title` del
            título y no se veía. Aquí se lee sin pasar el ratón por encima. */}
        <Show when={root()}>
          <span title={root()}>{root()}</span>
        </Show>
      </footer>

      <SidebarResizer width={props.width} onWidthChange={props.onWidthChange} />
    </aside>
  );
}
