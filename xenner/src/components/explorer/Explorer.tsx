import { createSignal, For, Show } from "solid-js";

import type { WorkspaceTreeNode } from "../../types/workspace";
import { parentPath } from "../../workspace/tree";
import styles from "../../styles/components/Explorer.module.css";
import { ChevronIcon, FolderIcon, NoteIcon } from "../ui/Icons";
import { isDialogPending } from "../../services/dialogs";
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
  /**
   * La fila enfocada: una nota o una carpeta.
   *
   * No es la nota abierta en el editor —esa es otra cosa, y solo puede ser una
   * nota—. Es la fila sobre la que se ha hecho clic, y es la que decide dónde cae
   * lo nuevo: con una carpeta enfocada, «Nueva nota» y «Nueva carpeta» crean
   * dentro de ella. Es lo que hace el explorador de un solo clic, donde la
   * carpeta que elegiste se queda elegida.
   */
  focusedPath: string | null;
  expandedPaths: ReadonlySet<string>;
  creation: CreationDraft | null;
  busy: boolean;
  canPaste: boolean;
  onSelect(path: string): void;
  /** Enfoca una fila sin abrir nada: se usa al elegir una carpeta. */
  onFocus(path: string): void;
  onToggle(path: string): void;
  onStartCreation(kind: CreationKind, parent?: string): void;
  onSubmitCreation(name: string): void;
  onCancelCreation(): void;
  onRename(path: string): void;
  onDelete(path: string): void;
  onMove(path: string, targetParent: string): void;
  onCopyMarkdown(path: string): void;
  onCut(path: string): void;
  onPaste(parent: string): void;
  onShowHistory(path: string): void;
}

