import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceTree,
  countTreeNotes,
  isPathInside,
  parentPath,
  replacePathName,
} from "./tree.ts";
import type { VaultEntry } from "../types/workspace.ts";

const entries: VaultEntry[] = [
  {
    path: "zeta.md",
    name: "zeta.md",
    kind: "note",
    updatedAt: 1,
    size: 10,
  },
  {
    path: "Tema/Dos.md",
    name: "Dos.md",
    kind: "note",
    updatedAt: 2,
    size: 10,
  },
  {
    path: "Tema/uno.md",
    name: "uno.md",
    kind: "note",
    updatedAt: 3,
    size: 10,
  },
  {
    path: "Tema",
    name: "Tema",
    kind: "directory",
    updatedAt: 4,
    size: null,
  },
  {
    path: "Alfa",
    name: "Alfa",
    kind: "directory",
    updatedAt: 5,
    size: null,
  },
];

test("construye un árbol jerárquico y ordena carpetas antes que notas", () => {
  const tree = buildWorkspaceTree(entries);
  assert.deepEqual(
    tree.map((node) => node.name),
    ["Alfa", "Tema", "zeta.md"],
  );
  assert.deepEqual(
    tree[1].children.map((node) => node.name),
    ["Dos.md", "uno.md"],
  );
  assert.equal(countTreeNotes(tree), 3);
});

test("oculta la carpeta interna de assets", () => {
  const tree = buildWorkspaceTree([
    {
      path: "Tema/.assets",
      name: ".assets",
      kind: "directory",
      updatedAt: null,
      size: null,
    },
    {
      path: "Tema/.assets/dibujo.svg",
      name: "dibujo.svg",
      kind: "directory",
      updatedAt: null,
      size: null,
    },
    ...entries,
  ]);
  assert.equal(
    tree.some((node) => node.path.split("/").includes(".assets")),
    false,
  );
});

test("mantiene una entrada huérfana visible en la raíz", () => {
  const tree = buildWorkspaceTree([
    {
      path: "Ausente/nota.md",
      name: "nota.md",
      kind: "note",
      updatedAt: null,
      size: null,
    },
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, "nota.md");
});

test("resuelve rutas y contención de forma portable", () => {
  assert.equal(parentPath("Tema/Sub/nota.md"), "Tema/Sub");
  assert.equal(parentPath("nota.md"), "");
  assert.equal(replacePathName("Tema/nota.md", "Renombrada.md"), "Tema/Renombrada.md");
  assert.equal(isPathInside("Tema/Sub/nota.md", "Tema"), true);
  assert.equal(isPathInside("Temas/nota.md", "Tema"), false);
  assert.equal(isPathInside("nota.md", ""), true);
});
