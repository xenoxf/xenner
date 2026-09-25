import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeNoteTitle,
  noteTitleFromPath,
  serializeNoteContent,
  splitNoteContent,
} from "./note.ts";

test("separa el primer H1 y conserva el cuerpo", () => {
  assert.deepEqual(splitNoteContent("archivo.md", "# Otro título\n\nPrimera línea\n"), {
    title: "archivo",
    body: "Primera línea\n",
  });
});

test("el título siempre es el nombre del archivo", () => {
  assert.equal(noteTitleFromPath("Ideas.md"), "Ideas");
  assert.equal(noteTitleFromPath("Tema/ARCHIVO.MD"), "ARCHIVO");
  assert.equal(noteTitleFromPath("Dos  espacios.md"), "Dos  espacios");
  assert.deepEqual(splitNoteContent("Ideas.md", "Sin encabezado"), {
    title: "Ideas",
    body: "Sin encabezado",
  });
  assert.deepEqual(splitNoteContent("Sin título 2.md", "Texto"), {
    title: "Sin título 2",
    body: "Texto",
  });
});

test("serializa el título del archivo aunque el H1 sea antiguo", () => {
  assert.deepEqual(splitNoteContent("Sin título.md", "#\n\n"), {
    title: "Sin título",
    body: "",
  });
  assert.equal(serializeNoteContent("Sin título", "Contenido"), "# Sin título\n\nContenido");
});

test("normaliza saltos y longitud de título", () => {
  assert.equal(normalizeNoteTitle("  Hola\n  mundo  "), "Hola   mundo");
  assert.equal(normalizeNoteTitle("a".repeat(300)).length, 240);
});