interface NodeProps extends ExplorerProps {
  node: WorkspaceTreeNode;
  depth: number;
  onDragStart(event: DragEvent, node: WorkspaceTreeNode): void;
  onDragEnd(): void;
  onDragOver(event: DragEvent, targetParent: string): void;
  onDrop(event: DragEvent, targetParent: string): void;
  onContextMenu(event: MouseEvent, node: WorkspaceTreeNode): void;
  /** Lo mismo, pero con coordenadas ya calculadas: para abrirlo desde el teclado. */
  onContextMenuAt(node: WorkspaceTreeNode, x: number, y: number): void;
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

/**
 * La carpeta donde cae lo pegado: la de la fila enfocada si es una carpeta, y la
 * que la contiene si es una nota.
 */
function parentOf(node: WorkspaceTreeNode | null): string {
  if (!node) return "";
  return node.kind === "directory" ? node.path : parentPath(node.path);
}

/**
 * Una fila del árbol: chevron, icono y nombre, nada más.
 *
 * Antes cada fila llevaba sus botones encima —crear, renombrar, borrar— que se
 * veían al pasar el ratón. Con el panel estrecho no cabían y tapaban el nombre,
 * que es justo lo que se viene a leer a una lista. Todo eso sigue existiendo,
 * pero en su sitio: el clic derecho (`ExplorerContextMenu`), los atajos
 * (`F2`, `Supr`, `Ctrl+C/X/V` abajo) y la paleta de comandos (`Ctrl+K`).
 */
function ExplorerNode(props: NodeProps) {
  const expanded = () => props.expandedPaths.has(props.node.path);
  const activeCreation = () =>
    props.creation?.parent === props.node.path ? props.creation : null;
  const hasCreation = () => activeCreation() !== null;
  const label = () => displayNodeName(props.node.name, props.node.kind);
  const selected = () => props.node.path === props.focusedPath;
  const isDropTarget = () => props.dropTarget() === props.node.path;
  const isDragging = () => props.draggingPath() === props.node.path;

  /** Las filas visibles, en orden: las carpetas plegadas no pintan hijas. */
  function visibleRows(button: HTMLButtonElement): HTMLButtonElement[] {
    const tree = button.closest('[role="tree"]');
    if (!tree) return [button];
    return [...tree.querySelectorAll<HTMLButtonElement>('[data-x="tree-row"] > button')];
  }

  /**
   * Moverse por la lista sin ratón. `Enter` y `Espacio` ya los pone el botón
   * (abren la nota o pliegan la carpeta); aquí van el resto: flechas para
   * subir, bajar, entrar y salir, e `Inicio`/`Fin` para los extremos.
   */
  function onRowKeyDown(event: KeyboardEvent): void {
    if (isDialogPending()) return;
    const button = event.currentTarget as HTMLButtonElement;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      const rows = visibleRows(button);
      const current = rows.indexOf(button);
      let next = current;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = rows.length - 1;
      else if (event.key === "ArrowDown") next = Math.min(rows.length - 1, current + 1);
      else next = Math.max(0, current - 1);
      event.preventDefault();
      rows[next]?.focus();
      return;
    }
    if (props.node.kind === "directory" && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      const open = expanded();
      if (event.key === "ArrowRight" && !open) {
        event.preventDefault();
        props.onToggle(props.node.path);
        return;
      }
      if (event.key === "ArrowRight" && open) {
        // La primera hija es la siguiente fila visible.
        event.preventDefault();
        const rows = visibleRows(button);
        rows[rows.indexOf(button) + 1]?.focus();
        return;
      }
      if (event.key === "ArrowLeft" && open) {
        event.preventDefault();
        props.onToggle(props.node.path);
        return;
      }
      // Plegada: salir a la carpeta que la contiene.
      event.preventDefault();
      const item = button.closest('[data-x="tree-item"]');
      const parentItem = item?.parentElement?.closest('[data-x="tree-item"]');
      parentItem
        ?.querySelector<HTMLButtonElement>(':scope > [data-x="tree-row"] > button')
        ?.focus();
      return;
    }
    // La tecla de menú contextual —o `Mayús+F10`— abre el menú de esta fila.
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      props.onContextMenuAt(props.node, rect.left + 48, rect.bottom + 4);
    }
  }

  return (
    <div
      class={styles.node}
      role="treeitem"
      data-x="tree-item"
      data-kind={props.node.kind}
      data-selected={selected() ? "true" : undefined}
      aria-expanded={props.node.kind === "directory" ? expanded() : undefined}
      /*
       * La carpeta entera —su fila y todo lo que cuelga debajo— es donde cae lo que
       * se suelta encima, y en una nota cae en la carpeta que la contiene. Es lo que
       * hace el explorador de un solo clic: apuntar a una subcarpeta mete el
       * elemento **en esa** subcarpeta, y apuntar a un archivo de dentro lo deja en
       * la carpeta de ese archivo. Antes los manejadores estaban en la fila, así
       * que lo que caía entre dos hijas —el hueco, el «Vacía»— se iba a la raíz.
       */
      onDragOver={(event) => {
        const destino = props.node.kind === "directory"
          ? props.node.path
          : parentPath(props.node.path);
        if (!destino) {
          // Una nota en la raíz: el destino es la raíz, que es lo que hay debajo.
          props.onDragOver(event, "");
          return;
        }
        props.onDragOver(event, destino);
      }}
      onDrop={(event) => {
        const destino = props.node.kind === "directory"
          ? props.node.path
          : parentPath(props.node.path);
        props.onDrop(event, destino);
      }}
    >
      <div
        class={`${styles.row} ${selected() ? styles.active : ""} ${isDropTarget() ? styles.dropTarget : ""} ${isDragging() ? styles.dragging : ""}`}
        data-x="tree-row"
        data-selected={selected() ? "true" : undefined}
        data-drop-target={isDropTarget() ? "true" : undefined}
        style={`--tree-depth: ${props.depth}`}
        onContextMenu={(event) => props.onContextMenu(event, props.node)}
      >
        <button
          type="button"
          class={styles.main}
          draggable={true}
          aria-grabbed={isDragging()}
          aria-label={props.node.kind === "directory" ? `Abrir carpeta ${label()}` : `Abrir nota ${label()}`}
          aria-current={selected() ? "page" : undefined}
          onClick={() => {
            /*
             * Elegir una carpeta la deja elegida y la abre o la cierra, que es lo
             * que pasa en cualquier explorador de un solo clic. Quedarse elegida es
             * lo que hace que «Nueva nota» caiga dentro de ella y no en la raíz.
             * Enfocarla no abre nada: una carpeta no se abre en el editor, así que
             * elegirla no puede tocar la nota que se está escribiendo.
             */
            if (props.node.kind === "directory") {
              props.onFocus(props.node.path);
              props.onToggle(props.node.path);
            } else props.onSelect(props.node.path);
          }}
          onKeyDown={onRowKeyDown}
          onDragStart={(event) => props.onDragStart(event, props.node)}
          onDragEnd={props.onDragEnd}
        >
          <span class={styles.chevron} data-x="tree-row-chevron">
            <Show when={props.node.kind === "directory"}>
              <ChevronIcon classList={{ [styles.rotated]: expanded() }} />
            </Show>
          </span>
          <span class={styles.icon} data-x="tree-row-icon">
            <Show when={props.node.kind === "directory"} fallback={<NoteIcon />}>
              <FolderIcon />
            </Show>
          </span>
          <span class={styles.name} data-x="tree-row-label">
            {label()}
          </span>
        </button>
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
    placeContextMenu(node, event.clientX, event.clientY);
  }

  function openContextMenuAt(node: WorkspaceTreeNode, x: number, y: number): void {
    placeContextMenu(node, x, y);
  }

  function placeContextMenu(node: WorkspaceTreeNode, x: number, y: number): void {
    setContextPosition({ x, y });
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
    // Con un diálogo encima, el foco sigue en la fila de la nota y estos atajos
    // se seguirían detrás: abrir «Renombrar» con F2 y pulsar Supr encolaba una
    // pregunta de borrar que nadie había pedido. Un Escape la hacía aparecer.
    if (isDialogPending()) return;
    // La fila enfocada, no la nota abierta: si lo que está resaltado es una
    // carpeta, `F2` la renombra a ella. Actuar sobre la nota abierta dejaría la
    // fila resaltada y lo que se renombra sin ninguna relación.
    const focused = props.focusedPath ? findNode(props.nodes, props.focusedPath) : null;
    const command = event.ctrlKey || event.metaKey;
    if (event.key === "F2" && focused) {
      event.preventDefault();
      props.onRename(focused.path);
      return;
    }
    if (event.key === "Delete" && focused) {
      event.preventDefault();
      props.onDelete(focused.path);
      return;
    }
    if (!command) return;
    if (event.key.toLowerCase() === "n") {
      // Sin destino: lo resuelve el controlador con la carpeta enfocada, que es
      // justo lo que hizo el menú contextual al abrirse sobre ella. Los dos caminos
      // tienen que crear en el mismo sitio o el atajo y el clic discrepan.
      event.preventDefault();
      props.onStartCreation(event.shiftKey ? "folder" : "note");
      return;
    }
    if (event.key.toLowerCase() === "h" && focused?.kind === "note") {
      event.preventDefault();
      props.onShowHistory(focused.path);
      return;
    }
    if (event.key.toLowerCase() === "c" && focused?.kind === "note") {
      event.preventDefault();
      props.onCopyMarkdown(focused.path);
    } else if (event.key.toLowerCase() === "x" && focused) {
      event.preventDefault();
      props.onCut(focused.path);
    } else if (event.key.toLowerCase() === "v" && props.canPaste) {
      event.preventDefault();
      props.onPaste(parentOf(focused));
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
    onContextMenuAt: openContextMenuAt,
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
            onShowHistory={(path) => props.onShowHistory(path)}
          />
        )}
      </Show>
    </>
  );
}
