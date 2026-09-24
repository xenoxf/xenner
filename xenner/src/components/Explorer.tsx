import { For, Show } from "solid-js";

import {
  ChevronIcon,
  FolderIcon,
  FolderPlusIcon,
  NoteIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "./Icons";
import { CreationRow, type CreationKind } from "./CreationRow";
import type { WorkspaceTreeNode } from "../workspace/tree";

export interface CreationDraft {
  kind: CreationKind;
  parent: string;
}

interface ExplorerProps {
  nodes: WorkspaceTreeNode[];
  selectedPath: string | null;
  selectedTitle: string;
  expandedPaths: ReadonlySet<string>;
  creation: CreationDraft | null;
  busy: boolean;
  onSelect(path: string): void;
  onToggle(path: string): void;
  onStartCreation(kind: CreationKind, parent: string): void;
  onSubmitCreation(name: string): void;
  onCancelCreation(): void;
  onRename(path: string): void;
  onDelete(path: string): void;
}

interface NodeProps extends ExplorerProps {
  node: WorkspaceTreeNode;
  depth: number;
}

function displayNodeName(name: string, kind: WorkspaceTreeNode["kind"]): string {
  if (kind !== "note") return name;
  const title = name.replace(/\.md$/i, "");
  return /^Sin título(?: \d+)?$/i.test(title) ? "Sin título" : title;
}

function ExplorerNode(props: NodeProps) {
  const expanded = () => props.expandedPaths.has(props.node.path);
  const activeCreation = () =>
    props.creation?.parent === props.node.path ? props.creation : null;
  const hasCreation = () => activeCreation() !== null;
  const label = () =>
    props.node.path === props.selectedPath
      ? props.selectedTitle.trim() || "Sin título"
      : displayNodeName(props.node.name, props.node.kind);

  return (
    <div class="explorer-node" role="treeitem" aria-expanded={props.node.kind === "directory" ? expanded() : undefined}>
      <div
        class="explorer-row"
        classList={{ active: props.node.path === props.selectedPath, folder: props.node.kind === "directory" }}
        style={`--tree-depth: ${props.depth}`}
      >
        <button
          type="button"
          class="explorer-main"
          aria-label={props.node.kind === "directory" ? `Abrir carpeta ${label()}` : `Abrir nota ${label()}`}
          aria-current={props.node.path === props.selectedPath ? "page" : undefined}
          onClick={() => {
            if (props.node.kind === "directory") props.onToggle(props.node.path);
            else props.onSelect(props.node.path);
          }}
        >
          <span class="explorer-chevron">
            <Show when={props.node.kind === "directory"}>
              <ChevronIcon classList={{ rotated: expanded() }} />
            </Show>
          </span>
          <span class="explorer-icon">
            <Show when={props.node.kind === "directory"} fallback={<NoteIcon />}>
              <FolderIcon />
            </Show>
          </span>
          <span class="explorer-name">{label()}</span>
        </button>
        <div class="explorer-actions">
          <Show when={props.node.kind === "directory"}>
            <button
              type="button"
              class="icon-button"
              aria-label={`Crear nota en ${label()}`}
              title="Nueva nota"
              onClick={() => props.onStartCreation("note", props.node.path)}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              class="icon-button"
              aria-label={`Crear carpeta en ${label()}`}
              title="Nueva carpeta"
              onClick={() => props.onStartCreation("folder", props.node.path)}
            >
              <FolderPlusIcon />
            </button>
          </Show>
          <Show when={props.node.kind === "directory"}>
            <button
              type="button"
              class="icon-button"
              aria-label={`Renombrar ${label()}`}
              title="Renombrar"
              onClick={() => props.onRename(props.node.path)}
            >
              <PencilIcon />
            </button>
          </Show>
          <button
            type="button"
            class="icon-button danger"
            aria-label={`Eliminar ${label()}`}
            title="Eliminar"
            onClick={() => props.onDelete(props.node.path)}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
      <Show when={props.node.kind === "directory" && expanded()}>
        <div class="explorer-children" role="group">
          <Show when={hasCreation()}>
            <CreationRow
              kind={activeCreation()!.kind}
              depth={props.depth + 1}
              busy={props.busy}
              onSubmit={props.onSubmitCreation}
              onCancel={props.onCancelCreation}
            />
          </Show>
          <For each={props.node.children}>
            {(child) => <ExplorerNode {...props} node={child} depth={props.depth + 1} />}
          </For>
          <Show when={props.node.children.length === 0 && !hasCreation()}>
            <p class="explorer-empty" style={`--tree-depth: ${props.depth + 1}`}>
              Vacía
            </p>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export function Explorer(props: ExplorerProps) {
  return (
    <div class="explorer-tree" role="tree" aria-label="Explorador de notas">
      <For each={props.nodes}>
        {(node) => <ExplorerNode {...props} node={node} depth={0} />}
      </For>
    </div>
  );
}
