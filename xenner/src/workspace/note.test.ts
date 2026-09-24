import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeNoteTitle,
  serializeNoteContent,
  splitNoteContent,
} from "./note.ts";

test("separa el primer H1 como título y conserva el cuerpo", () => {
  assert.deepEqual(splitNoteContent("archivo.md", "# Mi nota\n\nPrimera línea\n"), {
    title: "Mi nota",
    body: "Primera línea\n",
  });
});

test("usa el nombre del archivo solo cuando no existe un H1", () => {
  assert.deepEqual(splitNoteContent("Ideas.md", "Sin encabezado"), {
    title: "Ideas",
    body: "Sin encabezado",
  });
  assert.deepEqual(splitNoteContent("Sin título 2.md", "Texto"), {
    title: "",
    body: "Texto",
  });
});

test("un H1 vacío conserva una página sin título", () => {
  assert.deepEqual(splitNoteContent("Sin título.md", "#\n\n"), {
    title: "",
    body: "",
  });
  assert.equal(serializeNoteContent("", "Contenido"), "# \n\nContenido");
});

test("normaliza saltos y longitud de título", () => {
  assert.equal(normalizeNoteTitle("  Hola\n  mundo  "), "Hola mundo");
  assert.equal(normalizeNoteTitle("a".repeat(300)).length, 240);
});
