import { createSignal, For, Show } from "solid-js";

import type { WorkspaceTreeNode } from "../../types/workspace";
import styles from "../../styles/components/Explorer.module.css";
import { IconButton } from "../ui/IconButton";
import {
  ChevronIcon,
  FolderIcon,
  FolderPlusIcon,
  NoteIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../ui/Icons";
import { CreationRow, type CreationKind } from "./CreationRow";
import {
  ExplorerContextMenu,
  type ExplorerContextTarget,
} from "./ExplorerContextMenu";

export interface CreationDraft {
  kind: CreationKind;
  parent: string;
}

interface ExplorerProps {
  nodes: WorkspaceTreeNode[];
  selectedPath: string | null;
  expandedPaths: ReadonlySet<string>;
  creation: CreationDraft | null;
  busy: boolean;
  canPaste: boolean;
  onSelect(path: string): void;
  onToggle(path: string): void;
  onStartCreation(kind: CreationKind, parent: string): void;
  onSubmitCreation(name: string): void;
  onCancelCreation(): void;
  onRename(path: string): void;
  onDelete(path: string): void;
  onMove(path: string, targetParent: string): void;
  onCopyMarkdown(path: string): void;
  onCut(path: string): void;
  onPaste(parent: string): void;
}

interface NodeProps extends ExplorerProps {
  node: WorkspaceTreeNode;
  depth: number;
  onDragStart(event: DragEvent, node: WorkspaceTreeNode): void;
  onDragEnd(): void;
  onDragOver(event: DragEvent, targetParent: string): void;
  onDrop(event: DragEvent, targetParent: string): void;
  onContextMenu(event: MouseEvent, node: WorkspaceTreeNode): void;
  draggingPath(): string | null;
  dropTarget(): string | null;
}

function displayNodeName(name: string, kind: WorkspaceTreeNode["kind"]): string {
  if (kind !== "note") return name;
  return name.replace(/\.md$/i, "");
}

function findNode(nodes: WorkspaceTreeNode[], path: string): WorkspaceTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const child = findNode(node.children, path);
    if (child) return child;
  }
  return null;
}

