import { noteTitleFromPath } from "./note.ts";
import type { WorkspaceTreeNode } from "../types/workspace.ts";

const DIACRITICS = /\p{Diacritic}/gu;
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Cuántos resultados enseña la paleta como mucho. */
export const NOTE_SEARCH_LIMIT = 50;

export interface NoteSearchEntry {
  path: string;
  title: string;
}

/**
 * Plegar para buscar: sin acentos y en minúsculas, de modo que «viaje»
 * encuentre «Viaje» y «reunion» encuentre «Reunión».
 *
 * Es la misma regla que usa el buscador del móvil (`MobileSearchBar`): vive
 * aquí para que el escritorio y el móvil busquen igual sin copiarse el código.
 */
export function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS, "").toLocaleLowerCase("es");
}

/** Todas las notas del árbol, con el título ya listo para buscar y enseñar. */
export function indexNotesForSearch(nodes: WorkspaceTreeNode[]): NoteSearchEntry[] {
  const entries: NoteSearchEntry[] = [];
  const visit = (node: WorkspaceTreeNode): void => {
    if (node.kind === "note") {
      entries.push({ path: node.path, title: noteTitleFromPath(node.path) });
    }
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return entries;
}

/**
 * Dónde encaja la búsqueda en el título: al principio, al principio de una
 * palabra, dentro, o solo en la carpeta. Cuanto más bajo, mejor encaje.
 */
function matchRank(foldedTitle: string, foldedPath: string, query: string): number {
  if (foldedTitle.startsWith(query)) return 0;
  if (foldedTitle.split(/[\s_/-]+/).some((word) => word.startsWith(query))) return 1;
  if (foldedTitle.includes(query)) return 2;
  if (foldedPath.includes(query)) return 3;
  return -1;
}

/**
 * Las notas que encajan, ordenadas por encaje y luego por ruta. Sin búsqueda
 * devuelve todas por orden de ruta: es el «ir a» sin escribir nada. Siempre
 * acotado a `NOTE_SEARCH_LIMIT`, porque una biblioteca grande no se puede
 * pintar entera en un menú.
 */
export function rankSearchNotes(
  entries: readonly NoteSearchEntry[],
  query: string,
  limit = NOTE_SEARCH_LIMIT,
): NoteSearchEntry[] {
  const folded = foldForSearch(query.trim());
  if (!folded) {
    return [...entries].sort((left, right) => collator.compare(left.path, right.path)).slice(0, limit);
  }
  return entries
    .map((entry) => ({
      entry,
      rank: matchRank(foldForSearch(entry.title), foldForSearch(entry.path), folded),
    }))
    .filter((candidate) => candidate.rank >= 0)
    .sort(
      (left, right) =>
        left.rank - right.rank || collator.compare(left.entry.path, right.entry.path),
    )
    .map((candidate) => candidate.entry)
    .slice(0, limit);
}
