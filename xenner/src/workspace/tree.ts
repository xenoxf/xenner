import type { EntryKind, VaultEntry } from "./types";

export interface WorkspaceTreeNode extends VaultEntry {
  children: WorkspaceTreeNode[];
}

const collator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

export function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function replacePathName(path: string, name: string): string {
  return joinPath(parentPath(path), name);
}

export function isPathInside(candidate: string, parent: string): boolean {
  return parent === "" || candidate === parent || candidate.startsWith(`${parent}/`);
}

export function countTreeNotes(nodes: WorkspaceTreeNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.kind === "note" ? 1 : countTreeNotes(node.children)),
    0,
  );
}

export function buildWorkspaceTree(entries: VaultEntry[]): WorkspaceTreeNode[] {
  const roots: WorkspaceTreeNode[] = [];
  const byPath = new Map<string, WorkspaceTreeNode>();

  for (const entry of entries) {
    if (entry.path.split("/").includes(".assets")) continue;
    if (byPath.has(entry.path)) continue;
    byPath.set(entry.path, { ...entry, children: [] });
  }

  for (const node of byPath.values()) {
    const parent = parentPath(node.path);
    if (parent && byPath.has(parent)) {
      byPath.get(parent)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: WorkspaceTreeNode[]): void => {
    nodes.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return collator.compare(left.name, right.name);
    });
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  return roots;
}

export function flattenTree(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

export function nodeKindForName(name: string): EntryKind {
  return name.toLocaleLowerCase("es").endsWith(".md") ? "note" : "directory";
}