function ExplorerNode(props: NodeProps) {
  const expanded = () => props.expandedPaths.has(props.node.path);
  const activeCreation = () =>
    props.creation?.parent === props.node.path ? props.creation : null;
  const hasCreation = () => activeCreation() !== null;
  const label = () => displayNodeName(props.node.name, props.node.kind);
  const selected = () => props.node.path === props.selectedPath;
  const isDropTarget = () => props.dropTarget() === props.node.path;
  const isDragging = () => props.draggingPath() === props.node.path;

  return (
    <div
      class={styles.node}
      role="treeitem"
      aria-expanded={props.node.kind === "directory" ? expanded() : undefined}
    >
      <div
        class={`${styles.row} ${selected() ? styles.active : ""} ${isDropTarget() ? styles.dropTarget : ""} ${isDragging() ? styles.dragging : ""}`}
        style={`--tree-depth: ${props.depth}`}
        onContextMenu={(event) => props.onContextMenu(event, props.node)}
        onDragOver={(event) => {
          if (props.node.kind === "directory") {
            props.onDragOver(event, props.node.path);
          } else {
            event.stopPropagation();
          }
        }}
        onDrop={(event) => {
          if (props.node.kind === "directory") {
            props.onDrop(event, props.node.path);
          } else {
            event.stopPropagation();
          }
        }}
      >
        <button
          type="button"
          class={styles.main}
          draggable={true}
          aria-grabbed={isDragging()}
          aria-label={props.node.kind === "directory" ? `Abrir carpeta ${label()}` : `Abrir nota ${label()}`}
          aria-current={selected() ? "page" : undefined}
          onClick={() => {
            if (props.node.kind === "directory") props.onToggle(props.node.path);
            else props.onSelect(props.node.path);
          }}
          onDragStart={(event) => props.onDragStart(event, props.node)}
          onDragEnd={props.onDragEnd}
        >
          <span class={styles.chevron}>
            <Show when={props.node.kind === "directory"}>
              <ChevronIcon classList={{ [styles.rotated]: expanded() }} />
            </Show>
          </span>
          <span class={styles.icon}>
            <Show when={props.node.kind === "directory"} fallback={<NoteIcon />}>
              <FolderIcon />
            </Show>
          </span>
          <span class={styles.name}>{label()}</span>
        </button>
        <Show when={props.node.kind === "directory" || !selected()}>
          <div class={styles.actions}>
            <Show when={props.node.kind === "directory"}>
              <IconButton
                size="small"
                aria-label={`Crear nota en ${label()}`}
                title="Nueva nota"
                onClick={() => props.onStartCreation("note", props.node.path)}
              >
                <PlusIcon />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Crear carpeta en ${label()}`}
                title="Crear carpeta"
                onClick={() => props.onStartCreation("folder", props.node.path)}
              >
                <FolderPlusIcon />
              </IconButton>
            </Show>
            <IconButton
              size="small"
              aria-label={`Renombrar ${label()}`}
              title="Renombrar"
              onClick={() => props.onRename(props.node.path)}
            >
              <PencilIcon />
            </IconButton>
            <IconButton
              size="small"
              tone="danger"
              aria-label={`Eliminar ${label()}`}
              title="Eliminar"
              onClick={() => props.onDelete(props.node.path)}
            >
              <TrashIcon />
            </IconButton>
          </div>
        </Show>
      </div>
      <Show when={props.node.kind === "directory" && expanded()}>
        <div role="group">
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
            <p class={styles.empty} style={`--tree-depth: ${props.depth + 1}`}>
              Vacía
            </p>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export function Explorer(props: ExplorerProps) {
  const [contextTarget, setContextTarget] = createSignal<ExplorerContextTarget | null>(null);
  const [contextPosition, setContextPosition] = createSignal({ x: 0, y: 0 });
  const [draggingPath, setDraggingPath] = createSignal<string | null>(null);
  const [dropTarget, setDropTarget] = createSignal<string | null>(null);

  function closeContextMenu(): void {
    setContextTarget(null);
  }

  function openContextMenu(event: MouseEvent, node: WorkspaceTreeNode): void {
    event.preventDefault();
    event.stopPropagation();
    setContextPosition({ x: event.clientX, y: event.clientY });
    setContextTarget({
      path: node.path,
      kind: node.kind,
      name: node.name,
    });
  }

  function openRootContextMenu(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    setContextPosition({ x: event.clientX, y: event.clientY });
    setContextTarget({ path: "", kind: "root", name: "Biblioteca" });
  }

  function canDrop(targetParent: string): boolean {
    const source = draggingPath();
    if (!source || source === targetParent) return false;
    const sourceNode = findNode(props.nodes, source);
    if (
      sourceNode?.kind === "directory" &&
      (targetParent === source || targetParent.startsWith(`${source}/`))
    ) {
      return false;
    }
    return true;
  }

  function handleDragStart(event: DragEvent, node: WorkspaceTreeNode): void {
    setDraggingPath(node.path);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-xenner-entry", node.path);
      event.dataTransfer.setData("text/plain", node.path);
    }
  }

  function handleDragEnd(): void {
    setDraggingPath(null);
    setDropTarget(null);
  }

  function handleDragOver(event: DragEvent, targetParent: string): void {
    if (!canDrop(targetParent)) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropTarget(targetParent);
  }

  function handleExplorerKeyDown(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const selected = props.selectedPath ? findNode(props.nodes, props.selectedPath) : null;
    const command = event.ctrlKey || event.metaKey;
    if (event.key === "F2" && selected) {
      event.preventDefault();
      props.onRename(selected.path);
      return;
    }
    if (event.key === "Delete" && selected) {
      event.preventDefault();
      props.onDelete(selected.path);
      return;
    }
    if (!command) return;
    if (event.key.toLowerCase() === "c" && selected?.kind === "note") {
      event.preventDefault();
      props.onCopyMarkdown(selected.path);
    } else if (event.key.toLowerCase() === "x" && selected) {
      event.preventDefault();
      props.onCut(selected.path);
    } else if (event.key.toLowerCase() === "v" && props.canPaste) {
      event.preventDefault();
      const parent = selected?.kind === "directory"
        ? selected.path
        : selected?.path.includes("/")
          ? selected.path.slice(0, selected.path.lastIndexOf("/"))
          : "";
      props.onPaste(parent);
    }
  }

  function handleDrop(event: DragEvent, targetParent: string): void {
    if (!canDrop(targetParent)) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const source = draggingPath();
    setDraggingPath(null);
    setDropTarget(null);
    if (source) props.onMove(source, targetParent);
  }

  const nodeHandlers = {
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onContextMenu: openContextMenu,
  };

  return (
    <>
      <div
        class={`${styles.tree} ${dropTarget() === "" ? styles.dropRoot : ""}`}
        role="tree"
        aria-label="Explorador de notas"
        onKeyDown={handleExplorerKeyDown}
        onContextMenu={openRootContextMenu}
        onDragOver={(event) => handleDragOver(event, "")}
        onDrop={(event) => handleDrop(event, "")}
      >
        <For each={props.nodes}>
          {(node) => (
            <ExplorerNode
              {...props}
              {...nodeHandlers}
              node={node}
              depth={0}
              draggingPath={draggingPath}
              dropTarget={dropTarget}
            />
          )}
        </For>
      </div>
      <Show when={contextTarget()} keyed>
        {(target) => (
          <ExplorerContextMenu
            target={target}
            x={contextPosition().x}
            y={contextPosition().y}
            canPaste={props.canPaste}
            onClose={closeContextMenu}
            onCopyMarkdown={(path) => props.onCopyMarkdown(path)}
            onCut={(path) => props.onCut(path)}
            onPaste={(parent) => props.onPaste(parent)}
            onRename={(path) => props.onRename(path)}
            onDelete={(path) => props.onDelete(path)}
            onStartCreation={(kind, parent) => props.onStartCreation(kind, parent)}
          />
        )}
      </Show>
    </>
  );
}
