import assert from "node:assert/strict";
import { test } from "node:test";

import {
  foldForSearch,
  indexNotesForSearch,
  NOTE_SEARCH_LIMIT,
  rankSearchNotes,
  type NoteSearchEntry,
} from "./search.ts";
import type { WorkspaceTreeNode } from "../types/workspace.ts";

/**
 * Lo que se comprueba es el contrato de la paleta: que buscar no entienda de
 * tildes ni de mayúsculas, que lo que empieza por lo escrito salga antes que lo
 * que solo lo contiene, y que una biblioteca grande no reviente el menú.
 */

function entry(path: string, title?: string): NoteSearchEntry {
  return { path, title: title ?? path.split("/").pop()!.replace(/\.md$/i, "") };
}

function tree(): WorkspaceTreeNode[] {
  const note = (path: string, name: string): WorkspaceTreeNode => ({
    kind: "note",
    path,
    name,
    children: [],
  });
  return [
    {
      kind: "directory",
      path: "Viajes",
      name: "Viajes",
      children: [note("Viajes/Lisboa.md", "Lisboa.md"), note("Viajes/reunión.md", "reunión.md")],
    },
    note("ideas.md", "ideas.md"),
  ];
}

test("plegar ignora tildes y mayúsculas", () => {
  assert.equal(foldForSearch("Reunión"), "reunion");
  assert.equal(foldForSearch("VIAJE"), "viaje");
});

test("el índice saca las notas con el título sin extensión", () => {
  const indexed = indexNotesForSearch(tree());
  assert.deepEqual(
    indexed.map((item) => item.title).sort(),
    ["Lisboa", "ideas", "reunión"],
  );
  assert.ok(indexed.every((item) => item.path.endsWith(".md")));
});

test("sin búsqueda salen todas por orden de ruta", () => {
  const paths = rankSearchNotes(
    [entry("b.md"), entry("a.md"), entry("c.md")],
    "",
  ).map((item) => item.path);
  assert.deepEqual(paths, ["a.md", "b.md", "c.md"]);
});

test("lo que empieza por lo escrito sale antes", () => {
  const paths = rankSearchNotes(
    [entry("viaje-largo.md", "mi viaje largo"), entry("viaje.md")],
    "viaje",
  ).map((item) => item.path);
  assert.deepEqual(paths, ["viaje.md", "viaje-largo.md"]);
});

test("encuentra por palabra intermedia y por carpeta", () => {
  const entries = [entry("Viajes/Lisboa.md", "Lisboa"), entry("ideas.md")];
  assert.deepEqual(
    rankSearchNotes(entries, "lis").map((item) => item.path),
    ["Viajes/Lisboa.md"],
  );
  assert.deepEqual(
    rankSearchNotes(entries, "viajes").map((item) => item.path),
    ["Viajes/Lisboa.md"],
  );
  assert.deepEqual(rankSearchNotes(entries, "zzz"), []);
});

test("la búsqueda no entiende de tildes", () => {
  const entries = [entry("Viajes/reunión.md", "reunión")];
  assert.deepEqual(
    rankSearchNotes(entries, "reunion").map((item) => item.path),
    ["Viajes/reunión.md"],
  );
});

test("nunca devuelve más del límite", () => {
  const entries = Array.from({ length: NOTE_SEARCH_LIMIT + 20 }, (_, index) =>
    entry(`nota-${index}.md`),
  );
  assert.equal(rankSearchNotes(entries, "").length, NOTE_SEARCH_LIMIT);
});
